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

### Webhook idempotency and `IGNORED` retries

- **`PROCESSED`:** Same `event.id` is accepted again but does not re-apply side effects (idempotent).
- **`IGNORED`:** Not a terminal state. A later delivery with the same `event.id` re-runs validation (tenant resolution, replay window, timestamp skew, etc.). If preconditions become valid, the event is applied once and the row moves to `PROCESSED`. If still invalid, the row stays `IGNORED` and a new `RevenueCatWebhookDeliveryAttempt` is recorded (audit trail).
- **`FAILED`:** Processing error after the row was claimed in a transaction; not automatically retried by this handler (operational retry is a separate concern).
