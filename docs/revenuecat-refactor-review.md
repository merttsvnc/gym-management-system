# Code Review: RevenueCat / Apple Subscription Backend Refactor

**Date:** 2026-04-10  
**Verdict:** REQUEST CHANGES

---

## What Is Good

1. **Webhook auth uses `timingSafeEqual`** in `revenuecat-webhook.service.ts`. Correct constant-time comparison, correct `Buffer.from` usage, length check before compare. No timing side-channel.

2. **Env validation via Zod is strict** in `env.ts`. `REVENUECAT_WEBHOOK_SECRET` requires min 16 chars. `REVENUECAT_PREMIUM_ENTITLEMENT_ID` is required. App won't boot with missing config.

3. **Advisory locks for snapshot upserts** in `revenuecat-snapshot-advisory-lock.util.ts`. Solves the real problem: `SELECT ... FOR UPDATE` can't lock non-existent rows. `pg_advisory_xact_lock` with namespaced hashtext keys is correct.

4. **Monotonic event ordering** in `revenuecat-snapshot-ordering.util.ts`. `shouldApplyWebhookEventByTimestamp` uses `>=` (not `>`) — same-timestamp redeliveries don't get silently dropped.

5. **Payload fingerprint-based idempotency** is well thought through. SHA-256 of `JSON.stringify(payload)` stored as `idempotencyKey`. Same event + same payload → idempotent. Same event + different payload → `INVALID_PAYLOAD` terminal state. Covers the "RevenueCat replay with mutated body" attack vector.

6. **Delivery attempt audit trail** via `RevenueCatWebhookDeliveryAttempt`. Every re-delivery is logged with reason. Good for post-incident forensics.

7. **`@SkipBillingStatusCheck()` on webhook controller** is correct — webhook ingestion must not go through premium gating.

8. **`BillingStatusGuard` suspended-always-denies** logic is correct. Checked before premium evaluation. Returns 403. Even an active RevenueCat entitlement can't override. Tests exist.

9. **REFUND fallback to `REVENUECAT_PREMIUM_ENTITLEMENT_ID`** in `revenuecat-webhook-events.ts`. Handles the real RevenueCat quirk where `REFUND` events omit `entitlement_id`. Correct and documented.

10. **Transaction timeout** of 60s with 10s max wait is reasonable for a webhook handler writing 2–3 rows.

---

## What Is Risky

1. **`BILLING_LEGACY_FALLBACK_ENABLED` has zero unit tests** for the legacy path. `BillingEntitlementService.spec.ts` never sets it to `true`. If the fallback is used during migration (which is the stated purpose), any regression in that code path ships undetected. The E2E tests cover the old `billingStatus` guard behavior, not the legacy-fallback-through-RevenueCat path.

2. **`entitlementId ?? undefined` in subscription snapshot upsert.** When `entitlementId` is `null`, Prisma treats `undefined` as "don't update this field" on the `update` path. A subscription snapshot created with entitlementId `X` retains it even when a later event for the same product carries no entitlement. This is a data consistency gap — probably intentional but undocumented and untested.

3. **`BillingStatusGuard` parses JWT manually** before `JwtAuthGuard` runs. If `jwtService.verify()` uses different options than `JwtAuthGuard`, there's a silent discrepancy. The guard swallows errors and defers, which is safe for now, but creates latent coupling between guard execution order.

4. **`raw` column stores the full webhook body** on every entitlement and subscription snapshot upsert. With high-volume webhooks, these JSONB columns will bloat fast. No TTL or cleanup strategy is visible.

5. **`computeEntitlementStateForSnapshotEvent` default case** calls `premiumAccessFromEntitlementSnapshot` with `isActive: true` hardcoded. For `BILLING_ISSUE` and `SUBSCRIPTION_PAUSED`, this is permissive — they fall through to the default and may mark a snapshot active when they shouldn't.

6. **Replay window default 72 hours** is generous. A replayed 71-hour-old event from a compromised webhook secret will still be processed. RevenueCat retries can be slow, but 72h is at the upper end of what's reasonable.

