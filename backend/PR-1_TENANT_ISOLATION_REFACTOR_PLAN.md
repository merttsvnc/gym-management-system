# PR-1: Tenant Isolation Refactor (Security Core) - Implementation Plan

**Date:** February 14, 2026  
**Scope:** Backend (NestJS + Prisma + PostgreSQL)  
**Reference:** BACKEND_TENANT_ISOLATION_AUDIT.md

---

## 1. PR PLAN

### 1.1 Files to Change

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `@@unique([id, tenantId])` to Branch, Member, MembershipPlan, Payment; `@@unique([id, tenantId, branchId])` to Product, ProductSale |
| `src/members/members.service.ts` | P0-001 to P0-006: findUnique→findFirst, update→composite where |
| `src/payments/payments.service.ts` | P0-007, P0-008: findUnique→findFirst; correctPayment, getMemberPayments, checkIdempotencyKey |
| `src/branches/branches.service.ts` | P0-009 to P0-011: findUnique→findFirst, update→composite where; restoreBranch, setDefaultBranch |
| `src/membership-plans/membership-plans.service.ts` | P0-012 to P0-016: findUnique→findFirst, update/delete→composite where; validateBranchBelongsToTenant, validateBranchIdForListing |
| `src/products/products.service.ts` | P0-017, P0-018: update→composite where |
| `src/product-sales/product-sales.service.ts` | Defense-in-depth: delete→deleteMany with tenant+branch filter |

### 1.2 Prisma Schema Changes

```prisma
// Branch - add after @@unique([tenantId, name])
@@unique([id, tenantId])

// Member - add after @@unique([tenantId, phone])
@@unique([id, tenantId])

// MembershipPlan - add (new composite)
@@unique([id, tenantId])

// Payment - add (new composite)
@@unique([id, tenantId])

// Product - add (branch-scoped)
@@unique([id, tenantId, branchId])

// ProductSale - add (branch-scoped)
@@unique([id, tenantId, branchId])
```

### 1.3 Migration Strategy

**Dev:**
```bash
cd backend
npx prisma migrate dev --name add_tenant_isolation_composite_uniques
npx prisma generate
```

**Staging/Prod:**
```bash
cd backend
npx prisma migrate deploy
npx prisma generate  # if not in deploy pipeline
```

**Data integrity:** Since `id` is already unique (PK), `(id, tenantId)` and `(id, tenantId, branchId)` cannot violate uniqueness. No data cleanup required.

---

## 2. Generated Prisma Unique Input Names

After migration, Prisma generates:
- `id_tenantId` for `@@unique([id, tenantId])`
- `id_tenantId_branchId` for `@@unique([id, tenantId, branchId])`

---

## 3. Implementation Checklist

- [ ] Prisma schema updated
- [ ] Migration created (`prisma migrate dev`)
- [ ] Prisma client generated
- [ ] members.service.ts refactored
- [ ] payments.service.ts refactored
- [ ] branches.service.ts refactored
- [ ] membership-plans.service.ts refactored
- [ ] products.service.ts refactored
- [ ] product-sales.service.ts refactored (defense-in-depth)
- [ ] Tests added/updated
- [ ] Manual verification
