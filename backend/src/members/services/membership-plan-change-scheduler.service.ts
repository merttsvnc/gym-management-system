import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { PgAdvisoryLockService } from '../../common/services/pg-advisory-lock.service';

@Injectable()
export class MembershipPlanChangeSchedulerService {
  private readonly logger = new Logger(
    MembershipPlanChangeSchedulerService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: PgAdvisoryLockService,
  ) {}

  /**
   * Apply scheduled membership plan changes
   * Runs daily at 02:00 AM
   * Finds members with pending changes where pendingMembershipStartDate <= today
   * Applies the changes in a transaction and creates history records
   * Uses per-member advisory locks to prevent duplicate processing across instances
   */
  @Cron('0 2 * * *') // Every day at 02:00 AM
  async applyScheduledMembershipPlanChanges() {
    const correlationId =
      this.lockService.generateCorrelationId('plan-change-scheduler');
    this.logger.log(
      `[${correlationId}] Starting scheduled membership plan change job`,
    );

    // Use UTC normalization to avoid timezone issues when comparing dates
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find members with pending changes ready to apply
    const membersWithPendingChanges = await this.prisma.member.findMany({
      where: {
        pendingMembershipPlanId: {
          not: null,
        },
        pendingMembershipStartDate: {
          lte: today,
        },
      },
      include: {
        membershipPlan: true,
        pendingMembershipPlan: true,
      },
    });

    const totalFound = membersWithPendingChanges.length;
    this.logger.log(
      `[${correlationId}] Found ${totalFound} members with pending changes ready to apply`,
    );

    let appliedCount = 0;
    let errorCount = 0;
    let skippedLockCount = 0;

    for (const member of membersWithPendingChanges) {
      const lockName = `cron:plan-change:${member.id}`;
      const acquired = await this.lockService.tryAcquire(lockName, correlationId);

      if (!acquired) {
        skippedLockCount++;
        this.logger.debug(
          `[${correlationId}] Skipped member ${member.id} (lock held by another instance)`,
        );
        continue;
      }

      try {
        await this.applyPendingChange(member.id, member.tenantId);
        appliedCount++;
      } catch (error) {
        this.logger.error(
          `[${correlationId}] Failed to apply pending change for member ${member.id}: ${error.message}`,
          error.stack,
        );
        errorCount++;
      } finally {
        await this.lockService.release(lockName, correlationId);
      }
    }

    this.logger.log(
      `[${correlationId}] Scheduled plan change job completed: totalFound=${totalFound}, applied=${appliedCount}, skipped(lock)=${skippedLockCount}, errors=${errorCount}`,
    );
  }

  /**
   * Apply a pending plan change for a specific member
   * Called by the cron job and can be called directly for testing
   */
  async applyPendingChange(memberId: string, tenantId: string) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: {
        membershipPlan: true,
        pendingMembershipPlan: true,
      },
    });

    if (!member) {
      throw new Error(`Member ${memberId} not found`);
    }

    if (!member.pendingMembershipPlanId) {
      // No pending change, skip (idempotent)
      return;
    }

    if (member.tenantId !== tenantId) {
      throw new Error(
        `Member ${memberId} does not belong to tenant ${tenantId}`,
      );
    }

    // Apply the change in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Update active membership fields
      await tx.member.update({
        where: { id: memberId },
        data: {
          membershipPlanId: member.pendingMembershipPlanId!,
          membershipPriceAtPurchase: member.pendingMembershipPriceAtPurchase,
          membershipStartDate: member.pendingMembershipStartDate!,
          membershipEndDate: member.pendingMembershipEndDate!,
          // Clear pending fields
          pendingMembershipPlanId: null,
          pendingMembershipStartDate: null,
          pendingMembershipEndDate: null,
          pendingMembershipPriceAtPurchase: null,
          pendingMembershipScheduledAt: null,
          pendingMembershipScheduledByUserId: null,
        },
      });

      // Create history record with changeType="APPLIED"
      // effectiveDateDay: defense-in-depth for unique constraint (prevents duplicate APPLIED per member per day)
      const newStartDate = member.pendingMembershipStartDate!;
      const effectiveDateDay = new Date(newStartDate);
      effectiveDateDay.setUTCHours(0, 0, 0, 0);

      await tx.memberPlanChangeHistory.create({
        data: {
          tenantId: member.tenantId,
          memberId: member.id,
          oldPlanId: member.membershipPlanId,
          newPlanId: member.pendingMembershipPlanId!,
          oldStartDate: member.membershipStartDate,
          oldEndDate: member.membershipEndDate,
          newStartDate,
          newEndDate: member.pendingMembershipEndDate!,
          oldPriceAtPurchase: member.membershipPriceAtPurchase
            ? member.membershipPriceAtPurchase.toNumber()
            : null,
          newPriceAtPurchase: member.pendingMembershipPriceAtPurchase
            ? member.pendingMembershipPriceAtPurchase.toNumber()
            : null,
          changeType: 'APPLIED',
          appliedAt: new Date(),
          changedByUserId: member.pendingMembershipScheduledByUserId,
          effectiveDateDay,
        },
      });
    });
  }
}
