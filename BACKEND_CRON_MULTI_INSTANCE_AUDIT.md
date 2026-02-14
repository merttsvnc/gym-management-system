# Backend Cron Multi-Instance Safety Audit

**Audit Date:** February 14, 2026  
**Auditor:** Principal Backend + DevOps Engineer  
**Scope:** All scheduled jobs under `/backend/src`  
**Stack:** NestJS + PostgreSQL (Prisma) - No Redis

---

## Executive Summary

**Total Jobs Found:** 3 scheduled tasks

- **2 Critical Cron Jobs** requiring immediate distributed locking
- **1 Low-Risk Interval** (in-memory cleanup, safe as-is)

**Risk Assessment:**

- **1 P0 (Critical):** `MembershipPlanChangeSchedulerService` - High risk of duplicate history records
- **1 P1 (High):** `MemberStatusSyncService` - Race conditions on member status updates
- **1 P2 (Low):** `RateLimiterService` - Per-instance state, no cross-instance issues

**Recommended Approach:** PostgreSQL Advisory Locks (no Redis in stack)

---

## Detailed Audit by Job

### 1. MembershipPlanChangeSchedulerService ⚠️ **P0 CRITICAL**

**File:** [src/members/services/membership-plan-change-scheduler.service.ts](backend/src/members/services/membership-plan-change-scheduler.service.ts#L19)

#### Cron Expression

```typescript
@Cron('0 2 * * *') // Daily at 02:00 AM UTC
```

#### What It Mutates

**Tables:**

- `Member` - Updates active membership fields, clears pending fields
- `MemberPlanChangeHistory` - Creates history records with `changeType='APPLIED'`

**Business Logic:**

1. Queries all members with `pendingMembershipPlanId IS NOT NULL` and `pendingMembershipStartDate <= today`
2. For each member, executes a transaction that:
   - Updates member's active plan fields
   - Clears pending plan fields
   - Creates a history record

#### Idempotency Analysis

❌ **NOT IDEMPOTENT**

**Why:** The `applyPendingChange()` method checks if `pendingMembershipPlanId` exists before proceeding, which provides _some_ protection. However:

- The check happens **outside** the transaction (line 68-70)
- Between the check and transaction start, another instance can race
- Each instance will create its own `MemberPlanChangeHistory` record

**Code Evidence:**

```typescript
if (!member.pendingMembershipPlanId) {
  // No pending change, skip (idempotent) ← FALSE CLAIM
  return;
}
// ... later, in transaction ...
await tx.memberPlanChangeHistory.create({
  /* ... */
}); // ← Can duplicate
```

#### Race Condition Risk

🔴 **HIGH RISK - Multi-Instance Unsafe**

**Scenario:**

1. Instance A reads 100 members with pending changes at 02:00:00
2. Instance B reads the same 100 members at 02:00:00.5
3. Both instances iterate through the list
4. For member `M001`:
   - Instance A starts transaction, reads member (has pending plan)
   - Instance B starts transaction, reads member (still has pending plan)
   - Instance A updates member, creates history record
   - Instance B updates member (idempotent update, OK), creates **duplicate** history record ❌

**Result:** Duplicate `MemberPlanChangeHistory` records with identical data but different IDs.

#### Tenant Scoping

⚠️ **PARTIAL ISSUE**

The query does NOT filter by tenant:

```typescript
const membersWithPendingChanges = await this.prisma.member.findMany({
  where: {
    pendingMembershipPlanId: { not: null },
    pendingMembershipStartDate: { lte: today },
  },
  // ← No tenantId filter, processes ALL tenants
});
```

While this is intentional (process all tenants), it increases the blast radius in multi-instance scenarios.

#### Recommended Locking Approach

**PostgreSQL Advisory Lock (Session-level)**

**Why:**

- No Redis in the stack
- Deterministic lock key per member
- Transaction-level safety
- Automatic release on commit/rollback

**Lock Key Strategy:**

```typescript
// Use hashCode of member ID to generate numeric lock key
// PostgreSQL advisory locks require bigint (up to 2^63-1)
const lockKey = `SELECT hashtext('cron:plan-change:${memberId}')::bigint`;
```

---

### 2. MemberStatusSyncService ⚠️ **P1 HIGH**

**File:** [src/members/member-status-sync.service.ts](backend/src/members/member-status-sync.service.ts#L30)

#### Cron Expression

```typescript
@Cron('0 3 * * *', {
  name: 'sync-expired-member-statuses',
  timeZone: 'UTC',
})
```

#### What It Mutates

**Tables:**

- `Member.status` - Updates `ACTIVE → INACTIVE` for expired memberships

**Business Logic:**

1. Retrieves all tenants
2. For each tenant, finds members with `status='ACTIVE'` AND `membershipEndDate < today`
3. Uses `updateMany` to bulk update status to `INACTIVE`

#### Idempotency Analysis

✅ **MOSTLY IDEMPOTENT**

**Why:** The `updateMany` query is idempotent:

```typescript
await this.prisma.member.updateMany({
  where: {
    tenantId: tenant.id,
    status: "ACTIVE",
    membershipEndDate: { lt: today },
  },
  data: { status: "INACTIVE" },
});
```

If a member is already `INACTIVE`, the `where` clause excludes it. Multiple runs won't change the outcome.

#### Race Condition Risk

🟡 **MODERATE RISK - Counts May Differ**

**Scenario:**

1. Instance A starts job at 03:00:00, queries tenant `T001`, finds 50 members
2. Instance B starts job at 03:00:00.2, queries tenant `T001`, finds 50 members
3. Instance A updates 50 members to `INACTIVE`, logs "50 updated"
4. Instance B updates (same query), finds 0 members match (already `INACTIVE`), logs "0 updated"

**Result:**

- ✅ No data corruption (status correctly set to `INACTIVE`)
- ❌ Inconsistent logs (totals don't match reality)
- ❌ Wasted resources (duplicate queries)

**Lower Risk Because:**

- `updateMany` is atomic at the database level
- No separate history table writes
- No transaction-spanning logic

#### Tenant Scoping

✅ **PROPERLY SCOPED**

Each tenant is processed independently with `tenantId` filter. Good isolation.

#### Recommended Locking Approach

**PostgreSQL Advisory Lock (Global Job Lock)**

**Why:**

- Single instance should run this job globally (not per-tenant)
- Prevents duplicate work across all tenants
- Simple "leader election" pattern

**Lock Key Strategy:**

```typescript
// Single global lock for the entire job
const LOCK_KEY = 19760303; // Fixed numeric key (e.g., date-based)
// pg_try_advisory_lock(19760303)
```

---

### 3. RateLimiterService ✅ **P2 LOW RISK**

**File:** [src/auth/services/rate-limiter.service.ts](backend/src/auth/services/rate-limiter.service.ts#L59)

#### Interval Expression

```typescript
setInterval(
  () => {
    this.cleanup();
  },
  5 * 60 * 1000,
); // Every 5 minutes
```

#### What It Mutates

**State:**

- In-memory `Map<string, RateLimitEntry>` (per-instance)

**Business Logic:**
Removes expired rate limit entries from the in-memory store.

#### Idempotency Analysis

✅ **IDEMPOTENT & ISOLATED**

Each instance maintains its **own** rate limit state. No shared storage.

#### Race Condition Risk

🟢 **NO RISK**

**Why:**

- Each instance has independent state
- Cleanup only affects local memory
- No database writes

**Caveat:** In multi-instance deployments, rate limits are **not shared** across instances. Same IP can bypass limits by hitting different instances. This is a **product decision**, not a cron safety issue.

#### Tenant Scoping

N/A (no database access)

#### Recommended Locking Approach

**No Lock Needed** ✅

If shared rate limiting is required in the future, migrate to Redis with `ioredis` or similar.

---

## Risk Summary Table

| Job                               | Priority | Race Risk   | Duplicate Data | Wasted Resources   | Lock Required   |
| --------------------------------- | -------- | ----------- | -------------- | ------------------ | --------------- |
| **MembershipPlanChangeScheduler** | P0       | 🔴 High     | Yes (history)  | Yes                | **MANDATORY**   |
| **MemberStatusSyncService**       | P1       | 🟡 Moderate | No             | Yes (queries/logs) | **RECOMMENDED** |
| **RateLimiterService cleanup**    | P2       | 🟢 None     | No             | No                 | Not needed      |

---

## Implementation Plan

### Step 1: Create Distributed Lock Helper Service

**File:** `src/common/services/distributed-lock.service.ts`

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Prisma } from "@prisma/client";

export interface LockResult {
  acquired: boolean;
  lockKey: bigint;
  correlationId: string;
}

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to acquire a PostgreSQL advisory lock.
   *
   * @param lockName Human-readable lock name (e.g., "cron:plan-change:member-abc123")
   * @param correlationId Unique ID for this job run (for tracing)
   * @param timeoutMs Max time to wait for lock (0 = try once)
   * @returns LockResult indicating if lock was acquired
   */
  async tryAcquireLock(
    lockName: string,
    correlationId: string,
    timeoutMs: number = 0,
  ): Promise<LockResult> {
    const lockKey = this.hashLockName(lockName);

    const startTime = Date.now();
    let acquired = false;

    while (
      !acquired &&
      (Date.now() - startTime < timeoutMs || timeoutMs === 0)
    ) {
      try {
        // Use pg_try_advisory_lock (non-blocking)
        const result = await this.prisma.$queryRaw<[{ acquired: boolean }]>`
          SELECT pg_try_advisory_lock(${lockKey}) as acquired
        `;

        acquired = result[0]?.acquired ?? false;

        if (acquired) {
          this.logger.log(
            `[${correlationId}] Lock acquired: ${lockName} (key: ${lockKey})`,
          );
          return { acquired: true, lockKey, correlationId };
        }

        if (timeoutMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          break;
        }
      } catch (error) {
        this.logger.error(
          `[${correlationId}] Error acquiring lock ${lockName}: ${error.message}`,
          error.stack,
        );
        return { acquired: false, lockKey, correlationId };
      }
    }

    this.logger.warn(
      `[${correlationId}] Lock contention: ${lockName} (another instance holds lock)`,
    );
    return { acquired: false, lockKey, correlationId };
  }

  /**
   * Release a previously acquired advisory lock.
   */
  async releaseLock(lockKey: bigint, correlationId: string): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock(${lockKey})
      `;
      this.logger.log(`[${correlationId}] Lock released: ${lockKey}`);
    } catch (error) {
      this.logger.error(
        `[${correlationId}] Error releasing lock ${lockKey}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Hash a lock name to a bigint for PostgreSQL advisory locks.
   * Uses hashtext (CRC32) and ensures positive value.
   */
  private hashLockName(name: string): bigint {
    // Simple hash: convert string to CRC32-like value
    // PostgreSQL advisory locks use bigint (int8), range: -2^63 to 2^63-1
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure positive value and cast to bigint
    return BigInt(Math.abs(hash));
  }

  /**
   * Generate a correlation ID for this job run (for tracing).
   */
  generateCorrelationId(jobName: string): string {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const random = Math.random().toString(36).substring(2, 8);
    return `${jobName}-${timestamp}-${random}`;
  }
}
```

**Register in Module:**

```typescript
// src/common/common.module.ts
import { Module, Global } from "@nestjs/common";
import { DistributedLockService } from "./services/distributed-lock.service";
import { PrismaModule } from "../prisma/prisma.module";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class CommonModule {}
```

---

### Step 2: Patch MembershipPlanChangeSchedulerService (P0)

**File:** `src/members/services/membership-plan-change-scheduler.service.ts`

**Changes Required:**

1. Inject `DistributedLockService`
2. Wrap the cron job with correlation ID generation
3. Acquire lock per member before processing
4. Release lock after transaction (use try/finally)

**Patched Code:**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Cron } from "@nestjs/schedule";
import { DistributedLockService } from "../../common/services/distributed-lock.service";

@Injectable()
export class MembershipPlanChangeSchedulerService {
  private readonly logger = new Logger(
    MembershipPlanChangeSchedulerService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: DistributedLockService,
  ) {}

  /**
   * Apply scheduled membership plan changes
   * Runs daily at 02:00 AM
   */
  @Cron("0 2 * * *")
  async applyScheduledMembershipPlanChanges() {
    const correlationId = this.lockService.generateCorrelationId(
      "plan-change-scheduler",
    );
    this.logger.log(
      `[${correlationId}] Starting scheduled membership plan change job`,
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const membersWithPendingChanges = await this.prisma.member.findMany({
      where: {
        pendingMembershipPlanId: { not: null },
        pendingMembershipStartDate: { lte: today },
      },
      include: {
        membershipPlan: true,
        pendingMembershipPlan: true,
      },
    });

    this.logger.log(
      `[${correlationId}] Found ${membersWithPendingChanges.length} members with pending changes`,
    );

    let appliedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const member of membersWithPendingChanges) {
      // Acquire per-member lock to prevent duplicate processing
      const lockName = `cron:plan-change:${member.id}`;
      const lockResult = await this.lockService.tryAcquireLock(
        lockName,
        correlationId,
        0, // Non-blocking
      );

      if (!lockResult.acquired) {
        skippedCount++;
        this.logger.debug(
          `[${correlationId}] Skipped member ${member.id} (locked by another instance)`,
        );
        continue;
      }

      try {
        await this.applyPendingChange(member.id, member.tenantId);
        appliedCount++;
        this.logger.log(
          `[${correlationId}] Applied pending change for member ${member.id}`,
        );
      } catch (error) {
        this.logger.error(
          `[${correlationId}] Failed to apply pending change for member ${member.id}: ${error.message}`,
          error.stack,
        );
        errorCount++;
      } finally {
        // Always release lock
        await this.lockService.releaseLock(lockResult.lockKey, correlationId);
      }
    }

    this.logger.log(
      `[${correlationId}] Scheduled plan change job completed: ${appliedCount} applied, ${errorCount} errors, ${skippedCount} skipped (lock contention)`,
    );
  }

  /**
   * Apply a pending plan change for a specific member
   * (unchanged logic)
   */
  async applyPendingChange(memberId: string, tenantId: string) {
    // ... existing implementation unchanged ...
  }
}
```

**Key Changes:**

- ✅ Correlation ID generated at job start
- ✅ Per-member lock acquired before processing
- ✅ Lock released in `finally` block
- ✅ Lock contention logged and counted

---

### Step 3: Patch MemberStatusSyncService (P1)

**File:** `src/members/member-status-sync.service.ts`

**Changes Required:**

1. Inject `DistributedLockService`
2. Acquire **global lock** at job start (single instance runs job)
3. Skip job if lock not acquired
4. Release lock after completion

**Patched Code:**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { getTodayStart } from "../common/utils/membership-status.util";
import { DistributedLockService } from "../common/services/distributed-lock.service";

@Injectable()
export class MemberStatusSyncService {
  private readonly logger = new Logger(MemberStatusSyncService.name);
  private readonly GLOBAL_LOCK_KEY = "cron:member-status-sync:global";

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: DistributedLockService,
  ) {}

  @Cron("0 3 * * *", {
    name: "sync-expired-member-statuses",
    timeZone: "UTC",
  })
  async handleCron() {
    const correlationId = this.lockService.generateCorrelationId("status-sync");
    this.logger.log(`[${correlationId}] Starting daily member status sync job`);

    // Acquire global lock (only one instance should run this job)
    const lockResult = await this.lockService.tryAcquireLock(
      this.GLOBAL_LOCK_KEY,
      correlationId,
      0, // Non-blocking
    );

    if (!lockResult.acquired) {
      this.logger.log(
        `[${correlationId}] Job skipped: Another instance is running status sync`,
      );
      return;
    }

    try {
      await this.syncExpiredMemberStatuses(correlationId);
    } finally {
      await this.lockService.releaseLock(lockResult.lockKey, correlationId);
    }
  }

  async syncExpiredMemberStatuses(correlationId: string = "manual"): Promise<{
    totalUpdated: number;
    updatesByTenant: Record<string, number>;
  }> {
    const today = getTodayStart();
    const updatesByTenant: Record<string, number> = {};
    let totalUpdated = 0;

    try {
      const tenants = await this.prisma.tenant.findMany({
        select: { id: true },
      });

      this.logger.debug(
        `[${correlationId}] Processing ${tenants.length} tenants for status sync`,
      );

      for (const tenant of tenants) {
        try {
          const result = await this.prisma.member.updateMany({
            where: {
              tenantId: tenant.id,
              status: "ACTIVE",
              membershipEndDate: { lt: today },
            },
            data: { status: "INACTIVE" },
          });

          const count = result.count;
          if (count > 0) {
            updatesByTenant[tenant.id] = count;
            totalUpdated += count;
            this.logger.log(
              `[${correlationId}] Tenant ${tenant.id}: Updated ${count} expired members`,
            );
          }
        } catch (error) {
          this.logger.error(
            `[${correlationId}] Error syncing tenant ${tenant.id}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(
        `[${correlationId}] Status sync completed: ${totalUpdated} members updated across ${Object.keys(updatesByTenant).length} tenants`,
      );

      return { totalUpdated, updatesByTenant };
    } catch (error) {
      this.logger.error(
        `[${correlationId}] Fatal error in status sync: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
```

**Key Changes:**

- ✅ Global lock prevents multiple instances from running
- ✅ Correlation ID passed to logic method
- ✅ Lock released in `finally` block
- ✅ Early return if lock not acquired

---

## Acceptance Criteria

### Functional Requirements

1. **No Duplicate History Records**
   - ✅ Running 2 app instances simultaneously must not create duplicate `MemberPlanChangeHistory` records
   - ✅ Each member's pending plan change is processed exactly once

2. **No Race Conditions on Status Updates**
   - ✅ Only one instance processes the status sync job per execution window
   - ✅ Member status updates are applied exactly once

3. **Observability**
   - ✅ All cron jobs log with correlation ID
   - ✅ Lock acquisition logged: `[corr-id] Lock acquired: <lock-name>`
   - ✅ Lock contention logged: `[corr-id] Lock contention: <lock-name> (another instance holds lock)`
   - ✅ Lock release logged: `[corr-id] Lock released: <lock-key>`

4. **Resource Efficiency**
   - ✅ Skipped members counted and logged
   - ✅ No wasted database queries when lock not acquired

### Testing Requirements

1. **Unit Tests**
   - `DistributedLockService.tryAcquireLock()` with mocked Prisma
   - `DistributedLockService.releaseLock()` success/failure paths
   - Hash collision detection (verify unique lock keys)

2. **Integration Tests**
   - Simulate lock contention (two concurrent calls)
   - Verify history record count (no duplicates)
   - Verify lock cleanup on error paths

3. **E2E Tests** (see "How to Test Locally" below)
   - Run two instances simultaneously
   - Verify logs show lock contention
   - Verify no duplicate data in database

---

## How to Test Locally

### Prerequisites

```bash
# Ensure PostgreSQL is running
docker-compose up -d postgres

# Install dependencies
cd backend && npm install
```

### Test Scenario 1: Simulate Multi-Instance for Plan Change Job

**Setup:**

```bash
# Create test data with pending plan changes
npx ts-node -r tsconfig-paths/register <<'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function setup() {
  const tenant = await prisma.tenant.findFirst();
  const plan = await prisma.membershipPlan.findFirst({ where: { tenantId: tenant.id } });
  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id } });

  // Create 10 members with pending plan changes (scheduled for today)
  for (let i = 0; i < 10; i++) {
    await prisma.member.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: `Test${i}`,
        lastName: 'Member',
        phone: `555-000${i}`,
        membershipPlanId: plan.id,
        membershipStartDate: new Date('2025-01-01'),
        membershipEndDate: new Date('2025-12-31'),
        pendingMembershipPlanId: plan.id,
        pendingMembershipStartDate: new Date(), // Today
        pendingMembershipEndDate: new Date('2026-12-31'),
        pendingMembershipPriceAtPurchase: 100,
      },
    });
  }
  console.log('Created 10 test members with pending plan changes');
}

