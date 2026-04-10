import { EntitlementState } from '@prisma/client';
import {
  classifyRevenueCatWebhookEventType,
  computeEntitlementStateForSnapshotEvent,
  resolveSnapshotEntitlementId,
} from './revenuecat-webhook-events';
import { premiumAccessFromEntitlementSnapshot } from './entitlement-premium.util';

describe('classifyRevenueCatWebhookEventType', () => {
  it('classifies documented snapshot lifecycle types', () => {
    expect(classifyRevenueCatWebhookEventType('INITIAL_PURCHASE')).toBe(
      'snapshot',
    );
    expect(classifyRevenueCatWebhookEventType('CANCELLATION')).toBe('snapshot');
    expect(classifyRevenueCatWebhookEventType('EXPIRATION')).toBe('snapshot');
    expect(classifyRevenueCatWebhookEventType('REFUND')).toBe('snapshot');
    expect(classifyRevenueCatWebhookEventType('REFUND_REVERSED')).toBe(
      'snapshot',
    );
  });

  it('classifies non-snapshot types as customer_only', () => {
    expect(classifyRevenueCatWebhookEventType('TEST')).toBe('customer_only');
    expect(classifyRevenueCatWebhookEventType('SUBSCRIBER_ALIAS')).toBe(
      'customer_only',
    );
  });

  it('treats unknown strings as unknown (no substring guessing)', () => {
    expect(classifyRevenueCatWebhookEventType('FAKE_REFUND_EVENT')).toBe(
      'unknown',
    );
    expect(classifyRevenueCatWebhookEventType('MY_CANCELLATION')).toBe(
      'unknown',
    );
  });
});

