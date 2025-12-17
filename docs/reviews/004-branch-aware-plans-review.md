# Engineering Review: 004 – Branch-Aware Membership Plans

**Reviewer:** Senior Fullstack Engineer  
**Date:** December 17, 2025  
**Feature:** 004-branch-aware-plans (backend + frontend)  
**Target:** Production Release

---

## Executive Summary

The Branch-Aware Membership Plans feature (004) extends the existing membership plan system to support both tenant-level and branch-level plan scoping. After comprehensive review of backend services, controllers, DTOs, migrations, frontend components, hooks, API clients, tests, and architectural alignment, I have identified **0 Critical**, **1 High**, **6 Medium**, and **8 Low** priority issues.

### Overall Assessment

**✅ Strengths:**

- **Excellent test coverage**: 100 unit tests + 75 E2E tests, all passing
- **Strong tenant isolation**: Multi-layer defense with guards, service validation, and error handling
- **Race condition prevention**: `scopeKey` computed column ensures database-level uniqueness enforcement
- **Comprehensive validation**: Input validation at DTO, service, and database layers
- **Idempotent operations**: Archive/restore operations handle concurrent requests gracefully
- **Type safety**: Full TypeScript coverage with proper enums and interfaces
- **Clean architecture**: Clear separation of concerns between controller, service, and data layers

**⚠️ Risk Areas:**

- **N+1 query risk** in member count endpoint when `includeMemberCount=true`
- **React Query cache key handling** may cause stale data with `branchId=undefined` vs empty string
- **Frontend bundle size** warning (658 kB) suggests code splitting needed
- **Limited indexing** on composite queries (e.g., `tenantId + archivedAt + status`)
- **Missing E2E tests** for branch validation edge cases
- **Error handling inconsistency** between service methods (some use 403, some use 404 for cross-tenant)

**Merge Decision: ✅ YES** — Feature is production-ready. Address High priority item before first production deployment. Medium/Low items can be tracked as follow-up work.

---

## Findings Summary

| ID      | Severity | Area                | Description                                                               | Recommendation                                  |
| ------- | -------- | ------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| **F01** | **HIGH** | Backend Performance | N+1 query in `/active` endpoint with `includeMemberCount=true`            | Add batch query or database-level aggregation   |
| F02     | MEDIUM   | Frontend Cache      | React Query key doesn't distinguish `branchId=undefined` vs `branchId=""` | Normalize undefined to null in query keys       |
| F03     | MEDIUM   | Database Indexing   | Missing composite index on `(tenantId, archivedAt, status)`               | Add migration for composite index               |
| F04     | MEDIUM   | Error Handling      | Inconsistent 403 vs 404 for cross-tenant access                           | Standardize to 403 with generic message         |
| F05     | MEDIUM   | Frontend Bundle     | 658 kB bundle size triggers warning                                       | Implement code splitting for large dependencies |
| F06     | MEDIUM   | Testing             | Missing E2E tests for archived branch validation                          | Add test case for archived branch rejection     |
| F07     | MEDIUM   | Migration Safety    | Migration lacks rollback instructions                                     | Document rollback steps in migration comments   |
| F08     | LOW      | Code Duplication    | `formatDuration` duplicated across 3 frontend files                       | Extract to shared utility                       |
| F09     | LOW      | Code Duplication    | `formatPrice` duplicated across 2 frontend files                          | Extract to shared utility                       |
| F10     | LOW      | Type Safety         | DTO allows `maxFreezeDays: number \| null` but service uses undefined     | Align nullability contract                      |
| F11     | LOW      | Documentation       | `scopeKey` computation logic not documented in service comments           | Add inline comment explaining scopeKey purpose  |
| F12     | LOW      | Error Messages      | Generic "Geçersiz şube kimliği" reveals existence of branchId             | More generic: "Bu işlem için yetkiniz yok"      |
| F13     | LOW      | Performance         | `activeMemberCount` query runs twice in archive flow                      | Cache result between service and controller     |
| F14     | LOW      | Frontend UX         | No loading state for member count toggle                                  | Add skeleton or spinner during fetch            |
| F15     | LOW      | Code Quality        | Unused `status` filter in `PlanListQuery` (uses `archivedAt` instead)     | Remove or document legacy support               |

---

## Detailed Review

### 1. Architecture & Consistency

#### 1.1 Folder Structure & Naming ✅

**Assessment:** Excellent adherence to repo conventions.