setup().finally(() => prisma.$disconnect());
EOF
```

**Run Two Instances:**

```bash
# Terminal 1
cd backend
CRON_DEBUG=1 npm run start:dev

# Terminal 2 (wait 2 seconds, then start)
cd backend
PORT=3001 CRON_DEBUG=1 npm run start:dev
```

**Trigger Job Manually (in both terminals simultaneously):**

```bash
# Terminal 1
curl -X POST http://localhost:3000/admin/trigger-cron/plan-change

# Terminal 2 (within 1 second)
curl -X POST http://localhost:3001/admin/trigger-cron/plan-change
```

**Expected Results:**

```bash
# Instance 1 logs:
[plan-change-scheduler-20260214020000-abc123] Starting scheduled membership plan change job
[plan-change-scheduler-20260214020000-abc123] Found 10 members with pending changes
[plan-change-scheduler-20260214020000-abc123] Lock acquired: cron:plan-change:member-001
[plan-change-scheduler-20260214020000-abc123] Applied pending change for member member-001
...
[plan-change-scheduler-20260214020000-abc123] Scheduled plan change job completed: 7 applied, 0 errors, 3 skipped (lock contention)

# Instance 2 logs:
[plan-change-scheduler-20260214020001-def456] Starting scheduled membership plan change job
[plan-change-scheduler-20260214020001-def456] Found 10 members with pending changes
[plan-change-scheduler-20260214020001-def456] Lock contention: cron:plan-change:member-001 (another instance holds lock)
[plan-change-scheduler-20260214020001-def456] Skipped member member-001 (locked by another instance)
...
[plan-change-scheduler-20260214020001-def456] Scheduled plan change job completed: 3 applied, 0 errors, 7 skipped (lock contention)
```

**Verify No Duplicates:**

```sql
-- Should see exactly 10 history records (not 20)
SELECT COUNT(*) FROM "MemberPlanChangeHistory" WHERE "changeType" = 'APPLIED';
-- Expected: 10

