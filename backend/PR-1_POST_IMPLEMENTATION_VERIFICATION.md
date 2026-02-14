# PR-1 Tenant Isolation Refactor — Post-Implementation Verification Report

**Reviewer:** Senior Backend Reviewer (Production Security Gatekeeper)  
**Date:** 2026-02-14  
**Scope:** 3 Critical Architectural Checks

---

## CHECK #1: Composite Unique Redundancy & Intent

### Schema Verification (`prisma/schema.prisma`)

| Model | @@unique | Line | Primary Key |
|-------|---------|------|-------------|
| Branch | `@@unique([id, tenantId])` | 147 | ✓ `id` @id |
| Member | `@@unique([id, tenantId])` | 275 | ✓ `id` @id |
| MembershipPlan | `@@unique([id, tenantId])` | 205 | ✓ `id` @id |
| Payment | `@@unique([id, tenantId])` | 322 | ✓ `id` @id |
| Product | `@@unique([id, tenantId, branchId])` | 424 | ✓ `id` @id |
| ProductSale | `@@unique([id, tenantId, branchId])` | 448 | ✓ `id` @id |

### Composite Unique Conflicts

- **Branch:** `@@unique([tenantId, name])` — different columns, no conflict ✓
- **Member:** `@@unique([tenantId, phone])` — different columns, no conflict ✓
- **MembershipPlan:** `@@unique([tenantId, scope, scopeKey, name])` — different columns, no conflict ✓
- **Payment, Product, ProductSale:** no other uniques ✓

### Schema Comment

**MISSING.** No comment explains why the composite unique exists.

**Recommended comment to add** (place above first `@@unique([id, tenantId])` or in a central block):

```prisma
// Tenant isolation: @@unique([id, tenantId]) enables Prisma update/delete with
// where: { id_tenantId: { id, tenantId } }, enforcing tenant scope at DB level.
// Branch-scoped models use @@unique([id, tenantId, branchId]) for id_tenantId_branchId.
```

### Prisma Client Generated Types

| Model | Input Type | Verified |
|-------|------------|----------|
| Branch, Member, MembershipPlan, Payment | `id_tenantId` | ✓ `BranchIdTenantIdCompoundUniqueInput`, etc. |
| Product, ProductSale | `id_tenantId_branchId` | ✓ `ProductIdTenantIdBranchIdCompoundUniqueInput`, `ProductSaleIdTenantIdBranchIdCompoundUniqueInput` |

### Service Usage Scan

| Service | Method | Composite Where | Correct |
|---------|--------|-----------------|---------|
| branches.service.ts | update, archive, setDefault | `id_tenantId` | ✓ |
| members.service.ts | update, changeStatus, archive | `id_tenantId` | ✓ |
| membership-plans.service.ts | update, archive, etc. | `id_tenantId` | ✓ |
| products.service.ts | update, remove | `id_tenantId_branchId` | ✓ |
| product-sales.service.ts | remove | `deleteMany({ id, tenantId, branchId })` | ✓ |
| payments.service.ts | correctPayment | `updateMany({ id, version })` | ✓ (no singular update) |

**No `update({ where: { id } })` fallbacks** in tenant-scoped models.  
**User model:** `users.repository.ts` uses `where: { id }` for `User` — correct; User has no `@@unique([id, tenantId])`.

### CHECK #1 RESULT: **FAIL**

**Reason:** Schema lacks an explanatory comment for the composite unique constraints.

**Fix:** Add the recommended comment above to `prisma/schema.prisma` (e.g. before the Branch model or in a schema-level comment block).

---

## CHECK #2: Branch-Scoped Model Safety

### products.service.ts

| Method | Uses id_tenantId_branchId | branchId Passed |
|--------|--------------------------|-----------------|
| update | ✓ `where: { id_tenantId_branchId: { id, tenantId, branchId } }` (L154) | ✓ |
| remove | ✓ `where: { id_tenantId_branchId: { id, tenantId, branchId } }` (L178) | ✓ |

- `findOne` validates ownership before update/remove ✓
- No `update({ where: { id } })` ✓

### product-sales.service.ts

| Method | Uses branchId | branchId Passed |
|--------|---------------|-----------------|
| remove | ✓ `deleteMany({ where: { id, tenantId, branchId } })` (L205-206) | ✓ |
| findOne | ✓ `where: { id, tenantId, branchId }` (L73-78) | ✓ |

