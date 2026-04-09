/**
 * Per-row monotonic application of RevenueCat webhook payloads using `event_timestamp_ms`.
 * Callers must hold a row lock (e.g. SELECT … FOR UPDATE) on the snapshot row while evaluating this.
 */
export function shouldApplyWebhookEventByTimestamp(args: {
  storedLastAppliedAt: Date | null | undefined;
  incomingEventAt: Date;
}): boolean {
  if (args.storedLastAppliedAt == null) {
    return true;
  }
  return args.incomingEventAt.getTime() >= args.storedLastAppliedAt.getTime();
}