describe('computeEntitlementStateForSnapshotEvent', () => {
  const now = new Date('2026-04-08T12:00:00.000Z');

  it('CANCELLATION with future expiration_at_ms preserves premium (auto-renew off, period not over)', () => {
    const future = new Date('2026-05-01T00:00:00.000Z').getTime();
    const r = computeEntitlementStateForSnapshotEvent(
      'CANCELLATION',
      { type: 'CANCELLATION', expiration_at_ms: future },
      now,
    );
    expect(r.state).toBe(EntitlementState.ACTIVE);
    expect(r.isActive).toBe(true);
    // Integration: hasPremiumAccess should be true
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: r.isActive,
        expiresAt: new Date(future),
        gracePeriodExpiresAt: null,
        now,
      }),
    ).toBe(true);
  });

  it('CANCELLATION with already-past expiration_at_ms yields INACTIVE (period ended)', () => {
    const past = new Date('2026-01-01T00:00:00.000Z').getTime();
    const r = computeEntitlementStateForSnapshotEvent(
      'CANCELLATION',
      { type: 'CANCELLATION', expiration_at_ms: past },
      now,
    );
    expect(r.state).toBe(EntitlementState.INACTIVE);
    expect(r.isActive).toBe(false);
    // Integration: hasPremiumAccess should be false
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: r.isActive,
        expiresAt: new Date(past),
        gracePeriodExpiresAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('maps EXPIRATION to inactive', () => {
    const r = computeEntitlementStateForSnapshotEvent(
      'EXPIRATION',
      { type: 'EXPIRATION' },
      now,
    );
    expect(r.state).toBe(EntitlementState.INACTIVE);
    expect(r.isActive).toBe(false);
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: r.isActive,
        expiresAt: null,
        gracePeriodExpiresAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('BILLING_ISSUE with active grace period yields GRACE_PERIOD and premium access', () => {
    const gracePeriodEndsMs = new Date('2026-04-15T00:00:00.000Z').getTime();
    const expiresMs = new Date('2026-04-08T00:00:00.000Z').getTime(); // already past
    const r = computeEntitlementStateForSnapshotEvent(
      'BILLING_ISSUE',
      {
        type: 'BILLING_ISSUE',
        expiration_at_ms: expiresMs,
        grace_period_expiration_at_ms: gracePeriodEndsMs,
      },
      now,
    );
    expect(r.state).toBe(EntitlementState.GRACE_PERIOD);
    expect(r.isActive).toBe(true);
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: r.isActive,
        expiresAt: new Date(expiresMs),
        gracePeriodExpiresAt: new Date(gracePeriodEndsMs),
        now,
      }),
    ).toBe(true);
  });

  it('BILLING_ISSUE with expired grace period yields INACTIVE (no premium)', () => {
    const gracePeriodEndsMs = new Date('2026-04-01T00:00:00.000Z').getTime(); // past
    const expiresMs = new Date('2026-04-01T00:00:00.000Z').getTime(); // past
    const r = computeEntitlementStateForSnapshotEvent(
      'BILLING_ISSUE',
      {
        type: 'BILLING_ISSUE',
        expiration_at_ms: expiresMs,
        grace_period_expiration_at_ms: gracePeriodEndsMs,
      },
      now,
    );
    expect(r.state).toBe(EntitlementState.INACTIVE);
    expect(r.isActive).toBe(false);
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: r.isActive,
        expiresAt: new Date(expiresMs),
        gracePeriodExpiresAt: new Date(gracePeriodEndsMs),
        now,
      }),
    ).toBe(false);
  });

  it('SUBSCRIPTION_PAUSED with future expiration_at_ms keeps premium (access revoked at expiration, not at pause)', () => {
    const futureMs = new Date('2026-05-01T00:00:00.000Z').getTime();
    const r = computeEntitlementStateForSnapshotEvent(
      'SUBSCRIPTION_PAUSED',
      { type: 'SUBSCRIPTION_PAUSED', expiration_at_ms: futureMs },
      now,
    );
    expect(r.state).toBe(EntitlementState.ACTIVE);
    expect(r.isActive).toBe(true);
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: r.isActive,
        expiresAt: new Date(futureMs),
        gracePeriodExpiresAt: null,
        now,
      }),
    ).toBe(true);
  });

  it('SUBSCRIPTION_PAUSED with past expiration_at_ms yields INACTIVE (entitlement expired)', () => {
    const pastMs = new Date('2026-01-01T00:00:00.000Z').getTime();
    const r = computeEntitlementStateForSnapshotEvent(
      'SUBSCRIPTION_PAUSED',
      { type: 'SUBSCRIPTION_PAUSED', expiration_at_ms: pastMs },
      now,
    );
    expect(r.state).toBe(EntitlementState.INACTIVE);
    expect(r.isActive).toBe(false);
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: r.isActive,
        expiresAt: new Date(pastMs),
        gracePeriodExpiresAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('uses dates for RENEWAL instead of string matching', () => {
    const future = new Date('2026-05-01T00:00:00.000Z').getTime();
    const r = computeEntitlementStateForSnapshotEvent(
      'RENEWAL',
      { type: 'RENEWAL', expiration_at_ms: future },
      now,
    );
    expect(r.state).toBe(EntitlementState.ACTIVE);
    expect(r.isActive).toBe(true);
  });

  it('maps REFUND to REFUNDED and inactive (no premium)', () => {
    const r = computeEntitlementStateForSnapshotEvent(
      'REFUND',
      { type: 'REFUND' },
      now,
    );
    expect(r.state).toBe(EntitlementState.REFUNDED);
    expect(r.isActive).toBe(false);
  });

  it('maps REFUND_REVERSED using expiration like other restoring events', () => {
    const future = new Date('2026-05-01T00:00:00.000Z').getTime();
    const r = computeEntitlementStateForSnapshotEvent(
      'REFUND_REVERSED',
      { type: 'REFUND_REVERSED', expiration_at_ms: future },
      now,
    );
    expect(r.state).toBe(EntitlementState.ACTIVE);
    expect(r.isActive).toBe(true);
  });

  it('after active renewal, REFUND revokes entitlement flags', () => {
    const future = new Date('2026-05-01T00:00:00.000Z').getTime();
    const active = computeEntitlementStateForSnapshotEvent(
      'RENEWAL',
      { type: 'RENEWAL', expiration_at_ms: future },
      now,
    );
    expect(active.isActive).toBe(true);

    const refunded = computeEntitlementStateForSnapshotEvent(
      'REFUND',
      { type: 'REFUND' },
      now,
    );
    expect(refunded.state).toBe(EntitlementState.REFUNDED);
    expect(refunded.isActive).toBe(false);
  });
});

