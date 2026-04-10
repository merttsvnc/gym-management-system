/**
 * Thrown when a webhook references a tenant that does not yet exist.
 *
 * This is a transient condition (signup / provisioning race) — the caller
 * should respond with a retryable HTTP status so RevenueCat re-delivers.
 */
export class RevenueCatTenantNotFoundError extends Error {
  readonly eventId: string;

  constructor(eventId: string) {
    super(`tenant_not_found for eventId=${eventId}`);
    this.name = 'RevenueCatTenantNotFoundError';
    this.eventId = eventId;
  }
}