---

## What Is Wrong

### 1. CRITICAL — Missing `ALTER TYPE` migration for new enum values

The initial migration `20260408120000_revenuecat_entitlements` creates:

```sql
CREATE TYPE "RevenueCatWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
```

The Prisma schema and application code use 7 values: `RECEIVED`, `PROCESSED`, `PROCESSED_APPLIED`, `PROCESSED_NOOP`, `IGNORED`, `FAILED`, `INVALID_PAYLOAD`.

The data migration `20260409100000_revenuecat_webhook_status_semantics` tries to `UPDATE ... SET status = 'PROCESSED_APPLIED'` but **no migration ever runs**:

```sql
ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE 'PROCESSED_APPLIED';
ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE 'PROCESSED_NOOP';
ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE 'INVALID_PAYLOAD';
```

The comment in that migration reads "Enum values have been added manually via ALTER TYPE commands" — but "manually" means they exist nowhere in version control. **This migration will crash on any fresh deploy or any environment that has not had manual intervention.**

### 2. Webhook controller has no authentication guard at all

`revenuecat-webhook.controller.ts` only has `@SkipBillingStatusCheck()`. There is no `@UseGuards()` of any kind. The only protection is the inline `verifyWebhookAuthorization()` call inside the service method.

This means:

- If someone removes or refactors `verifyWebhookAuthorization`, the endpoint becomes completely open.
- The auth check happens inside the service, not at the HTTP boundary. A future developer adding another method to this controller won't know they need manual auth.

### 3. `processWebhook` returns HTTP 200 for `tenant_not_found` IGNORED events

When `processWebhook` rejects an event with reason `tenant_not_found`, it calls `markEventIgnored()` and returns `{ ok: true }`. RevenueCat considers the delivery successful and **will not retry**. If the tenant was just being created (race condition at signup), the event is lost forever.

The docs describe `IGNORED` as "not terminal — a later delivery may re-evaluate", but that requires RevenueCat to retry, which it won't if it already received HTTP 200.

---

## What Must Be Changed Before Merge

1. **Add the missing `ALTER TYPE` commands** to a migration before or alongside `20260409100000`:

   ```sql
   ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'PROCESSED_APPLIED';
   ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'PROCESSED_NOOP';
   ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'INVALID_PAYLOAD';
   ```

   Without this, the application will not start on any clean database. This is a deployment blocker.

2. **Return HTTP 4xx (not 200) for `tenant_not_found` IGNORED events** so RevenueCat retries. `invalid_format` can stay 200. `stale_replay` can stay 200. But `tenant_not_found` is a transient condition that will resolve once provisioning completes — silent 200 causes permanent event loss.

3. **Add unit tests for the legacy fallback path** in `billing-entitlement.service.spec.ts`. Minimum required cases:
   - Legacy enabled + `ACTIVE` → premium
   - Legacy enabled + `TRIAL` + future `trialEndsAt` → premium
   - Legacy enabled + `TRIAL` + expired `trialEndsAt` → no premium
   - Legacy enabled + `PAST_DUE` → no premium
   - Legacy disabled + no snapshot → no premium

---

## What Can Wait Until Later

1. **Dedicated webhook auth guard** instead of inline service call. Low risk, but bad architecture hygiene.
2. **Explicit handling of `BILLING_ISSUE` and `SUBSCRIPTION_PAUSED`** in `computeEntitlementStateForSnapshotEvent`. Current behavior is permissive rather than dangerous.
3. **`raw` column cleanup / TTL strategy.** Not urgent until you have volume.
4. **`entitlementId ?? undefined` data consistency gap** in subscription snapshots — document the decision or fix it.
5. **Advisory lock integration test against a real Postgres instance.** The unit test only mocks the lock; a real DB test would catch lock key collisions.
6. **Execution-time warn threshold** in `BillingStatusGuard` is 10ms, which is too noisy. Consider 50ms.