describe('resolveSnapshotEntitlementId (REFUND premium revocation)', () => {
  const premium = 'premium';

  it('REFUND with entitlement_id keeps the payload entitlement key', () => {
    expect(resolveSnapshotEntitlementId('REFUND', 'custom_ent', premium)).toBe(
      'custom_ent',
    );
  });

  it('REFUND without entitlement_id falls back to REVENUECAT_PREMIUM_ENTITLEMENT_ID', () => {
    expect(resolveSnapshotEntitlementId('REFUND', null, premium)).toBe(premium);
  });

  it('REFUND without entitlement_id still maps to REFUNDED / inactive (no premium)', () => {
    const now = new Date('2026-04-08T12:00:00.000Z');
    const id = resolveSnapshotEntitlementId('REFUND', null, premium);
    expect(id).toBe(premium);
    const state = computeEntitlementStateForSnapshotEvent(
      'REFUND',
      { type: 'REFUND' },
      now,
    );
    expect(state.state).toBe(EntitlementState.REFUNDED);
    expect(state.isActive).toBe(false);
  });

  it('REFUND with entitlement_id maps to REFUNDED / inactive (no premium)', () => {
    const now = new Date('2026-04-08T12:00:00.000Z');
    const id = resolveSnapshotEntitlementId('REFUND', premium, premium);
    expect(id).toBe(premium);
    const state = computeEntitlementStateForSnapshotEvent(
      'REFUND',
      { type: 'REFUND' },
      now,
    );
    expect(state.state).toBe(EntitlementState.REFUNDED);
    expect(state.isActive).toBe(false);
  });
});

describe('resolveSnapshotEntitlementId (entitlement_ids fallback)', () => {
  const premium = 'premium';

  it('no entitlement_id but entitlement_ids includes premium → resolves to premium', () => {
    const id = resolveSnapshotEntitlementId(
      'TEMPORARY_ENTITLEMENT_GRANT',
      null,
      premium,
      [premium],
    );
    expect(id).toBe(premium);
  });

  it('no entitlement_id and entitlement_ids has unrelated ids → returns null for non-REFUND event', () => {
    const id = resolveSnapshotEntitlementId(
      'TEMPORARY_ENTITLEMENT_GRANT',
      null,
      premium,
      ['other_entitlement', 'yet_another'],
    );
    expect(id).toBeNull();
  });

  it('entitlement_id takes priority over entitlement_ids', () => {
    const id = resolveSnapshotEntitlementId('RENEWAL', 'explicit_id', premium, [
      premium,
      'other',
    ]);
    expect(id).toBe('explicit_id');
  });

  it('entitlement_ids with premium → snapshot write yields ACTIVE for TEMPORARY_ENTITLEMENT_GRANT with future expiration', () => {
    const now = new Date('2026-04-08T12:00:00.000Z');
    const futureMs = new Date('2026-05-01T00:00:00.000Z').getTime();
    const id = resolveSnapshotEntitlementId(
      'TEMPORARY_ENTITLEMENT_GRANT',
      null,
      premium,
      [premium],
    );
    expect(id).toBe(premium);
    const state = computeEntitlementStateForSnapshotEvent(
      'TEMPORARY_ENTITLEMENT_GRANT',
      { type: 'TEMPORARY_ENTITLEMENT_GRANT', expiration_at_ms: futureMs },
      now,
    );
    expect(state.state).toBe(EntitlementState.ACTIVE);
    expect(state.isActive).toBe(true);
    expect(
      premiumAccessFromEntitlementSnapshot({
        isActive: state.isActive,
        expiresAt: new Date(futureMs),
        gracePeriodExpiresAt: null,
        now,
      }),
    ).toBe(true);
  });

  it('REFUND with no entitlement_id and no entitlement_ids still falls back to premium', () => {
    const id = resolveSnapshotEntitlementId('REFUND', null, premium, []);
    expect(id).toBe(premium);
  });
});
