# PR-2 Cron Multi-Instance Hardening — Production Gatekeeper Verification Report

**Date:** February 14, 2026  
**Reviewer:** Principal Backend + Database Engineer (Production Gatekeeper)  
**Reference:** PR-2_CRON_HARDENING_SUMMARY.md

---

## Executive Summary

| Check | Result | Action |
|------|--------|--------|
| #1 Advisory Locks & Prisma Pooling | **FAIL → FIXED** | Same-session guarantee implemented |
| #2 effectiveDateDay Timezone | **FAIL → FIXED** | Migration + app code patched |
| #3 Partial Unique Index | **PASS** | Correct; WARN on migration runtime |

**Overall PR-2 Readiness:** **APPROVE WITH CONDITIONS**

---

## CHECK #1 — Advisory Locks & Prisma Connection Pooling

### Result: FAIL (Original) → FIXED (Patched)

### Evidence

**Original design (BROKEN):**

- `pg-advisory-lock.service.ts` lines 33–35: `tryAcquire()` uses `this.prisma.$queryRaw` directly
- Lines 63–65: `release()` uses `this.prisma.$queryRaw` directly
- No `$transaction` wrapping; each call can use a different pooled connection

**PostgreSQL advisory locks are SESSION-scoped.** With Prisma connection pooling:

- `tryAcquire` may run on connection A
- `release` may run on connection B
- Lock held in session A is never released; `pg_advisory_unlock` in session B returns false
- Lock leaks until connection A is closed (idle timeout or process exit)

### Patch Applied

**File:** `src/common/services/pg-advisory-lock.service.ts`

- Added `executeWithLock<T>(lockName, correlationId, work)` that runs acquire → work → release inside a single `$transaction` callback
- All operations use the same `tx` client → same PostgreSQL session
- `tryAcquire` / `release` retained but documented as unsafe with pooling; callers migrated to `executeWithLock`

**Files updated to use `executeWithLock`:**

- `src/members/services/membership-plan-change-scheduler.service.ts` — per-member lock
- `src/members/member-status-sync.service.ts` — global lock

**New API:**

```typescript
async executeWithLock<T>(
  lockName: string,
  correlationId: string,
  work: (tx: PrismaTx) => Promise<T>,
): Promise<{ acquired: boolean; result?: T }>
```

- When lock not acquired: returns `{ acquired: false }` without calling `work`
- When lock acquired: runs `work(tx)`, releases in `finally`, returns `{ acquired: true, result }`
- When work throws: rethrows after release (caller can catch and count errors)

---

## CHECK #2 — effectiveDateDay Timezone Normalization

### Result: FAIL (Original) → FIXED (Patched)

### Evidence

**Application code (CORRECT):**

- `membership-plan-change-scheduler.service.ts` lines 141–144 (original):
  ```typescript
  const newStartDate = member.pendingMembershipStartDate!;
  const effectiveDateDay = new Date(newStartDate);
  effectiveDateDay.setUTCHours(0, 0, 0, 0);
  ```
  Uses plan effective date (`newStartDate`) and UTC normalization ✓

**Migration backfill (BROKEN):**

- `prisma/migrations/20260214134256_.../migration.sql` line 6 (original):
  ```sql
  SET "effectiveDateDay" = ("newStartDate"::date)
  ```
  Casting `timestamptz` to `date` in PostgreSQL uses the **session timezone**, not UTC. Result is non-deterministic across environments.

### Patch Applied

**1. Migration SQL**

```sql
-- Before
SET "effectiveDateDay" = ("newStartDate"::date)

-- After
SET "effectiveDateDay" = ("newStartDate" AT TIME ZONE 'UTC')::date
```

**2. Application code**

- Extracted `normalizeToUtcDateOnly(date)` helper
- Used in `applyPendingChangeWithTx` when setting `effectiveDateDay`

**Test suggestion:**

```typescript
it('normalizes effectiveDateDay to UTC midnight', () => {
  const d = new Date('2026-02-15T23:00:00Z'); // Late UTC = next day in some TZ
  const normalized = normalizeToUtcDateOnly(d);
  expect(normalized.toISOString()).toMatch(/2026-02-15T00:00:00/);
});
```

---

## CHECK #3 — Partial Unique Index Correctness & Migration Safety

### Result: PASS (with WARN)

### Evidence

**Migration SQL** (`prisma/migrations/20260214134256_.../migration.sql`):

