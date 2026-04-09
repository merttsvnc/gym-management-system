/**
 * Maps RevenueCat webhook `event.environment` to subscription snapshot `isSandbox`.
 * Same rules for create and update paths on RevenueCatSubscriptionSnapshot.
 */
export function subscriptionEnvironmentToIsSandbox(
  environment: unknown,
): boolean | undefined {
  if (typeof environment !== 'string') {
    return undefined;
  }
  const e = environment.trim();
  if (e === 'SANDBOX') {
    return true;
  }
  if (e === 'PRODUCTION') {
    return false;
  }
  return undefined;
}
