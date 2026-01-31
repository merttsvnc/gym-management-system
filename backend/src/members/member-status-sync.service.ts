import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { getTodayStart } from '../common/utils/membership-status.util';

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
 */
@Injectable()
export class MemberStatusSyncService {
  private readonly logger = new Logger(MemberStatusSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily cron job to sync member statuses
   * Runs at 03:00 AM every day
   */
  @Cron('0 3 * * *', {
    name: 'sync-expired-member-statuses',
    timeZone: 'UTC',
  })
  async handleCron() {
    this.logger.log('Starting daily member status sync job');
    await this.syncExpiredMemberStatuses();
  }

  /**
   * Sync expired member statuses
   * Can be called directly for testing or manual execution
   * 
   * @returns Object with counts of updated members per tenant
   */
  async syncExpiredMemberStatuses(): Promise<{
    totalUpdated: number;
    updatesByTenant: Record<string, number>;
  }> {
    const today = getTodayStart();
    const updatesByTenant: Record<string, number> = {};
    let totalUpdated = 0;

    try {
      // Find all tenants that have members
      const tenants = await this.prisma.tenant.findMany({
        select: {
          id: true,
        },
      });

      this.logger.debug(`Processing ${tenants.length} tenants for status sync`);

      // Process each tenant
      for (const tenant of tenants) {
        try {
          // Find members with status=ACTIVE but membershipEndDate < today
          const expiredActiveMembers = await this.prisma.member.findMany({
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
          const result = await this.prisma.member.updateMany({
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
              `Tenant ${tenant.id}: Updated ${count} expired active members to INACTIVE`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error syncing statuses for tenant ${tenant.id}: ${error.message}`,
            error.stack,
          );
          // Continue processing other tenants even if one fails
        }
      }

      this.logger.log(
        `Status sync completed: ${totalUpdated} members updated across ${Object.keys(updatesByTenant).length} tenants`,
      );

      return {
        totalUpdated,
        updatesByTenant,
      };
    } catch (error) {
      this.logger.error(
        `Fatal error in status sync job: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