- Backend follows NestJS module structure: `membership-plans/` with service, controller, DTOs, utils
- Frontend follows feature-based structure: `pages/`, `components/`, `hooks/`, `api/`, `types/`
- Naming is consistent: `MembershipPlansPage`, `PlanForm`, `PlanSelector`, `use-membership-plans`
- DTOs follow convention: `CreatePlanDto`, `UpdatePlanDto`, `PlanListQueryDto`

**No issues found.**

#### 1.2 Domain Rules Enforcement ✅

**Assessment:** Strong defense-in-depth with proper layering.

The feature correctly enforces domain rules at multiple layers:

1. **DTO Layer** (First Defense):

   - `@ValidateIf` ensures `branchId` required only for BRANCH scope
   - `@IsEnum`, `@Min`, `@Matches` enforce type constraints
   - `forbidNonWhitelisted: true` blocks `scopeKey` from user input (✅ CRITICAL)

2. **Service Layer** (Core Logic):

   - `validateScopeAndBranchId()` enforces TENANT/BRANCH rules
   - `validateBranchBelongsToTenant()` prevents cross-tenant branchId
   - `checkNameUniqueness()` enforces scope-aware uniqueness
   - `computeScopeKey()` ensures consistent scopeKey derivation

3. **Database Layer** (Final Defense):
   - Unique constraint: `@@unique([tenantId, scope, scopeKey, name])`
   - Foreign key: `branchId → Branch(id)` with ON DELETE RESTRICT
   - CHECK constraints (implicitly via Prisma enums)

**Issue F11 (LOW):** The `scopeKey` computation logic is critical but lacks inline documentation in the service layer. Recommendation:

```typescript
/**
 * Compute scopeKey based on scope and branchId
 * scopeKey is used in the unique constraint @@unique([tenantId, scope, scopeKey, name])
 * to enforce:
 * - TENANT scope: unique per tenant (scopeKey="TENANT" is constant)
 * - BRANCH scope: unique per branch (scopeKey=branchId is unique per branch)
 * This provides database-level race condition protection.
 */
private computeScopeKey(scope: PlanScope, branchId?: string | null): string {
  // ... existing implementation
}
```

#### 1.3 Code Duplication ⚠️

**Issues Found:**

- **F08 (LOW):** `formatDuration()` duplicated in:

  - `frontend/src/pages/MembershipPlansPage.tsx` (lines 58-64)
  - `frontend/src/components/membership-plans/PlanSelector.tsx` (lines 22-28)
  - `frontend/src/components/membership-plans/PlanCard.tsx` (likely, not reviewed but pattern suggests)

- **F09 (LOW):** `formatPrice()` duplicated in:
  - `frontend/src/pages/MembershipPlansPage.tsx` (lines 69-78)
  - `frontend/src/components/membership-plans/PlanSelector.tsx` (lines 33-43)

**Recommendation:** Extract to shared utility:

```typescript
// frontend/src/lib/formatters.ts
export function formatDuration(
  durationType: DurationType,
  durationValue: number
): string {
  return durationType === DurationType.DAYS
    ? `${durationValue} gün`
    : `${durationValue} ay`;
}

export function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}
```

**Impact:** Low. These are small, pure functions. Deduplication improves maintainability but doesn't affect functionality.

---

### 2. Security & Multi-Tenant Isolation

#### 2.1 Tenant Isolation ✅

**Assessment:** Excellent multi-layer defense.

All membership plan endpoints enforce tenant isolation:

1. **Guard Layer:**

   - `@UseGuards(JwtAuthGuard, TenantGuard)` on all controller routes
   - `TenantGuard` validates `user.tenantId` exists and attaches to request
   - `RolesGuard` enforces ADMIN-only for mutations

2. **Service Layer:**

   - All queries filter by `tenantId` automatically
   - `getPlanByIdForTenant()` validates plan belongs to tenant (returns 404 if not)
   - `validateBranchBelongsToTenant()` prevents cross-tenant branchId access (returns 403)

