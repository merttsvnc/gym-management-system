/**
 * Single source of truth for "does stored RevenueCat entitlement data grant premium time window?"
 * Aligns webhook snapshot writes (isActive + dates) with BillingEntitlementService reads.
 *
 * Rules:
 * - isActive must be true (set by webhook from event semantics).
 * - Access if grace period is open, OR expiration is null (lifetime / non-expiring), OR expiration is in the future.
 */
export function premiumAccessFromEntitlementSnapshot(params: {
  isActive: boolean;
  expiresAt: Date | null;
  gracePeriodExpiresAt: Date | null;
  now: Date;
}): boolean {
  const { isActive, expiresAt, gracePeriodExpiresAt, now } = params;
  if (!isActive) {
    return false;
  }
  const graceActive = Boolean(
    gracePeriodExpiresAt && gracePeriodExpiresAt > now,
  );
  if (graceActive) {
    return true;
  }
  if (expiresAt === null) {
    return true;
  }
  return expiresAt > now;
}
