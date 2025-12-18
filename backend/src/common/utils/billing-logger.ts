import { Logger } from '@nestjs/common';
import { BillingStatus } from '@prisma/client';

/**
 * Structured logging utility for billing status changes
 *
 * This utility provides consistent logging format for billing status transitions
 * with structured JSON output including timestamp, tenantId, oldStatus, newStatus, and correlationId.
 *
 * Log levels:
 * - INFO: Normal transitions (TRIAL → ACTIVE, ACTIVE → PAST_DUE, PAST_DUE → ACTIVE)
 * - WARN: SUSPENDED transitions (any status → SUSPENDED, SUSPENDED → any status)
 */
export class BillingLogger {
  private static readonly logger = new Logger('BillingStatus');

  /**
   * Log billing status change
   *
   * @param tenantId - Tenant ID
   * @param oldStatus - Previous billing status (null for initial status)
   * @param newStatus - New billing status
   * @param correlationId - Optional correlation ID for tracing (e.g., request ID)
   */
  static logStatusChange(
    tenantId: string,
    oldStatus: BillingStatus | null,
    newStatus: BillingStatus,
    correlationId?: string,
  ): void {
    const logData = {
      timestamp: new Date().toISOString(),
      tenantId,
      oldStatus: oldStatus ?? 'null',
      newStatus,
      correlationId: correlationId ?? 'unknown',
    };

    // Determine log level based on status transition
    const isSuspendedTransition =
      oldStatus === BillingStatus.SUSPENDED ||
      newStatus === BillingStatus.SUSPENDED;

    if (isSuspendedTransition) {
      // WARN level for SUSPENDED transitions
      this.logger.warn(
        `Billing status change: ${oldStatus ?? 'null'} → ${newStatus}`,
        JSON.stringify(logData),
      );
    } else {
      // INFO level for normal transitions
      this.logger.log(
        `Billing status change: ${oldStatus ?? 'null'} → ${newStatus}`,
        JSON.stringify(logData),
      );
    }
  }

  /**
   * Log billing status query (for monitoring/debugging)
   *
   * @param tenantId - Tenant ID
   * @param billingStatus - Current billing status
   * @param context - Optional context (e.g., endpoint, operation)
   */
  static logStatusQuery(
    tenantId: string,
    billingStatus: BillingStatus,
    context?: string,
  ): void {
    const logData = {
      timestamp: new Date().toISOString(),
      tenantId,
      billingStatus,
      context: context ?? 'unknown',
    };

    this.logger.debug(
      `Billing status query: ${billingStatus}`,
      JSON.stringify(logData),
    );
  }
}