| Requirement | Status | Line |
|-------------|--------|------|
| Column `effectiveDateDay` added | ✓ | 2 |
| Type `DATE` | ✓ | 2 |
| Backfill before index | ✓ | 4–7 before 9–12 |
| Partial unique index | ✓ | 10–12 |
| Index name | ✓ | `MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key` |
| Table name | ✓ | `MemberPlanChangeHistory` |
| WHERE clause | ✓ | `changeType = 'APPLIED'` |

**Index definition:**

```sql
CREATE UNIQUE INDEX "MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key"
ON "MemberPlanChangeHistory" ("memberId", "effectiveDateDay")
WHERE "changeType" = 'APPLIED';
```

**Business correctness:**

- One APPLIED record per member per effective date is the intended rule
- Duplicate APPLIED same day would indicate a race/duplicate; index correctly prevents it
- Multiple SCHEDULED or CANCELLED same day are allowed (not in partial index)
- No need to include `planId` or `changeType` in the key; the partial filter is sufficient

**Rollback plan (from summary):**

```sql
DROP INDEX IF EXISTS "MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key";
ALTER TABLE "MemberPlanChangeHistory" DROP COLUMN IF EXISTS "effectiveDateDay";
```

### WARN — Operational Guidance

- **Index build:** `CREATE UNIQUE INDEX` on a non-empty table acquires a lock. For large `MemberPlanChangeHistory` tables, run during a maintenance window.
- **Concurrent option:** Consider `CREATE UNIQUE INDEX CONCURRENTLY` for production if the table is large (requires separate migration, cannot run inside a transaction).
- **Migration already applied:** If this migration has already run in any environment, do NOT edit the migration file (Prisma checksum will fail). Instead, create a new migration that runs `UPDATE ... SET "effectiveDateDay" = ("newStartDate" AT TIME ZONE 'UTC')::date WHERE ...` to correct any timezone-skewed backfill.

---

## Conditions for APPROVE WITH CONDITIONS

- [x] **CHECK #1:** Advisory lock same-session guarantee implemented and used by both cron services
- [x] **CHECK #2:** Migration backfill uses UTC; app code uses `normalizeToUtcDateOnly`
- [x] **CHECK #3:** Partial unique index validated; no schema changes required
- [ ] **Pre-merge:** Run full test suite and e2e for scheduled plan change
- [ ] **Pre-deploy:** If `MemberPlanChangeHistory` is large, plan maintenance window for index creation

---

## Quick Manual Verification (Two Instances)

1. **Prerequisites:**
   ```bash
   cd backend && npm install && npx prisma migrate dev
   ```

2. **Start two instances:**
   ```bash
   # Terminal 1
   npm run start:dev

   # Terminal 2
   PORT=3001 npm run start:dev
   ```

3. **Trigger plan change cron** (temporarily set `@Cron('* * * * *')` or call `applyScheduledMembershipPlanChanges()` from both).

4. **Verify logs:**
   - Instance 1: `Lock acquired: cron:plan-change:member-xxx`
   - Instance 2: `Lock skipped (held by another instance)` or `Skipped member xxx (lock held by another instance)`

5. **Verify DB:**
   ```sql
   SELECT "memberId", "effectiveDateDay", COUNT(*)
   FROM "MemberPlanChangeHistory"
   WHERE "changeType" = 'APPLIED'
   GROUP BY "memberId", "effectiveDateDay"
   HAVING COUNT(*) > 1;
   -- Expected: 0 rows
   ```

---

## File Change Summary

| File | Change |
|------|--------|
| `src/common/services/pg-advisory-lock.service.ts` | Added `executeWithLock`; documented tryAcquire/release risk |
| `src/common/services/pg-advisory-lock.service.spec.ts` | Tests for `executeWithLock` |
| `src/members/services/membership-plan-change-scheduler.service.ts` | Use `executeWithLock`; add `applyPendingChangeWithTx`; use `normalizeToUtcDateOnly` |
| `src/members/services/membership-plan-change-scheduler.service.spec.ts` | Mock `executeWithLock`; fix Decimal mock |
| `src/members/member-status-sync.service.ts` | Use `executeWithLock`; add `syncExpiredMemberStatusesWithTx` |
| `src/members/member-status-sync.service.spec.ts` | Mock `executeWithLock` |
| `prisma/migrations/20260214134256_.../migration.sql` | UTC-safe backfill for `effectiveDateDay` |

---

## Conclusion

PR-2 is **APPROVE WITH CONDITIONS** after applying the patches above. Advisory locks now run on a single session, and `effectiveDateDay` is consistently normalized to UTC in both migration and application code.
