# PR-2: Cron Multi-Instance Hardening Summary

**Date:** February 14, 2026  
**Stack:** NestJS + Prisma + PostgreSQL (No Redis)

---

## What Changed

### 1. PgAdvisoryLockService (New)

**File:** `src/common/services/pg-advisory-lock.service.ts`

- PostgreSQL advisory lock helper using `pg_try_advisory_lock(hashtext(lockName))`
- `generateCorrelationId(jobName)` – unique ID for job run tracing
- `tryAcquire(lockName, correlationId)` – non-blocking lock acquisition
- `release(lockName, correlationId)` – best-effort release (logs errors, does not throw)
- All lock operations log with `correlationId`; no sensitive data in logs

### 2. MembershipPlanChangeSchedulerService (P0)

**File:** `src/members/services/membership-plan-change-scheduler.service.ts`

- Generates `correlationId` at job start
- Per-member lock: `cron:plan-change:${member.id}`
- If lock not acquired: log debug, skip member, increment `skippedLockCount`
- If acquired: run `applyPendingChange`, release lock in `finally`
- Summary log: `totalFound`, `applied`, `skipped(lock)`, `errors`
- History creation now sets `effectiveDateDay` for defense-in-depth

### 3. MemberStatusSyncService (P1)

**File:** `src/members/member-status-sync.service.ts`

- Generates `correlationId` at job start
- Global lock: `cron:status-sync:global`
- If lock not acquired: log and return early (no work done)
- If acquired: run existing sync logic, release lock in `finally`
- All logs include `correlationId`

### 4. RateLimiterService (P2 – Comment Only)

**File:** `src/auth/services/rate-limiter.service.ts`

- Added comment: rate limits are per-instance; multi-instance deployments may bypass limits; consider Redis for shared limits

### 5. DB Uniqueness Constraint (Defense-in-Depth)

**Schema:** `prisma/schema.prisma`

- Added `effectiveDateDay DateTime? @db.Date` to `MemberPlanChangeHistory`
- Partial unique index: `(memberId, effectiveDateDay)` WHERE `changeType = 'APPLIED'`
- Prevents duplicate APPLIED history rows for the same member and effective date
- Migration: `20260214134256_add_effective_date_day_and_unique_constraint`

### 6. CommonModule

**File:** `src/common/common.module.ts`

- Global module exporting `PgAdvisoryLockService`
- Imported in `AppModule`

---

## Why

- **Duplicate writes:** Multiple backend instances running cron jobs could create duplicate `MemberPlanChangeHistory` records or race on status updates.
- **Observability:** `correlationId` enables tracing a single job run across logs.
- **Defense-in-depth:** Unique constraint protects against duplicate APPLIED history even if locking logic fails.

---

## How to Verify Locally (Two Instances)

### Prerequisites

```bash
cd backend
npm install
# Ensure PostgreSQL is running; apply migrations
npx prisma migrate dev
```

### Plan Change Job (P0)

1. Create test members with pending plan changes (e.g. via API or seed).
2. Start two instances:
   ```bash
   # Terminal 1
   npm run start:dev

   # Terminal 2 (different port)
   PORT=3001 npm run start:dev
   ```
3. Trigger the cron at the same time (e.g. by temporarily changing cron to `* * * * *` or calling `applyScheduledMembershipPlanChanges()` from both).
4. Check logs: one instance should show `Lock acquired`, the other `Lock skipped (held by another instance)`.
5. Verify DB: no duplicate APPLIED history per member:
   ```sql
   SELECT "memberId", COUNT(*)
   FROM "MemberPlanChangeHistory"
   WHERE "changeType" = 'APPLIED'
   GROUP BY "memberId"
   HAVING COUNT(*) > 1;
   -- Expected: 0 rows
   ```

### Status Sync Job (P1)

1. Start two instances as above.
2. Trigger status sync on both.
3. Check logs: one instance runs the job, the other logs `Job skipped: Another instance is running status sync`.

---

## Rollback Notes

1. **Code rollback:** Revert PR-2 commits. Lock service is isolated; cron jobs will run without locks (previous behavior).
2. **Schema rollback:** The `effectiveDateDay` column and partial unique index can be dropped:
   ```sql
   DROP INDEX IF EXISTS "MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key";
   ALTER TABLE "MemberPlanChangeHistory" DROP COLUMN IF EXISTS "effectiveDateDay";
   ```
3. **Immediate mitigation:** Scale to a single instance to avoid multi-instance races.

---

## Known Limitations

- **Rate limiter (P2):** Per-instance only. Same IP/email can hit different instances and bypass limits. Consider Redis for shared rate limiting.
- **Advisory locks:** Session-scoped. Locks are released when the DB connection/session ends (e.g. process crash). No automatic TTL.
- **Lock contention:** If many instances run, some will skip work. This is expected; only one instance should process each member (P0) or the whole job (P1).

---

## File-by-File Change List

| File | Change |
|------|--------|
| `src/common/services/pg-advisory-lock.service.ts` | **New** – Lock helper |
| `src/common/services/pg-advisory-lock.service.spec.ts` | **New** – Unit tests |
| `src/common/common.module.ts` | **New** – Global module |
| `src/app.module.ts` | Added `CommonModule` import |
| `src/members/services/membership-plan-change-scheduler.service.ts` | Per-member locks, correlationId, effectiveDateDay |
| `src/members/services/membership-plan-change-scheduler.service.spec.ts` | **New** – Lock behavior tests |
| `src/members/member-status-sync.service.ts` | Global lock, correlationId |
| `src/members/member-status-sync.service.spec.ts` | **New** – Lock behavior tests |
| `src/auth/services/rate-limiter.service.ts` | Comment on multi-instance limits |
| `prisma/schema.prisma` | Added `effectiveDateDay` to `MemberPlanChangeHistory` |
| `prisma/migrations/20260214134256_.../migration.sql` | **New** – Column + backfill + partial unique index |
