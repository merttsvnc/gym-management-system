import { EntitlementState } from '@prisma/client';
import {
  classifyRevenueCatWebhookEventType,
  computeEntitlementStateForSnapshotEvent,
  resolveSnapshotEntitlementId,
} from './revenuecat-webhook-events';

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

  it('maps CANCELLATION strictly by type (not substring)', () => {
    const r = computeEntitlementStateForSnapshotEvent(
      'CANCELLATION',
      { type: 'CANCELLATION' },
      now,
    );
    expect(r.state).toBe(EntitlementState.REVOKED);
    expect(r.isActive).toBe(false);
  });

  it('maps EXPIRATION to inactive', () => {
    const r = computeEntitlementStateForSnapshotEvent(
      'EXPIRATION',
      { type: 'EXPIRATION' },
      now,
    );
    expect(r.state).toBe(EntitlementState.INACTIVE);
    expect(r.isActive).toBe(false);
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
    expect(resolveSnapshotEntitlementId('REFUND', null, premium)).toBe(
      premium,
    );
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
