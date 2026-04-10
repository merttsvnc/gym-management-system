import { EntitlementState } from '@prisma/client';
import { premiumAccessFromEntitlementSnapshot } from './entitlement-premium.util';

/**
 * RevenueCat webhook `event.type` values that carry subscription/entitlement fields we persist.
 * @see https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
export const REVENUECAT_SNAPSHOT_EVENT_TYPES = new Set<string>([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND',
  'REFUND_REVERSED',
]);

const REVENUECAT_CUSTOMER_ONLY_EVENT_TYPES = new Set<string>([
  'TEST',
  'SUBSCRIBER_ALIAS',
  'TRANSFER',
  'INVOICE_ISSUANCE',
  'VIRTUAL_CURRENCY_TRANSACTION',
  'EXPERIMENT_ENROLLMENT',
]);

export type RevenueCatWebhookEventClass =
  | 'snapshot'
  | 'customer_only'
  | 'unknown';

export function classifyRevenueCatWebhookEventType(
  eventType: string,
): RevenueCatWebhookEventClass {
  if (REVENUECAT_SNAPSHOT_EVENT_TYPES.has(eventType)) {
    return 'snapshot';
  }
  if (REVENUECAT_CUSTOMER_ONLY_EVENT_TYPES.has(eventType)) {
    return 'customer_only';
  }
  return 'unknown';
}

/**
 * Entitlement id used for `RevenueCatEntitlementSnapshot` upserts.
 * `REFUND` without `entitlement_id` in the payload still must revoke premium, so we fall back to
 * `REVENUECAT_PREMIUM_ENTITLEMENT_ID` (passed as `premiumEntitlementId`).
 */
export function resolveSnapshotEntitlementId(
  eventType: string,
  entitlementIdFromEvent: string | null,
  premiumEntitlementId: string,
): string | null {
  return (
    entitlementIdFromEvent ??
    (eventType === 'REFUND' ? premiumEntitlementId : null)
  );
}

function toDate(value: unknown): Date | null {
  if (typeof value === 'number') {
    const fromMillis = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(fromMillis.getTime()) ? null : fromMillis;
  }
  if (typeof value === 'string') {
    const fromString = new Date(value);
    return Number.isNaN(fromString.getTime()) ? null : fromString;
  }
  return null;
}

/**
 * Entitlement state for a snapshot-eligible event type (strict `event.type`, no substring matching).
 *
 * RevenueCat event semantics:
 * - CANCELLATION: user disabled auto-renew; access continues until `expiration_at`. Falls through to
 *   date-based logic. Do NOT immediately revoke — the paid period is not over.
 * - EXPIRATION: subscription truly ended → INACTIVE immediately.
 * - REFUND: money returned → REFUNDED / no access immediately.
 * - SUBSCRIPTION_PAUSED (Android): subscription paused; no access during pause window even if
 *   `expiration_at` is in the future (that field holds the pause-end/resume date) → INACTIVE.
 * - BILLING_ISSUE: payment failed; RevenueCat issues a grace period (`grace_period_expiration_at`).
 *   Falls through to default which checks grace first, then expiration → GRACE_PERIOD or INACTIVE.
 * - RENEWAL / INITIAL_PURCHASE / UNCANCELLATION / PRODUCT_CHANGE / etc.: fall through to date logic.
 */
export function computeEntitlementStateForSnapshotEvent(
  eventType: string,
  event: Record<string, unknown>,
  now: Date,
): { state: EntitlementState; isActive: boolean } {
  switch (eventType) {
    case 'EXPIRATION':
      return { state: EntitlementState.INACTIVE, isActive: false };
    case 'REFUND':
      return { state: EntitlementState.REFUNDED, isActive: false };
    case 'SUBSCRIPTION_PAUSED':
      // Android-only pause: no premium access during the pause window.
      // expiration_at in this event holds the resume date, not a premium window end.
      return { state: EntitlementState.INACTIVE, isActive: false };
    // CANCELLATION intentionally falls through to default:
    // auto-renew was turned off but the user retains access until expiration_at.
    default: {
      const expiresAt = toDate(event.expiration_at_ms ?? event.expiration_at);
      const gracePeriodEnds = toDate(
        event.grace_period_expiration_at_ms ?? event.grace_period_expiration_at,
      );
      const hasGrace = Boolean(gracePeriodEnds && gracePeriodEnds > now);
      if (hasGrace) {
        return { state: EntitlementState.GRACE_PERIOD, isActive: true };
      }
      const datesAllowPremium = premiumAccessFromEntitlementSnapshot({
        isActive: true,
        expiresAt,
        gracePeriodExpiresAt: null,
        now,
      });
      if (datesAllowPremium) {
        return { state: EntitlementState.ACTIVE, isActive: true };
      }
      return { state: EntitlementState.INACTIVE, isActive: false };
    }
  }
}
