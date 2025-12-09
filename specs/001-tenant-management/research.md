# Research Document: Tenant Management

**Feature:** Tenant Management  
**Version:** 1.0.0  
**Date:** 2025-12-04  
**Status:** Complete

---

## Overview

This document consolidates research findings for technical decisions and best practices needed for the Tenant Management module implementation.

---

## Research Item 1: NestJS Guard Pattern for Tenant Isolation

### Decision
Implement a custom `TenantGuard` that:
1. Extracts `tenantId` from JWT token
2. Attaches it to request context (`req.user.tenantId`)
3. Validates resource access by comparing resource `tenantId` with authenticated user's `tenantId`

### Rationale
- **Centralized enforcement:** All protected routes automatically enforce tenant isolation
- **Type-safe:** TypeScript interfaces ensure `tenantId` is always available in request context
- **Auditable:** Single point of enforcement makes security reviews easier
- **Performance:** Runs once per request, minimal overhead

### Implementation Pattern

```typescript
// auth/tenant.guard.ts
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Set by JwtAuthGuard
    
    if (!user || !user.tenantId) {
      throw new UnauthorizedException('Tenant context not found');
    }
    
    // tenantId is now available in request.user.tenantId
    return true;
  }
}

// Service layer validation pattern
async getBranch(tenantId: string, branchId: string): Promise<Branch> {
  const branch = await this.prisma.branch.findUnique({
    where: { id: branchId }
  });
  
  if (!branch) {
    throw new NotFoundException('Branch not found');
  }
  
  if (branch.tenantId !== tenantId) {
    throw new ForbiddenException('Access denied');
  }
  
  return branch;
}
```

### Alternatives Considered
- **Prisma Middleware:** Automatic injection of `tenantId` filter
  - Rejected for v1: Too "magical", harder to debug, spec explicitly states this is optional
- **Custom Decorators:** `@TenantId()` parameter decorator
  - Accepted as complement: Useful for extracting tenantId in controllers

### Best Practices
- Always validate tenantId in service layer, not just guards
- Use TypeScript interfaces to enforce tenantId presence
- Log tenant isolation violations for security monitoring
- Never expose tenant IDs in URLs (use `/api/v1/tenants/current` pattern)

---

## Research Item 2: React Query Multi-Tenant Caching Strategy

### Decision
Use React Query with tenant-aware query keys:
- Include `tenantId` in all query keys: `['tenant', tenantId, 'branches']`
- Invalidate queries on tenant switch (if multi-tenant admin tool added later)
- Use 5-minute stale time for branch lists
- Use infinite stale time for tenant settings (rarely changes)

### Rationale
- **Cache isolation:** Different tenants' data never collide
- **Automatic updates:** Mutations invalidate correct queries
- **Performance:** Reduces unnecessary API calls
- **Simple:** React Query handles complexity

### Implementation Pattern

```typescript
// hooks/useTenant.ts
export function useCurrentTenant() {
  return useQuery({
    queryKey: ['tenant', 'current'],
    queryFn: () => api.getCurrentTenant(),
    staleTime: Infinity, // Tenant data rarely changes
    cacheTime: 1000 * 60 * 60, // 1 hour
  });
}

// hooks/useBranches.ts
export function useBranches(options: { page?: number; includeArchived?: boolean } = {}) {
  const { data: tenant } = useCurrentTenant();
  
  return useQuery({
    queryKey: ['tenant', tenant?.id, 'branches', options],
    queryFn: () => api.getBranches(options),
    enabled: !!tenant,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// hooks/useCreateBranch.ts
export function useCreateBranch() {
  const queryClient = useQueryClient();
  const { data: tenant } = useCurrentTenant();
  
  return useMutation({
    mutationFn: (data: CreateBranchDto) => api.createBranch(data),
    onSuccess: () => {
      // Invalidate all branch queries for this tenant
      queryClient.invalidateQueries(['tenant', tenant?.id, 'branches']);
    },
  });
}
```

### Alternatives Considered
- **Global state (Zustand/Redux):** Rejected - React Query better suited for server state
- **No caching:** Rejected - Poor performance, unnecessary API calls
- **Context API:** Rejected - Not designed for async server state

### Best Practices
- Always include tenant ID in query keys
- Use mutation callbacks to invalidate stale data
- Implement optimistic updates for better UX
- Use `enabled` option to prevent queries without tenant context

---

## Research Item 3: ISO 4217 Currency Code Validation

### Decision
Use manual validation with explicit whitelist of supported currencies.

### Rationale
- **Simple:** No additional dependencies
- **Control:** Explicit list of currencies gym system will support
- **Expandable:** Easy to add new currencies
- **Type-safe:** Use TypeScript union type for currency codes

### Implementation Pattern

```typescript
// constants/currencies.ts
export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 
  'JPY', 'CNY', 'INR', 'BRL', 'MXN',
  'ZAR', 'TRY', 'SGD', 'HKD', 'NZD'
] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export function isValidCurrencyCode(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(code as CurrencyCode);
}

// DTOs
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES, {
    message: 'Invalid currency code. Supported: USD, EUR, GBP, ...'
  })
  defaultCurrency?: CurrencyCode;
}
```

