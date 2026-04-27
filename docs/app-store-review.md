# App Store Review — Billing Compliance Notes

## Status

This document tracks App Store compliance items related to the billing and trial system.

---

## ✅ Fixed: Backend-only trial no longer grants premium access

**Issue:** The backend previously granted premium access when `billingStatus = TRIAL`, independent of
any App Store / RevenueCat entitlement. This is not App Store compliant because it bypasses the
in-app purchase system and may be flagged during App Store review.

**Resolution (completed):**

- `BillingEntitlementService` no longer treats `billingStatus = TRIAL` as a premium-access grant on
  any code path (including the `BILLING_LEGACY_FALLBACK_ENABLED=true` path).
- The `TRIAL_EXPIRED` error code (dead code, never returned by the guard) has been removed and
  replaced with the generalized `BILLING_REQUIRED` constant.
- A tenant with `billingStatus = TRIAL` but **no active RevenueCat entitlement snapshot** receives
  read-only access (`source: 'none'`). Mutations return **402 PAYMENT_REQUIRED** with
  `BILLING_ERROR_CODES.PREMIUM_REQUIRED`.
- New users still receive `billingStatus = TRIAL` as a label (no migration needed) but this value
  no longer unlocks any paid features.

**Source of truth for free trial:** StoreKit / RevenueCat introductory offers only.
Mobile clients detect `introductoryPrice` from RevenueCat and show trial UI accordingly. The
backend activates premium exclusively via the `RevenueCatEntitlementSnapshot` row (populated by the
RevenueCat webhook on `INITIAL_PURCHASE` and subsequent events).

---

## ✅ Fixed: RevenueCat entitlement is the single source of truth

Premium access resolution order (after this change):

1. If a `RevenueCatEntitlementSnapshot` row exists for `REVENUECAT_PREMIUM_ENTITLEMENT_ID` →
   `premiumAccessFromEntitlementSnapshot` is authoritative (`isActive` + date check).
2. Else if `BILLING_LEGACY_FALLBACK_ENABLED=true` → only `billingStatus = ACTIVE` grants access
   (TRIAL explicitly excluded).
3. Else → `source: 'none'` — mutations blocked with 402 until user subscribes via in-app purchase.
4. **SUSPENDED always denies** regardless of RevenueCat state.

---

## ⚠️ Remaining manual task: App Store Connect setup

The following items must be configured manually in App Store Connect and are NOT automated by this
codebase:

- **Introductory offer / free trial** must be configured on the subscription product in
  App Store Connect (e.g. 7-day free trial on the relevant product ID).
- The RevenueCat dashboard must map the correct product IDs to the `premium` entitlement identifier
  (matching `REVENUECAT_PREMIUM_ENTITLEMENT_ID` in the backend env).
- RevenueCat webhook URL must be registered pointing to
  `POST /api/v1/billing/revenuecat/webhook` with the correct `Authorization` header secret
  (`REVENUECAT_WEBHOOK_SECRET`).
- Sandbox testing of the introductory offer flow (StoreKit → RevenueCat `INITIAL_PURCHASE` webhook
  → backend entitlement snapshot → `hasPremiumAccess: true`) should be verified before submission.

---

## Reference

- Backend entitlement service: `backend/src/billing/billing-entitlement.service.ts`
- Billing guard: `backend/src/auth/guards/billing-status.guard.ts`
- Billing constants: `backend/src/common/constants/billing-messages.ts`
- Billing API docs: `docs/api/billing.md`
