import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { getTodayStart } from '../common/utils/membership-status.util';
import { PgAdvisoryLockService } from '../common/services/pg-advisory-lock.service';
import type { Prisma } from '@prisma/client';

const GLOBAL_LOCK_NAME = 'cron:status-sync:global';

/**
 * Daily status sync service
 *
 * BUSINESS RULE:
 * Syncs member status field with derived membership state.
 * Finds members where:
 * - status = ACTIVE
 * - membershipEndDate < today
 * - tenant-scoped (all tenants processed)
 *
 * Updates status to INACTIVE to align manual status with derived membership state.
 *
 * Runs daily at 03:00 AM to catch expired memberships.
 * Uses global advisory lock so only one instance runs per execution window.
 */
@Injectable()
export class MemberStatusSyncService {
  private readonly logger = new Logger(MemberStatusSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: PgAdvisoryLockService,
  ) {}

  /**
   * Daily cron job to sync member statuses
   * Runs at 03:00 AM every day
   */
  @Cron('0 3 * * *', {
    name: 'sync-expired-member-statuses',
    timeZone: 'UTC',
  })
  async handleCron() {
    const correlationId =
      this.lockService.generateCorrelationId('status-sync');
    this.logger.log(
      `[${correlationId}] Starting daily member status sync job`,
    );

    const { acquired } = await this.lockService.executeWithLock(
      GLOBAL_LOCK_NAME,
      correlationId,
      (tx) => this.syncExpiredMemberStatusesWithTx(correlationId, tx),
    );

    if (!acquired) {
      this.logger.log(
        `[${correlationId}] Job skipped: Another instance is running status sync`,
      );
    }
  }

  /**
   * Sync expired member statuses
   * Can be called directly for testing or manual execution
   *
   * @param correlationId Optional correlation ID for logging (defaults to "manual")
   * @returns Object with counts of updated members per tenant
   */
  async syncExpiredMemberStatuses(
    correlationId: string = 'manual',
  ): Promise<{
    totalUpdated: number;
    updatesByTenant: Record<string, number>;
  }> {
    return this.prisma.$transaction((tx) =>
      this.syncExpiredMemberStatusesWithTx(correlationId, tx),
    );
  }

  /**
   * Sync expired member statuses using the provided transaction client.
   * Used by executeWithLock to keep lock acquire/work/release on same session.
   */
  private async syncExpiredMemberStatusesWithTx(
    correlationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{
    totalUpdated: number;
    updatesByTenant: Record<string, number>;
  }> {
    const today = getTodayStart();
    const updatesByTenant: Record<string, number> = {};
    let totalUpdated = 0;

    // Find all tenants that have members
    const tenants = await tx.tenant.findMany({
      select: {
        id: true,
      },
    });

    this.logger.debug(
      `[${correlationId}] Processing ${tenants.length} tenants for status sync`,
    );

    // Process each tenant
    for (const tenant of tenants) {
      try {
        // Find members with status=ACTIVE but membershipEndDate < today
        const expiredActiveMembers = await tx.member.findMany({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            membershipEndDate: {
              lt: today,
            },
          },
          select: {
            id: true,
          },
        });

        if (expiredActiveMembers.length === 0) {
          continue;
        }

        // Update all expired active members to INACTIVE
        const result = await tx.member.updateMany({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            membershipEndDate: {
              lt: today,
            },
          },
          data: {
            status: 'INACTIVE',
          },
        });

        const count = result.count;
        updatesByTenant[tenant.id] = count;
        totalUpdated += count;

        if (count > 0) {
          this.logger.log(
            `[${correlationId}] Tenant ${tenant.id}: Updated ${count} expired active members to INACTIVE`,
          );
        }
      } catch (error) {
        this.logger.error(
          `[${correlationId}] Error syncing statuses for tenant ${tenant.id}: ${error.message}`,
          error.stack,
        );
        // Continue processing other tenants even if one fails
      }
    }

    this.logger.log(
      `[${correlationId}] Status sync completed: ${totalUpdated} members updated across ${Object.keys(updatesByTenant).length} tenants`,
    );

    return {
      totalUpdated,
      updatesByTenant,
    };
  }
}
