import { subscriptionEnvironmentToIsSandbox } from './revenuecat-subscription-snapshot.util';

describe('subscriptionEnvironmentToIsSandbox', () => {
  it('returns true for SANDBOX (create/update parity)', () => {
    expect(subscriptionEnvironmentToIsSandbox('SANDBOX')).toBe(true);
  });

  it('returns false for PRODUCTION', () => {
    expect(subscriptionEnvironmentToIsSandbox('PRODUCTION')).toBe(false);
  });

  it('returns undefined for unknown or empty strings', () => {
    expect(subscriptionEnvironmentToIsSandbox('STAGING')).toBeUndefined();
    expect(subscriptionEnvironmentToIsSandbox('')).toBeUndefined();
    expect(subscriptionEnvironmentToIsSandbox('  ')).toBeUndefined();
  });

  it('returns undefined for non-string environment', () => {
    expect(subscriptionEnvironmentToIsSandbox(null)).toBeUndefined();
    expect(subscriptionEnvironmentToIsSandbox(undefined)).toBeUndefined();
    expect(subscriptionEnvironmentToIsSandbox(1)).toBeUndefined();
  });

  it('trims whitespace before matching', () => {
    expect(subscriptionEnvironmentToIsSandbox('  SANDBOX  ')).toBe(true);
    expect(subscriptionEnvironmentToIsSandbox('\tPRODUCTION\n')).toBe(false);
  });

  it('matches the value used for both create and update on RevenueCatSubscriptionSnapshot', () => {
    const forCreate = subscriptionEnvironmentToIsSandbox('PRODUCTION');
    const forUpdate = subscriptionEnvironmentToIsSandbox('PRODUCTION');
    expect(forCreate).toBe(forUpdate);
    expect(forCreate).toBe(false);
  });
});