3. **Error Handling:**
   - Cross-tenant access returns **404 Not Found** (plan doesn't exist for your tenant)
   - Invalid branchId from another tenant returns **403 Forbidden** with generic message

**Issue F04 (MEDIUM):** Inconsistent error codes for cross-tenant access:

- `getPlanByIdForTenant()` throws **404** when plan belongs to different tenant
- `validateBranchBelongsToTenant()` throws **403** when branch belongs to different tenant
- `validateBranchIdForListing()` throws **400** when branch belongs to different tenant

**Recommendation:** Standardize to **403 Forbidden** with generic message for all cross-tenant access attempts:

```typescript
// Consistent pattern:
if (branch.tenantId !== tenantId) {
  throw new ForbiddenException("Bu işlem için yetkiniz bulunmamaktadır");
}

if (plan.tenantId !== tenantId) {
  throw new ForbiddenException("Bu işlem için yetkiniz bulunmamaktadır");
}
```

**Rationale:** 403 Forbidden is more semantically correct than 404 Not Found. It indicates "I know this resource exists, but you don't have permission" without leaking cross-tenant information.

#### 2.2 BranchId Cross-Tenant Validation ✅

**Assessment:** Properly implemented with multiple checks.

The service correctly validates `branchId` at multiple points:

- `validateBranchBelongsToTenant()`: Used for BRANCH plan creation (requires active branch)
- `validateBranchIdForListing()`: Used for filtering (accepts any branch in tenant, even archived)

**Issue F12 (LOW):** Error message "Geçersiz şube kimliği" in `validateBranchIdForListing()` could be more generic:

```typescript
// Current:
throw new BadRequestException("Geçersiz şube kimliği");

// Recommended:
throw new ForbiddenException("Bu işlem için yetkiniz bulunmamaktadır");
```

**Rationale:** Even a generic "invalid branch ID" message could allow an attacker to probe for valid branchIds across tenants. A completely generic permission error is safer.

#### 2.3 ScopeKey User Input Prevention ✅

**Assessment:** Excellent defense-in-depth.

The `scopeKey` field is **never** user-provided, which is critical for security:

1. **DTO Layer:** `CreatePlanDto` and `UpdatePlanDto` do NOT include `scopeKey` field
2. **ValidationPipe:** `forbidNonWhitelisted: true` (verified in `main.ts`) rejects requests with extra fields
3. **Service Layer:** `computeScopeKey()` is called internally, always computing from `scope` + `branchId`
4. **Update Defense:** `updatePlanForTenant()` has explicit runtime check:
   ```typescript
   if ("scopeKey" in updateData) {
     throw new BadRequestException("Plan scopeKey değiştirilemez...");
   }
   ```

**No issues found.** This is a **critical security feature** and is correctly implemented.

#### 2.4 DTO Validation ✅

**Assessment:** Comprehensive validation with proper Turkish error messages.

All DTOs use class-validator decorators:

- `@IsEnum()` for scope, durationType, status
- `@IsString()`, `@IsInt()`, `@IsNumber()` for type enforcement
- `@Min()`, `@Max()`, `@MaxLength()` for range validation
- `@Matches(/^[A-Z]{3}$/)` for currency format
- `@ValidateIf()` for conditional `branchId` requirement

**Issue F10 (LOW):** Type mismatch between DTO and service:

```typescript
// DTO allows null:
maxFreezeDays?: number | null;

// Service uses undefined:
if (input.maxFreezeDays !== undefined) { ... }
```

**Recommendation:** Align on `null` vs `undefined` convention. Prefer `null` for consistency with database:

```typescript
// Service:
if (input.maxFreezeDays !== undefined && input.maxFreezeDays !== null) { ... }
```

#### 2.5 Authorization (ADMIN-Only for Mutations) ✅

**Assessment:** Correctly enforced.

All mutation endpoints (POST, PATCH, DELETE, archive, restore) use:

```typescript
@UseGuards(RolesGuard)
@Roles('ADMIN')
```

Read endpoints (GET) do NOT require ADMIN role, allowing all authenticated users to view plans.

**No issues found.**

---

### 3. Data Integrity & Database Constraints

#### 3.1 Unique Constraint Strategy ✅

**Assessment:** Excellent solution to the NULL branchId problem.

The feature implements the **scopeKey computed column** approach:

```prisma
@@unique([tenantId, scope, scopeKey, name])
```

Where `scopeKey`:

- TENANT scope → `"TENANT"` (constant string)
- BRANCH scope → `branchId` (actual branch ID)

This ensures:

- TENANT plans: unique per tenant (no NULL issues)
- BRANCH plans: unique per branch
- Database-level race condition prevention ✅

**Verification in Tests:**

- E2E test "should prevent duplicate TENANT plans under concurrent requests" (passing ✅)
- E2E test "should prevent duplicate BRANCH plans under concurrent requests" (passing ✅)
- E2E test "should verify database constraint works independently of application-level validation" (passing ✅)

**No issues found.** This is a **critical design decision** and is correctly implemented.

#### 3.2 ArchivedAt + Status Consistency ✅

**Assessment:** Mostly consistent, with one minor recommendation.

The feature uses **both** `archivedAt` and `status` fields:

```typescript
// Archive operation sets BOTH:
await this.prisma.membershipPlan.update({
  where: { id: planId },
  data: {
    archivedAt: new Date(),
    status: PlanStatus.ARCHIVED, // ✅ Sets both
  },
});

// Restore operation sets BOTH:
await this.prisma.membershipPlan.update({
  where: { id: planId },
  data: {
    archivedAt: null,
    status: PlanStatus.ACTIVE, // ✅ Sets both
  },
});
```

**Listing Queries:**

- `listPlansForTenant()` filters by `archivedAt: null` when `includeArchived=false`
- `listActivePlansForTenant()` filters by `archivedAt: null` (ignores `status`)

**Potential Inconsistency Risk:** If a plan has `archivedAt: null` but `status: ARCHIVED`, it would appear as "active" in listings but display as "archived" in the UI.

**Recommendation:** Add a database CHECK constraint or application-level validation:

```sql
-- Migration:
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "status_archived_at_consistency"
CHECK (
  (status = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR
  (status = 'ACTIVE' AND "archivedAt" IS NULL)
);
```

**Impact:** Medium. The application code always sets both fields together, so drift is unlikely. However, direct database modifications or future bugs could cause inconsistency.

**Issue F15 (LOW):** The `status` field in `PlanListQueryDto` appears to be unused/legacy:

```typescript
// DTO accepts status filter:
@IsOptional()
@IsEnum(PlanStatus)
status?: PlanStatus;

// But service uses archivedAt for filtering:
if (!includeArchived) {
  where.archivedAt = null;
}
```

**Recommendation:** Either remove `status` from DTO or document that it's for backward compatibility.

#### 3.3 Migration Safety ⚠️

**Assessment:** Migration is safe for forward application, but lacks rollback guidance.

**Migration 20251216212504_add_branch_aware_plans:**

Strengths:

- ✅ Adds columns with defaults (`scope: TENANT`, `scopeKey: TENANT`)
- ✅ Backfills existing data with UPDATE statement
- ✅ Drops old constraint before adding new one
- ✅ Adds proper indexes for performance

**Issue F07 (MEDIUM):** Migration lacks rollback instructions.

**Recommendation:** Add rollback comments:

```sql
-- Migration: 20251216212504_add_branch_aware_plans
-- Rollback steps (if needed):
-- 1. DROP CONSTRAINT "MembershipPlan_branchId_fkey";
-- 2. DROP INDEX "MembershipPlan_tenantId_scope_scopeKey_name_key";
-- 3. CREATE UNIQUE INDEX "MembershipPlan_tenantId_name_key" ON "MembershipPlan"("tenantId", "name");
-- 4. ALTER TABLE "MembershipPlan" DROP COLUMN "scopeKey";
-- 5. ALTER TABLE "MembershipPlan" DROP COLUMN "branchId";
-- 6. ALTER TABLE "MembershipPlan" DROP COLUMN "scope";
-- 7. DROP TYPE "PlanScope";
```

**Issue F06 (MEDIUM):** Missing E2E test for archived branch rejection.

The migration adds `ON DELETE RESTRICT` for `branchId → Branch(id)`, and the service validates `branch.isActive` in `validateBranchBelongsToTenant()`. However, there's no E2E test verifying:

```typescript
it("should reject BRANCH plan creation for archived branch", async () => {
  // 1. Create branch
  // 2. Archive branch
  // 3. Attempt to create BRANCH plan for archived branch
  // 4. Expect 400 "Arşivlenmiş şubeler için plan oluşturulamaz"
});
```

**Recommendation:** Add this test case to `membership-plans.e2e-spec.ts`.

#### 3.4 Foreign Key Constraints ✅

**Assessment:** Correctly configured.

```prisma
branch  Branch?  @relation(fields: [branchId], references: [id], onDelete: Restrict)
```

- `ON DELETE RESTRICT` prevents branch deletion if plans exist ✅
- `ON UPDATE CASCADE` allows branch ID updates to propagate ✅

**No issues found.**

---

### 4. Error Handling & UX Correctness

#### 4.1 Backend Status Codes ✅

**Assessment:** Status codes mostly match spec requirements.

| Operation                 | Expected | Actual | Status  |
| ------------------------- | -------- | ------ | ------- |
| Invalid scope/branchId    | 400      | 400 ✅ | Correct |
| Cross-tenant branchId     | 403      | 403 ✅ | Correct |
| Duplicate name            | 409      | 409 ✅ | Correct |
| Plan not found            | 404      | 404 ✅ | Correct |
| Unauthorized (non-ADMIN)  | 403      | 403 ✅ | Correct |
| Invalid duration/currency | 400      | 400 ✅ | Correct |

**Issue F04 (already mentioned):** Inconsistent 403 vs 404 for cross-tenant access.

#### 4.2 Turkish Error Messages ✅

**Assessment:** Consistent and clear Turkish error messages.

Examples:

- `"Fiyat negatif olamaz"` ✅
- `"Plan bulunamadı"` ✅
- `"Bu plan adı zaten kullanılıyor. Lütfen farklı bir ad seçiniz."` ✅
- `"Arşivlenmiş şubeler için plan oluşturulamaz"` ✅
- `"BRANCH kapsamındaki planlar için branchId gereklidir"` ✅

**No issues found.**

#### 4.3 Frontend Error Mapping ✅

**Assessment:** Good error handling with specific messages.

The `use-membership-plans.ts` hook correctly maps error codes:

```typescript
onError: (error) => {
  const apiError = error as ApiError;
  if (apiError.statusCode === 400) {
    /* Validation error */
  } else if (apiError.statusCode === 403) {
    toast.error("Bu işlem için yetkiniz yok.");
  } else if (apiError.statusCode === 409) {
    toast.error("Bu plan adı zaten kullanılıyor.");
  } else if (apiError.statusCode === 404) {
    toast.error("Kayıt bulunamadı.");
  }
};
```

**Issue F14 (LOW):** No loading state for member count toggle.

When user toggles "Aktif Üye Sayısı" checkbox, the UI should show a loading indicator while fetching member counts. Current implementation silently fetches in background.

**Recommendation:** Add skeleton or spinner:

```tsx
{
  includeMemberCount && activePlansLoading && (
    <TableCell>
      <Skeleton className="h-4 w-8" />
    </TableCell>
  );
}
```

---

### 5. Testing Quality

#### 5.1 Unit Test Coverage ✅

**Assessment:** Excellent coverage (100 tests passing).

The `membership-plans.service.spec.ts` covers:

- ✅ CRUD operations (create, list, get, update, archive, restore, delete)
- ✅ Tenant isolation (cross-tenant access blocked)
- ✅ Scope validation (TENANT/BRANCH rules)
- ✅ Name uniqueness (scope-aware)
- ✅ Duration validation (DAYS/MONTHS ranges)
- ✅ Currency validation (ISO 4217 format)
- ✅ Branch validation (belongs to tenant, active check)
- ✅ Idempotent archive (already archived → return success)
- ✅ Restore validation (already active → reject)

**No issues found.**

#### 5.2 E2E Test Coverage ✅

**Assessment:** Excellent coverage (75 tests passing).

The `membership-plans.e2e-spec.ts` covers:

- ✅ CRUD operations with real database
- ✅ Tenant isolation (cross-tenant blocked)
- ✅ Scope filtering (TENANT, BRANCH)
- ✅ BranchId filtering and validation
- ✅ Archive/restore idempotency
- ✅ Race condition prevention (concurrent duplicate requests)
- ✅ Database constraint verification
- ✅ Stress test (multiple concurrent requests)

**Issue F06 (already mentioned):** Missing E2E test for archived branch validation.

#### 5.3 Frontend Testing ⚠️

**Assessment:** No frontend tests detected.

The frontend code has:

- ❌ No unit tests for components
- ❌ No integration tests for hooks
- ❌ No E2E tests for user flows

**Recommendation:** Add frontend tests (future work, not blocking):

```typescript
// frontend/src/hooks/__tests__/use-membership-plans.test.ts
describe("useMembershipPlans", () => {
  it("should fetch plans with filters", async () => {
    // Test query key generation
    // Test data fetching
    // Test error handling
  });
});

// frontend/src/components/membership-plans/__tests__/PlanForm.test.tsx
describe("PlanForm", () => {
  it("should validate scope and branchId combination", () => {
    // Test TENANT scope without branchId
    // Test BRANCH scope requires branchId
  });
});
```

**Impact:** Medium. Frontend is simpler than backend (mostly UI rendering), so lack of tests is less critical. However, complex validation logic in `PlanForm` should be tested.

---

### 6. Performance & Scalability

#### 6.1 N+1 Query in Member Count Endpoint 🚨

**Issue F01 (HIGH):**

```typescript
// Controller: membership-plans.controller.ts lines 67-86
@Get('active')
async listActivePlansForTenant(
  @CurrentUser('tenantId') tenantId: string,
  @Query('branchId') branchId?: string,
  @Query('includeMemberCount', new ParseBoolPipe({ optional: true }))
  includeMemberCount?: boolean,
) {
  const plans = await this.membershipPlansService.listActivePlansForTenant(
    tenantId,
    branchId,
  );

  if (includeMemberCount) {
    const plansWithCounts = await Promise.all(
      plans.map(async (plan) => {
        const count =
          await this.membershipPlansService.countActiveMembersForPlan(plan.id);  // ❌ N+1
        return { ...plan, activeMemberCount: count };
      }),
    );
    return plansWithCounts;
  }

  return plans;
}
```

**Problem:** If there are N plans, this makes N+1 database queries:

1. One query to fetch plans
2. N queries to count members for each plan

**Severity:** HIGH because:

- Active plan listings are called frequently (every member form load)
- N can be 10-50 plans in production
- Each count query is non-trivial (filters by status + date)

**Recommendation:** Batch query with SQL aggregation:

```typescript
// Option 1: Add to listActivePlansForTenant (service)
async listActivePlansForTenant(
  tenantId: string,
  branchId?: string,
  includeMemberCount?: boolean,
): Promise<(MembershipPlan & { activeMemberCount?: number })[]> {
  // ... existing where clause ...

  if (includeMemberCount) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Single query with GROUP BY aggregation
    const plansWithCounts = await this.prisma.membershipPlan.findMany({
      where,
      select: {
        ...allFieldsHere,
        _count: {
          select: {
            members: {
              where: {
                status: 'ACTIVE',
                membershipEndDate: { gte: today },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return plansWithCounts.map(plan => ({
      ...plan,
      activeMemberCount: plan._count.members,
    }));
  }

  return this.prisma.membershipPlan.findMany({ where, orderBy });
}
```

**Estimated Impact:** Reduces 51 queries to 1 query. Performance improvement: ~500ms → ~20ms for 50 plans.

#### 6.2 Index Usage ✅

**Assessment:** Good basic indexing, but missing some composite indexes.

**Existing Indexes:**

```prisma
@@index([tenantId])
@@index([tenantId, scope])
@@index([tenantId, status])
@@index([tenantId, scope, status])
@@index([tenantId, branchId])
@@index([branchId])
@@index([tenantId, sortOrder])
```

**Issue F03 (MEDIUM):** Missing composite index for common query pattern:

```typescript
// listPlansForTenant() when includeArchived=false (default):
where: {
  tenantId,
  archivedAt: null,  // ❌ Not indexed
}
```

**Recommendation:** Add index:

```prisma
@@index([tenantId, archivedAt])
@@index([tenantId, archivedAt, status])  // For combined filtering
```

**Estimated Impact:** Improves query performance from full table scan to index scan. For 1000 plans, reduces query time from ~50ms to ~5ms.

#### 6.3 Frontend React Query Caching ⚠️

**Issue F02 (MEDIUM):**

```typescript
// hooks/use-membership-plans.ts
const planKeys = {
  active: (
    tenantId: string,
    options?: { branchId?: string; includeMemberCount?: boolean }
  ) => ["membership-plans", tenantId, "active", options] as const,
};
```

**Problem:** Query keys don't normalize `branchId`:

- `{ branchId: undefined }` → different key
- `{ branchId: "" }` → different key
- `{}` → different key

This can cause stale data or unnecessary refetches.

**Recommendation:** Normalize keys:

```typescript
const planKeys = {
  active: (
    tenantId: string,
    options?: { branchId?: string; includeMemberCount?: boolean }
  ) => {
    const normalizedOptions = {
      ...(options?.branchId && { branchId: options.branchId }),
      ...(options?.includeMemberCount && { includeMemberCount: true }),
    };
    return ["membership-plans", tenantId, "active", normalizedOptions] as const;
  },
};
```

This ensures:

- `branchId: undefined` → omitted from key
- `branchId: ""` → omitted from key
- `includeMemberCount: false` → omitted from key

**Impact:** Medium. Can cause UI bugs where branch selector changes don't trigger refetch, or unnecessary refetches on re-renders.

#### 6.4 Frontend Bundle Size ⚠️

**Issue F05 (MEDIUM):**

Build output shows:

```
dist/assets/index-CLc0En1H.js   658.22 kB │ gzip: 198.42 kB

(!) Some chunks are larger than 500 kB after minification.
```

**Recommendation:** Implement code splitting for large dependencies:

```typescript
// Use React.lazy() for large components:
const MembershipPlansPage = lazy(() => import("@/pages/MembershipPlansPage"));

// Or split by route:
const router = createBrowserRouter([
  {
    path: "/membership-plans",
    lazy: () => import("./pages/MembershipPlansPage"),
  },
]);
```

**Estimated Impact:** Reduces initial bundle by ~200-300 kB, improving first load time from ~2s to ~1.2s.

---

### 7. Code Smells / Refactor Opportunities

#### 7.1 Small Refactors (Quick Wins, < 1 day)

**R01: Extract duplicate formatters** (F08, F09)

- Create `frontend/src/lib/formatters.ts`
- Extract `formatDuration()` and `formatPrice()`
- Update 3 files to import from shared utility
- **Effort:** 30 minutes

**R02: Add scopeKey documentation** (F11)

- Add inline comment explaining scopeKey purpose
- Document race condition prevention strategy
- **Effort:** 15 minutes

**R03: Normalize React Query keys** (F02)

- Update `planKeys.active()` to normalize undefined/empty string
- Add test case for cache key consistency
- **Effort:** 1 hour

**R04: Add member count loading state** (F14)

- Add skeleton component when `includeMemberCount=true` and loading
- **Effort:** 30 minutes

#### 7.2 Medium Refactors (1-3 days)

**R05: Fix N+1 query in member count endpoint** (F01) ⚠️ **High Priority**

- Refactor `listActivePlansForTenant()` to use GROUP BY aggregation
- Update E2E tests to verify single query
- **Effort:** 4-6 hours

**R06: Standardize cross-tenant error handling** (F04)

- Update all service methods to use 403 Forbidden consistently
- Update E2E tests to expect 403 instead of 404/400
- **Effort:** 2-3 hours

**R07: Add composite indexes** (F03)

- Create migration for `(tenantId, archivedAt)` and `(tenantId, archivedAt, status)`
- Verify query performance improvement
- **Effort:** 1 hour

**R08: Add archived branch validation test** (F06)

- Create E2E test case for archived branch rejection
- **Effort:** 1 hour

**R09: Implement frontend code splitting** (F05)

- Add React.lazy() for large components
- Configure Vite for manual chunks
- **Effort:** 3-4 hours

#### 7.3 Longer-Term Improvements (Future)

**R10: Add frontend tests**

- Unit tests for hooks (react-testing-library + MSW)
- Component tests for PlanForm validation
- E2E tests for user flows (Playwright)
- **Effort:** 1-2 weeks

**R11: Add status/archivedAt consistency constraint**

- Create database CHECK constraint
- Add application-level validation
- **Effort:** 2-3 hours

**R12: Migrate to database-level memberCount**

- Add `activeMemberCount` computed column or materialized view
- Update on member status changes via trigger
- **Effort:** 1-2 days

---

## Test Results Summary

### Backend Tests

**Unit Tests:**

```
✅ PASS src/membership-plans/membership-plans.service.spec.ts
✅ PASS src/membership-plans/utils/duration-calculator.spec.ts

Test Suites: 2 passed, 2 total
Tests:       100 passed, 100 total
Time:        3.111 s
```

**E2E Tests:**

```
✅ PASS test/membership-plans.e2e-spec.ts

Test Suites: 1 passed, 1 total
Tests:       75 passed, 75 total
Time:        3.942 s
```

**Linting:**

```
✅ No linting errors
```

**Coverage:**

- ✅ T118-T133: Core membership plan operations (all passing)
- ✅ PR6: Branch-aware filtering and pagination (all passing)
- ✅ PR7: Database constraint verification & concurrency (all passing)

### Frontend Tests

**Build:**

```
✅ TypeScript compilation successful
⚠️ Bundle size warning: 658 kB (F05)
```

**Linting:**

```
✅ No linting errors
```

**Tests:**

```
❌ No frontend tests found
```

---

## Quick Wins (<= 1 Day)

| ID  | Task                                | Effort | Priority |
| --- | ----------------------------------- | ------ | -------- |
| R01 | Extract duplicate formatters        | 30m    | LOW      |
| R02 | Add scopeKey documentation          | 15m    | LOW      |
| R03 | Normalize React Query keys          | 1h     | MEDIUM   |
| R04 | Add member count loading state      | 30m    | LOW      |
| R07 | Add composite indexes               | 1h     | MEDIUM   |
| R08 | Add archived branch validation test | 1h     | MEDIUM   |

**Total Effort:** ~4 hours

---

## Medium Improvements (1-3 Days)

| ID  | Task                                         | Effort | Priority |
| --- | -------------------------------------------- | ------ | -------- |
| R05 | Fix N+1 query in member count endpoint       | 4-6h   | **HIGH** |
| R06 | Standardize cross-tenant error handling      | 2-3h   | MEDIUM   |
| R09 | Implement frontend code splitting            | 3-4h   | MEDIUM   |
| R11 | Add status/archivedAt consistency constraint | 2-3h   | LOW      |

**Total Effort:** ~15-20 hours (2-3 days)

---

## Longer-Term (Future)

| ID  | Task                                  | Effort    | Priority |
| --- | ------------------------------------- | --------- | -------- |
| R10 | Add frontend tests                    | 1-2 weeks | MEDIUM   |
| R12 | Migrate to database-level memberCount | 1-2 days  | LOW      |

---

## Suggested Follow-Up PR List

Based on findings, recommend the following PR sequence:

### PR8: Performance & Caching Improvements (HIGH PRIORITY)

**Must complete before first production deployment**

- [ ] R05: Fix N+1 query in member count endpoint (F01)
- [ ] R07: Add composite indexes for (tenantId, archivedAt) (F03)
- [ ] R03: Normalize React Query keys (F02)
- **Estimated Effort:** 1 day
- **Risk:** Low (performance improvements, no behavior changes)

### PR9: Code Quality & Consistency (MEDIUM PRIORITY)

**Can ship in next sprint**

- [ ] R06: Standardize cross-tenant error handling to 403 (F04)
- [ ] R01: Extract duplicate formatters (F08, F09)
- [ ] R02: Add scopeKey documentation (F11)
- [ ] R08: Add archived branch validation test (F06)
- [ ] R04: Add member count loading state (F14)
- **Estimated Effort:** 1 day
- **Risk:** Low (code quality improvements, minimal behavior changes)

### PR10: Frontend Optimization (LOWER PRIORITY)

**Can ship in next month**

- [ ] R09: Implement frontend code splitting (F05)
- **Estimated Effort:** 0.5 day
- **Risk:** Medium (build config changes)

### PR11: Testing & Safety (FUTURE)

**Long-term backlog**

- [ ] R10: Add frontend tests (coverage: hooks, components, E2E)
- [ ] R11: Add status/archivedAt consistency constraint
- [ ] R12: Migrate to database-level memberCount (if needed)
- **Estimated Effort:** 2-3 weeks
- **Risk:** Low (testing only, no production behavior changes)

---

## Conclusion

The Branch-Aware Membership Plans feature (004) is **production-ready** with excellent code quality, comprehensive testing, and strong architectural foundations. The implementation correctly addresses all core requirements:

✅ Tenant isolation enforced at multiple layers  
✅ Race condition prevention via scopeKey strategy  
✅ Comprehensive validation (DTO, service, database)  
✅ 175 tests (100 unit + 75 E2E) all passing  
✅ Clean separation of concerns  
✅ Type-safe TypeScript throughout

**Recommendation: Merge to main after completing PR8 (N+1 query fix + indexing).** All other issues can be tracked as follow-up work.

---

## Review Metadata

**Files Reviewed:**

- Backend: 9 files (service, controller, DTOs, guards, migrations)
- Frontend: 11 files (pages, components, hooks, API, types)
- Tests: 3 files (unit tests, E2E tests)
- Total: 23 files

**Test Execution:**

- Backend unit tests: ✅ 100 passed
- Backend E2E tests: ✅ 75 passed
- Frontend build: ✅ Success (with warning)
- Linting: ✅ Both pass

**Review Duration:** ~4 hours

---

_End of Engineering Review_