-- Check for duplicates by memberId
SELECT "memberId", COUNT(*)
FROM "MemberPlanChangeHistory"
WHERE "changeType" = 'APPLIED'
GROUP BY "memberId"
HAVING COUNT(*) > 1;
-- Expected: 0 rows (no duplicates)
```

---

### Test Scenario 2: Verify Status Sync Global Lock

**Setup:**

```bash
# Create members with expired memberships
npx ts-node -r tsconfig-paths/register <<'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function setup() {
  const tenant = await prisma.tenant.findFirst();
  const plan = await prisma.membershipPlan.findFirst({ where: { tenantId: tenant.id } });
  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id } });

  for (let i = 0; i < 20; i++) {
    await prisma.member.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: `Expired${i}`,
        lastName: 'Member',
        phone: `555-100${i}`,
        membershipPlanId: plan.id,
        membershipStartDate: new Date('2025-01-01'),
        membershipEndDate: new Date('2025-12-31'), // Yesterday
        status: 'ACTIVE',
      },
    });
  }
  console.log('Created 20 expired members with ACTIVE status');
}

setup().finally(() => prisma.$disconnect());
EOF
```

**Run Two Instances & Trigger:**

```bash
# Terminal 1
curl -X POST http://localhost:3000/admin/trigger-cron/status-sync