- `findOne` validates ownership before delete ✓
- No singular `update` on ProductSale ✓
- `validateAndProcessItems` uses `tenantId` + `branchId` for product lookup ✓

### Edge Cases

- **product-sales remove:** Uses `deleteMany` with `{ id, tenantId, branchId }`. If wrong `branchId`, `findOne` throws `NotFoundException` before `deleteMany`. ✓
- **products update:** Wrong `branchId` → `findOne` returns null → `NotFoundException`. ✓

### Test Coverage

| Test File | Branch Cross-Scope | Wrong branchId |
|-----------|--------------------|----------------|
| products.service.spec.ts | ✓ "refuse cross-tenant/branch update" (L166-177) | Implicit via findOne |
| products.service.spec.ts | ✓ remove asserts `id_tenantId_branchId` (L204-210) | — |
| product-sales.service.spec.ts | ✗ No explicit wrong-branchId remove test | — |

**Gap:** `product-sales.service.spec.ts` does not test:
1. Successful remove with correct `id_tenantId_branchId` (and `deleteMany` call)
2. `remove` with wrong `branchId` returns `NotFoundException`

### CHECK #2 RESULT: **PASS**

**Notes:**
- All writes include `tenantId` and `branchId` where required.
- No unsafe `where: { id }` usage.
- **Suggested test additions** (non-blocking):
  - `remove` success path: assert `deleteMany` called with `{ id, tenantId, branchId }`
  - `remove` with wrong `branchId`: expect `NotFoundException`

---

## CHECK #3: Migration & Index Safety

### Migration File

`prisma/migrations/20260214120000_add_tenant_isolation_composite_uniques/migration.sql`

### Verification

| Check | Result |
|-------|--------|
| Only unique indexes added | ✓ 6× `CREATE UNIQUE INDEX` |
| No column drops | ✓ |
| No destructive changes | ✓ |
| No data modifications | ✓ |

### Index Creation Type

- Uses plain `CREATE UNIQUE INDEX` (no `CONCURRENTLY`).
- PostgreSQL will take a brief exclusive lock per table during index creation.
- Prisma migrations run in a transaction; `CREATE INDEX CONCURRENTLY` cannot run inside a transaction.

### Rollback Safety

- No explicit down migration.
- Rollback = manual `DROP INDEX` for each new index.
- Indexes are additive; dropping them does not affect data.
- Rollback is **safe** from a data perspective.

### Risk Assessment

| Factor | Assessment |
|--------|------------|
| Table size | Branch, Member, MembershipPlan, Payment, Product, ProductSale — likely < 100k rows each for typical gym |
| Lock duration | Short for small/medium tables |
| Downtime | Possible brief write block per table |

### CHECK #3 RESULT: **WARN**

**Risk level:** Low–Medium (depends on table sizes).

**Deployment recommendation:**
- **Small/medium datasets (< ~100k rows per table):** Safe for immediate production.
- **Large datasets:** Prefer a maintenance window; consider manual `CREATE UNIQUE INDEX CONCURRENTLY` outside Prisma migrations if needed.

---

## FINAL OUTPUT

### 1) CHECK #1 RESULT: **FAIL**

- Add schema comment explaining composite unique intent (see recommended text above).

### 2) CHECK #2 RESULT: **PASS**

- Branch-scoped models correctly use `id_tenantId_branchId` / `deleteMany` with `id`, `tenantId`, `branchId`.
- Optional: add product-sales remove tests for success path and wrong `branchId`.

### 3) CHECK #3 RESULT: **WARN**

- Migration is additive and non-destructive.
- Index creation is blocking; acceptable for typical gym scale; consider maintenance window for large tables.

---

## OVERALL PR-1 STABILITY SCORE: **82/100**

- -10: Missing schema documentation (composite unique intent)
- -5: Product-sales remove tests incomplete
- -3: Migration uses blocking index creation (acceptable but noted)

---

## DEPLOYMENT RISK LEVEL: **Low**

---

## MERGE RECOMMENDATION: **Approve with conditions**

**Conditions:**
1. **Required:** Add the recommended schema comment for composite unique constraints.
2. **Recommended:** Add product-sales remove tests (success path + wrong `branchId`).

**Blocking issues:** None. The missing comment is documentation-only; behavior is correct.