### Alternatives Considered
- **`currency-codes` npm package:** Adds dependency for simple validation
  - Rejected: Overkill for this use case
- **Full ISO 4217 list:** 180+ currencies, many irrelevant
  - Rejected: Most gyms use ~15 common currencies
- **No validation:** Trust client input
  - Rejected: Violates security principle

### Best Practices
- Start with common currencies, expand as needed
- Use TypeScript const assertion for type safety
- Provide clear error messages listing supported currencies
- Document currency addition process in README

---

## Research Item 4: CUID Performance and Indexing

### Decision
Use CUID as primary keys with PostgreSQL TEXT type and B-tree indexes.

### Rationale
- **Collision-resistant:** Better than UUID for distributed systems
- **Sortable:** CUIDs are chronologically sortable (unlike UUID v4)
- **Compact:** Shorter than UUIDs (25 chars vs 36)
- **Prisma native:** `@default(cuid())` built-in support

### Performance Characteristics
- **Index size:** TEXT indexes slightly larger than BIGINT but negligible at scale
- **Query speed:** B-tree indexes on TEXT perform well for equality and range queries
- **Insert speed:** No noticeable penalty vs BIGINT
- **At 10,000 tenants × 3 branches:** ~30KB index size, <1ms lookups

### Implementation Pattern

```prisma
model Tenant {
  id String @id @default(cuid())
  // ... other fields
  
  @@index([slug])
}

model Branch {
  id String @id @default(cuid())
  tenantId String
  // ... other fields
  
  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([tenantId, isActive])
  @@index([tenantId, isDefault])
}
```

### Alternatives Considered
- **UUID v4:** Not chronologically sortable
  - Rejected: CUIDs provide better ordering
- **Integer IDs:** Sequential, predictable, not globally unique
  - Rejected: Security concern (enumeration attacks), not distributed-safe
- **Snowflake IDs:** Complex to implement
  - Rejected: CUID is simpler and sufficient

### Best Practices
- Use composite indexes starting with `tenantId` for multi-tenant queries
- Keep CUID in `id` field, use `slug` for human-readable identifiers
- Never expose raw IDs in UI (use names/slugs instead)
- CUIDs safe to use in URLs (no special characters)

---

## Research Item 5: Explicit vs Automatic Tenant Scoping

### Decision
**For v1:** Use explicit tenantId filtering in all service layer queries. Prisma middleware is optional and deferred.

### Rationale
- **Visibility:** Explicit filters make tenant scoping obvious in code reviews
- **Control:** Easier to debug when queries are explicit
- **Flexibility:** Some queries may need to bypass tenant scoping (admin tools)
- **Spec alignment:** Spec states middleware is optional for initial implementation

### Implementation Pattern

```typescript
// Explicit filtering (preferred for v1)
async listBranches(tenantId: string, options: ListOptions) {
  return this.prisma.branch.findMany({
    where: {
      tenantId, // EXPLICIT
      isActive: options.includeArchived ? undefined : true,
    },
    skip: (options.page - 1) * options.limit,
    take: options.limit,
    orderBy: { name: 'asc' },
  });
}

// Middleware approach (future enhancement)
prisma.$use(async (params, next) => {
  if (TENANT_SCOPED_MODELS.includes(params.model)) {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = {
        ...params.args.where,
        tenantId: currentTenantId, // From async context
      };
    }
  }
  return next(params);
});
```

### When to Add Middleware
Consider adding Prisma middleware when:
- Codebase is stable and all tenant-scoped patterns are established
- Multiple developers have validated explicit approach works
- Need to add audit logging or metrics collection
- Test coverage is comprehensive enough to catch middleware bugs

### Best Practices
- **For now:** Explicit `tenantId` in every query
- Document tenant-scoped models in code comments
- Use TypeScript to enforce tenantId parameter in service methods
- Add integration tests that verify cross-tenant access fails

---

## Summary of Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| **Tenant Isolation** | Custom NestJS TenantGuard + explicit service validation | Centralized, auditable, type-safe |
| **React Query Caching** | Tenant-aware query keys with 5-min stale time | Cache isolation, automatic invalidation |
| **Currency Validation** | Manual whitelist of ~15 common currencies | Simple, no dependencies, expandable |
| **Primary Keys** | CUID with PostgreSQL TEXT + B-tree indexes | Collision-resistant, sortable, Prisma native |
| **Tenant Scoping** | Explicit filtering in v1, middleware optional later | Visibility, easier debugging, spec-aligned |

---

## Next Steps

1. ✅ Phase 0 complete - all technical unknowns resolved
2. → Phase 1: Generate data model, API contracts, and quickstart guide
3. → Phase 2: Implement backend (Prisma schema, services, controllers)
4. → Phase 3: Implement frontend (components, pages, API client)
5. → Phase 4: Testing and documentation

---

**End of Research Document**

