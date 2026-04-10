# Billing API

## Purpose

RevenueCat-backed subscription and entitlement APIs for mobile clients and webhook ingestion.

## Source of Truth

- **Premium access** is determined from RevenueCat entitlement snapshots in the backend (`RevenueCatEntitlementSnapshot` for the configured premium entitlement id), except as noted below.
- **`REFUND` webhooks and premium:** Production treats any `REFUND` event as revoking premium for the tenant. The entitlement snapshot row for `REVENUECAT_PREMIUM_ENTITLEMENT_ID` is always updated to `state: REFUNDED` and `isActive: false`, even when RevenueCat omits `entitlement_id` in the payload (the backend falls back to `REVENUECAT_PREMIUM_ENTITLEMENT_ID`). The subscription snapshot for the product (when `product_id` is present) is updated with `purchaseStatus: REFUND`, a non-null `refundedAt`, and `willRenew: false`. This assumes your premium offering is represented by that single configured entitlement identifier.
- Tenant `billingStatus` (and related trial fields) are **not** the primary premium authority when a RevenueCat entitlement snapshot exists. In particular, **`PAST_DUE` does not override** an active premium entitlement from RevenueCat (in-app subscription wins). With legacy fallback only (no snapshot), `PAST_DUE` still does not grant premium access.
- **Optional legacy bridge:** when `BILLING_LEGACY_FALLBACK_ENABLED=true`, tenants without a RevenueCat entitlement snapshot may still get premium if `billingStatus` is `ACTIVE`, or `TRIAL` with a future `trialEndsAt`. This is intended for migration only; keep `false` in production target state (see `backend/.env.example`).
- **Suspended tenants:** when `billingStatus` is `SUSPENDED`, premium is denied for API access regardless of RevenueCat snapshot state (`hasPremiumAccess` is false and `tenantSuspended` is true on `GET /me/*` entitlement responses).

## RevenueCat app user id (canonical)

- **Canonical format:** `tenant:<tenantId>` (CUID of the tenant). Webhooks must use this as `app_user_id` / `original_app_user_id` for premium-scoped processing.
- **Other formats** (for example `user:<userId>`) are rejected as `invalid_format` and the event is ignored (no snapshot updates).

## Base Paths

- Mobile status endpoints: `/api/v1/me`
- RevenueCat webhook endpoint: `/api/v1/billing/revenuecat`

## Endpoints

- `GET /api/v1/me/entitlements`
- `GET /api/v1/me/subscription-status`
- `POST /api/v1/billing/revenuecat/webhook`

## Request/Response

### `GET /me/entitlements`

Response:

```json
{
  "hasPremiumAccess": true,
  "tenantSuspended": false,
  "source": "revenuecat",
  "reason": "RevenueCat entitlement is active",
  "premium": {
    "entitlementId": "premium",
    "state": "ACTIVE",
    "isActive": true,
    "productId": "com.example.pro.monthly",
    "expiresAt": "2026-05-01T00:00:00.000Z",
    "gracePeriodExpiresAt": null,
    "updatedAt": "2026-04-08T10:00:00.000Z"
  },
  "legacy": {
    "billingStatus": "TRIAL",
    "trialEndsAt": null
  },
  "evaluatedAt": "2026-04-08T10:00:01.000Z"
}
```

### `GET /me/subscription-status`

Response (same canonical schema as `/me/entitlements`):

```json
{
  "hasPremiumAccess": false,
  "source": "none",
  "reason": "No RevenueCat entitlement snapshot available",
  "premium": null,
  "legacy": {
    "billingStatus": "TRIAL",
    "trialEndsAt": null
  },
  "evaluatedAt": "2026-04-08T10:00:01.000Z"
}
```

### `POST /billing/revenuecat/webhook`

Headers:

- `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`

Body:

- RevenueCat webhook payload (`event.id`, `event.type`, and related subscription/entitlement fields).

Response:

```json
{ "ok": true, "eventId": "event_uuid" }
```

### Webhook idempotency, payload fingerprint, and retries

