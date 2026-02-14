# PR-1: Tenant Isolation Refactor (Security Core) - Summary

**Date:** February 14, 2026  
**Reference:** BACKEND_TENANT_ISOLATION_AUDIT.md

---

## What Changed

### 1. Prisma Schema
- Added `@@unique([id, tenantId])` to: **Branch**, **Member**, **MembershipPlan**, **Payment**
- Added `@@unique([id, tenantId, branchId])` to: **Product**, **ProductSale**
- Enables composite `where` for update/delete: `where: { id_tenantId: { id, tenantId } }`

### 2. Read Operations (findUnique → findFirst)
All tenant-scoped lookups now use `findFirst({ where: { id, tenantId } })`:
- **members.service.ts**: findOne, create (branch validation), update (branch validation)
- **payments.service.ts**: getPaymentById, createPayment (member validation), correctPayment, getMemberPayments, checkIdempotencyKey
- **branches.service.ts**: getBranchById
- **membership-plans.service.ts**: getPlanByIdForTenant, validateBranchBelongsToTenant, validateBranchIdForListing

### 3. Write Operations (composite where)
All updates/deletes now use tenant-scoped composite where:
- **members.service.ts**: update, changeStatus, archive, schedulePlanChange, cancelPendingPlanChange
- **branches.service.ts**: updateBranch, archiveBranch, restoreBranch, setDefaultBranch
- **membership-plans.service.ts**: updatePlanForTenant, archivePlanForTenant, restorePlanForTenant, deletePlanForTenant
- **products.service.ts**: update, remove
- **product-sales.service.ts**: remove (defense-in-depth: deleteMany with tenant+branch filter)

### 4. Error Handling
- P2025 (Record not found) caught and converted to `NotFoundException` with generic message
- No information leakage: same "Not found" for non-existent vs wrong-tenant resources

---

## Why

1. **Eliminate TOCTOU**: Tenant check moved into the query instead of post-query validation
2. **Database-level safety**: Composite unique constraints enforce tenant isolation at DB level
3. **Prevent timing attacks**: Same response time for "doesn't exist" vs "wrong tenant"
4. **Prevent ID enumeration**: Attacker cannot probe valid IDs across tenants

---

## Risk / Rollback Notes

- **Migration**: Adds unique constraints. Since `id` is already unique (PK), no data should violate. If migration fails, check for duplicate (id, tenantId) in existing data.
- **Rollback**: Revert migration with `prisma migrate resolve --rolled-back <migration_name>` and redeploy previous schema.
- **API behavior**: Unchanged. Still returns 404 for not-found and cross-tenant access.

---

## Checklist

- [ ] Prisma migration created (`prisma/migrations/20260214120000_add_tenant_isolation_composite_uniques/`)
- [ ] Prisma migration applied (`npx prisma migrate deploy` in staging/prod)
- [ ] Prisma client generated (`npx prisma generate`)
- [ ] Tests updated and passing
- [ ] Manual verification: tenant A cannot read/update/delete tenant B records (404)

---

## Manual Verification Steps

1. Create two tenants (tenant A, tenant B) with members/branches/plans
2. As tenant A user, attempt to access tenant B's resource by ID:
   - `GET /members/{tenantB_member_id}` → 404
   - `PATCH /members/{tenantB_member_id}` → 404
   - `GET /branches/{tenantB_branch_id}` → 404
   - `PATCH /branches/{tenantB_branch_id}` → 404
3. Verify response time is consistent (no timing leak)
4. Verify error message is generic ("Not found" / "Üye bulunamadı" etc.)

---

## Migration Commands

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
