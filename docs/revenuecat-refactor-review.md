# Code Review: RevenueCat / Apple Subscription Backend Refactor

**Date:** 2026-04-10 (re-review — all prior blockers verified fixed)
**Verdict:** APPROVE with required cleanup

---

## Status of Previously Reported Issues

All three blockers from the prior review are confirmed **fixed in the current code**:

| Prior finding                                                                     | Status                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing `ALTER TYPE` for `PROCESSED_APPLIED`, `PROCESSED_NOOP`, `INVALID_PAYLOAD` | ✅ Fixed — migration `20260409100000` has correct `IF NOT EXISTS` statements                                                                                               |
| No auth guard at controller level                                                 | ✅ Fixed — `@UseGuards(RevenueCatWebhookAuthGuard)` is on the class                                                                                                        |
| `tenant_not_found` returned HTTP 200 (silent event loss)                          | ✅ Fixed — service throws `RevenueCatTenantNotFoundError`, controller maps to 503                                                                                          |
| `BILLING_LEGACY_FALLBACK_ENABLED` had no unit tests                               | ✅ Fixed — `billing-entitlement.service.spec.ts` now has a full `legacy fallback path` describe block covering ACTIVE, TRIAL, PAST_DUE, expired trial, and disabled states |

---

## What Is Good

1. **Migration is now deploy-safe.** `IF NOT EXISTS` means it's idempotent on both fresh DBs and existing installations.

2. **Auth is at the HTTP boundary.** `RevenueCatWebhookAuthGuard` is class-level. New endpoints added to this controller cannot accidentally miss auth. Constant-time comparison (`timingSafeEqual`) after length check. Secure.

3. **Idempotency design is correct.** SHA-256 fingerprint stored as `idempotencyKey`. Same event + same payload → no-op. Same event + different payload → `INVALID_PAYLOAD` terminal. Pick-up on retry works correctly for IGNORED rows with matching fingerprints.

4. **Advisory locks solve the real race.** `SELECT ... FOR UPDATE` cannot lock non-existent rows. `pg_advisory_xact_lock` is transaction-scoped and correct for serializing first-inserts. Namespace separation (`rc_ent_snap_v1` vs `rc_sub_snap_v1`) prevents cross-table lock aliasing.

5. **Timestamp ordering is correct.** `shouldApplyWebhookEventByTimestamp` uses `>=` — same-timestamp redeliveries are re-applied rather than silently dropped.

6. **503 for `tenant_not_found`.** RevenueCat will retry. Prevents permanent event loss on signup races.

7. **`BILLING_ISSUE` / `SUBSCRIPTION_PAUSED` fall-through is acceptable.** Both use the expiration date path, which correctly reflects actual entitlement state. RevenueCat sends grace period dates with `BILLING_ISSUE`, so the grace period check handles it.

8. **Delivery attempt audit trail** via `RevenueCatWebhookDeliveryAttempt`. Every re-delivery is logged with reason. Good for post-incident forensics.

9. **REFUND fallback to `REVENUECAT_PREMIUM_ENTITLEMENT_ID`.** Handles the real RevenueCat quirk where `REFUND` events omit `entitlement_id`. Correct and documented.

10. **Transaction timeout** of 60s with 10s max wait is reasonable for a webhook handler writing 2–3 rows.

---

## What Is Wrong

### 1. `verifyWebhookAuthorization` is permanently dead code in the service

`revenuecat-webhook.service.ts` contains `verifyWebhookAuthorization()` with a full `timingSafeEqual` check. It is **never called anywhere in production code** — zero callers confirmed. Auth happens entirely in `RevenueCatWebhookAuthGuard`. The method:

- Creates false belief that auth may be happening in two places
- Imports `UnauthorizedException` solely for this unused method
- Will mislead a future developer who removes the guard ("auth is also in the service, I'm okay")

The guard is the correct single place for auth. **This method must be deleted.**

### 2. Advisory lock uses only 32-bit key space for the variable slot

```ts
pg_advisory_xact_lock(
  hashtext("rc_ent_snap_v1"),
  hashtext(`${tenantId}:${entitlementId}`),
);
```

`pg_advisory_xact_lock(int4, int4)` takes two 32-bit integers. The first argument is the **same constant** for all entitlement locks. The second is a 32-bit hash. At ~8,000 unique composites birthday paradox collision probability exceeds 0.7%. At 50,000 tenants it exceeds 25%. Collisions don't cause incorrect behavior (locking still works), but unrelated tenants serialize unnecessarily. Latent scalability risk.

### 3. `stale_replay` unit test is incorrectly mocked

The second-delivery mock uses `idempotencyKey: payloadFingerprint(payloadFresh)`, but in production the stored key would be `payloadFingerprint(payloadStale)` — a different value. With mismatched fingerprints the transaction would mark the row `INVALID_PAYLOAD`, not process it. The test passes only because it lies about the stored state, creating false confidence.

---

## What Is Risky

1. **`entitlementId ?? undefined` in subscription snapshot upsert — silent no-update, undocumented, untested.** When a RENEWAL event omits `entitlement_id`, Prisma's `undefined` semantics on the `update` path means the existing value is silently retained. Probably intentional, but no comment or test covers it.

2. **`BillingStatusGuard` manually re-parses JWT** before `JwtAuthGuard` runs. If `jwtService.verify()` options differ from those in `JwtAuthGuard`, the guard makes an enforcement decision on a differently-validated payload. Currently safe (errors are swallowed → check skipped), but also parses the same token twice per request.

3. **No e2e test for the webhook HTTP stack.** No test posts an actual HTTP request to `POST /billing/revenuecat/webhook` and verifies an entitlement snapshot row is written in the DB. All unit tests mock Prisma. Guard registration, body parsing, and DB integration are not integration-tested.

4. **`raw` JSONB column stores full webhook body** on every snapshot upsert. At high volume this bloats fast. No cleanup strategy.

5. **Replay window default 72 hours** is generous. A replayed 71-hour-old event from a compromised secret still processes.

---

## What Must Be Changed Before Merge

1. **Delete `verifyWebhookAuthorization` from `RevenueCatWebhookService`.** It is dead code that actively misleads about where auth happens. Remove the method and the now-unused `UnauthorizedException` import.

2. **Fix or comment `entitlementId ?? undefined` on the upsert update path.** Add a comment asserting the intentional "don't overwrite with null" semantics and add a unit test covering a RENEWAL event with no `entitlement_id` following a prior event that had one.

---

## What Can Wait Until Later

1. Advisory lock 32-bit key space — not an issue at current scale; worth addressing before scaling to tens of thousands of tenants (switch to `pg_advisory_xact_lock(bigint)` with a 64-bit hash projection).
2. Fix `stale_replay` unit test mock — use `payloadFingerprint(payloadStale)` as the stored key and add a separate happy-path test for exact-same-payload retry.
3. Duplicate `/me/entitlements` vs `/me/subscription-status` endpoints — deprecate one or document the canonical path.
4. Double JWT parse in `BillingStatusGuard` — no security consequence, minor latency and complexity.
5. E2e test for the webhook HTTP flow — add after merge.
6. `raw` JSONB column size monitoring — operational concern, no schema change needed yet.