- **`PROCESSED_APPLIED`:** Terminal — this delivery updated at least one entitlement or subscription snapshot row (timestamp ordering allowed the write). Same `event.id` with the **same** payload fingerprint is a no-op; a different fingerprint after a terminal success is recorded on `RevenueCatWebhookDeliveryAttempt` with reason `payload_integrity_mismatch_after_terminal` (row status is unchanged).
- **`PROCESSED_NOOP`:** Terminal — processing finished but **no** snapshot row was mutated (e.g. customer-only/unknown event class, stale timestamp vs `lastAppliedEventAt`, or missing `product_id` / entitlement path). Same `event.id` + same fingerprint is a no-op.
- **`PROCESSED`:** Legacy enum value only; existing rows are migrated to `PROCESSED_APPLIED`. New writes do not use `PROCESSED`.
- **`IGNORED`:** Not a terminal state. A later delivery with the same `event.id` re-runs validation (tenant resolution, replay window, timestamp skew, etc.). If preconditions become valid, the row is claimed in a transaction and may move to `PROCESSED_APPLIED` or `PROCESSED_NOOP`. If still invalid, the row stays `IGNORED` and a new `RevenueCatWebhookDeliveryAttempt` is recorded (audit trail).
- **`FAILED`:** The last attempt hit an error inside the processing transaction (row was `RECEIVED` or `FAILED`). This handler does **not** implement an internal retry loop. A **new HTTP delivery** (e.g. RevenueCat retry) calls the endpoint again; if the row is still `FAILED` or `RECEIVED` and the payload fingerprint matches the first-seen value on the row, processing is attempted again.
- **`INVALID_PAYLOAD`:** Terminal — the same `event.id` was delivered again with a different payload fingerprint than the one stored on the first persist for that row (SHA-256 of `JSON.stringify` of the raw body). Further deliveries append `RevenueCatWebhookDeliveryAttempt` rows and return `ok` without re-applying.

## RevenueCat event-type to entitlement state mapping

| Event type                    | `EntitlementState`           | `isActive` | Premium access | Notes                                                                                                               |
| ----------------------------- | ---------------------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `INITIAL_PURCHASE`            | `ACTIVE` or `INACTIVE`       | date-based | date-based     | Access until `expiration_at`.                                                                                       |
| `RENEWAL`                     | `ACTIVE` or `INACTIVE`       | date-based | date-based     | Access until `expiration_at`.                                                                                       |
| `UNCANCELLATION`              | `ACTIVE` or `INACTIVE`       | date-based | date-based     | Auto-renew re-enabled.                                                                                              |
| `CANCELLATION`                | `ACTIVE` or `INACTIVE`       | date-based | date-based     | **Auto-renew disabled, NOT immediate revoke.** Access continues until `expiration_at`.                              |
| `EXPIRATION`                  | `INACTIVE`                   | `false`    | ✗              | Subscription truly ended.                                                                                           |
| `BILLING_ISSUE`               | `GRACE_PERIOD` or `INACTIVE` | date-based | date-based     | If `grace_period_expiration_at` is in future → `GRACE_PERIOD` + access. Otherwise `INACTIVE`.                       |
| `SUBSCRIPTION_PAUSED`         | `INACTIVE`                   | `false`    | ✗              | Android-only pause. No access during pause window; `expiration_at` holds the resume date, not a premium window end. |
| `REFUND`                      | `REFUNDED`                   | `false`    | ✗              | Immediate revoke. Falls back to `REVENUECAT_PREMIUM_ENTITLEMENT_ID` if `entitlement_id` is absent.                  |
| `PRODUCT_CHANGE`              | `ACTIVE` or `INACTIVE`       | date-based | date-based     | Access until new `expiration_at`.                                                                                   |
| `SUBSCRIPTION_EXTENDED`       | `ACTIVE` or `INACTIVE`       | date-based | date-based     | Extended period.                                                                                                    |
| `TEMPORARY_ENTITLEMENT_GRANT` | `ACTIVE` or `INACTIVE`       | date-based | date-based     | Temporary grant period.                                                                                             |
| `REFUND_REVERSED`             | `ACTIVE` or `INACTIVE`       | date-based | date-based     | Premium restored per dates.                                                                                         |
| `NON_RENEWING_PURCHASE`       | `ACTIVE` or `INACTIVE`       | date-based | date-based     | One-time purchase.                                                                                                  |
| `TRANSFER`                    | _(no snapshot)_              | —          | —              | Customer-only event; no entitlement or subscription snapshot written.                                               |
| `TEST`                        | _(no snapshot)_              | —          | —              | Customer-only event.                                                                                                |

> **Design note on `CANCELLATION`:** RevenueCat fires `CANCELLATION` when a user disables auto-renew in the App Store or Google Play. The paid period is not over; the user retains full premium access until `expiration_at`. The backend therefore uses date-based logic (same as `RENEWAL`) and does **not** immediately set `isActive: false`. Premium expires naturally when the `EXPIRATION` event arrives or when `expiration_at` passes and `hasPremiumAccess` is re-evaluated.