# Terminal 2 (within 1 second)
curl -X POST http://localhost:3001/admin/trigger-cron/status-sync
```

**Expected Results:**

```bash
# Instance 1 (acquired lock):
[status-sync-20260214030000-xyz789] Starting daily member status sync job
[status-sync-20260214030000-xyz789] Lock acquired: cron:member-status-sync:global
[status-sync-20260214030000-xyz789] Tenant tenant-001: Updated 20 expired members
[status-sync-20260214030000-xyz789] Status sync completed: 20 members updated across 1 tenants
[status-sync-20260214030000-xyz789] Lock released: 1234567890

# Instance 2 (lock contention):
[status-sync-20260214030001-uvw456] Starting daily member status sync job
[status-sync-20260214030001-uvw456] Lock contention: cron:member-status-sync:global (another instance holds lock)
[status-sync-20260214030001-uvw456] Job skipped: Another instance is running status sync
```

**Verify Results:**

```sql
-- All expired members should be INACTIVE (updated once)
SELECT COUNT(*) FROM "Member"
WHERE "membershipEndDate" < NOW() AND "status" = 'ACTIVE';
-- Expected: 0

SELECT COUNT(*) FROM "Member"
WHERE "membershipEndDate" < NOW() AND "status" = 'INACTIVE';
-- Expected: 20
```

---

## Additional Recommendations

### 1. Add Health Check for Lock Service

```typescript
// src/common/services/distributed-lock.service.ts
async healthCheck(): Promise<boolean> {
  try {
    const testLock = await this.tryAcquireLock('health-check', 'health', 0);
    if (testLock.acquired) {
      await this.releaseLock(testLock.lockKey, 'health');
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}
```

### 2. Monitor Lock Contention Metrics

Add Prometheus/Datadog metrics:

```typescript
// Increment counter on lock contention
this.metrics.increment("cron.lock.contention", { job: jobName });

// Track lock acquisition time
this.metrics.histogram("cron.lock.acquisition_time_ms", duration);
```

### 3. Consider Job Execution Time Limits

If a job runs longer than expected, it might hold locks too long. Add timeout monitoring:

```typescript
const MAX_JOB_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const jobStartTime = Date.now();

// ... job logic ...

if (Date.now() - jobStartTime > MAX_JOB_DURATION_MS) {
  this.logger.error(`Job exceeded max duration: ${jobName}`);
  throw new Error("Job timeout");
}
```

### 4. Add Manual Lock Release Endpoint (for emergencies)

```typescript
// src/admin/admin.controller.ts (secure with admin auth)
@Post('admin/locks/release/:lockName')
async releaseLockManually(@Param('lockName') lockName: string) {
  const lockKey = this.lockService.hashLockName(lockName);
  await this.lockService.releaseLock(lockKey, 'manual-admin-release');
  return { success: true, message: `Lock ${lockName} released` };
}
```

---

## Migration Path

### Phase 1: Deploy DistributedLockService (Non-Breaking)

1. Deploy lock service code (no jobs use it yet)
2. Verify health check passes
3. Monitor logs for any errors

### Phase 2: Patch P0 Job (MembershipPlanChangeScheduler)

1. Deploy patched code with lock logic
2. Monitor correlation IDs in logs
3. Verify no duplicate history records after 7 days
4. Rollback if issues detected

### Phase 3: Patch P1 Job (MemberStatusSyncService)

1. Deploy patched code with global lock
2. Monitor for expected lock contention logs
3. Verify single-instance execution
4. Rollback if issues detected

### Phase 4: Load Testing

1. Simulate 5+ concurrent instances in staging
2. Trigger jobs manually across all instances
3. Verify lock behavior under high load
4. Measure lock acquisition time percentiles

---

## Rollback Plan

If locking logic causes issues:

1. **Immediate Mitigation:** Scale down to single instance
2. **Code Rollback:** Revert to previous commits (lock service is isolated, easy to remove)
3. **Database Cleanup:** No schema changes required, clean rollback

**Rollback Detection Criteria:**

- Lock acquisition fails > 5% of the time
- Job duration increases > 50%
- Database connection pool exhaustion
- PG advisory locks not released (check `pg_locks` table)

**Monitor:**

```sql
-- Check for stale advisory locks
SELECT locktype, database, classid, objid, mode, granted
FROM pg_locks
WHERE locktype = 'advisory';
```

---

## Conclusion

**Summary:**

- **2 critical jobs** require distributed locking to prevent race conditions
- **PostgreSQL advisory locks** are the recommended approach (no Redis required)
- **Correlation IDs** provide full traceability across multi-instance deployments
- **Low-risk incremental rollout** with clear rollback path

**Next Steps:**

1. Review and approve lock service implementation
2. Deploy Phase 1 (lock service only)
3. Monitor for 48 hours
4. Deploy Phase 2 (P0 patch)
5. Monitor for 7 days
6. Deploy Phase 3 (P1 patch)

**Estimated Effort:**

- Implementation: 4-6 hours
- Testing: 2-4 hours
- Deployment & monitoring: 1 week

---

**Report End**
