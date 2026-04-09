import { shouldApplyWebhookEventByTimestamp } from './revenuecat-snapshot-ordering.util';

describe('shouldApplyWebhookEventByTimestamp', () => {
  const newer = new Date('2026-04-08T12:00:02.000Z');
  const older = new Date('2026-04-08T12:00:01.000Z');

  it('applies when no prior event timestamp is stored', () => {
    expect(
      shouldApplyWebhookEventByTimestamp({
        storedLastAppliedAt: null,
        incomingEventAt: older,
      }),
    ).toBe(true);
    expect(
      shouldApplyWebhookEventByTimestamp({
        storedLastAppliedAt: undefined,
        incomingEventAt: older,
      }),
    ).toBe(true);
  });

  it('applies when incoming event is newer than stored (monotonic forward)', () => {
    expect(
      shouldApplyWebhookEventByTimestamp({
        storedLastAppliedAt: older,
        incomingEventAt: newer,
      }),
    ).toBe(true);
  });

  it('re-applies when incoming equals stored (same event redelivery)', () => {
    expect(
      shouldApplyWebhookEventByTimestamp({
        storedLastAppliedAt: newer,
        incomingEventAt: newer,
      }),
    ).toBe(true);
  });

  it('rejects stale events: newer already applied, older arrives later (no overwrite)', () => {
    expect(
      shouldApplyWebhookEventByTimestamp({
        storedLastAppliedAt: newer,
        incomingEventAt: older,
      }),
    ).toBe(false);
  });
});
