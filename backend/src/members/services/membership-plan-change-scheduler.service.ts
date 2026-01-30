import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class MembershipPlanChangeSchedulerService {
  private readonly logger = new Logger(
    MembershipPlanChangeSchedulerService.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apply scheduled membership plan changes
   * Runs daily at 02:00 AM
   * Finds members with pending changes where pendingMembershipStartDate <= today
   * Applies the changes in a transaction and creates history records
   */
  @Cron('0 2 * * *') // Every day at 02:00 AM
  async applyScheduledMembershipPlanChanges() {
    this.logger.log('Starting scheduled membership plan change job');

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

    this.logger.log(
      `Found ${membersWithPendingChanges.length} members with pending changes ready to apply`,
    );

    let appliedCount = 0;
    let errorCount = 0;

    for (const member of membersWithPendingChanges) {
      try {
        await this.applyPendingChange(member.id, member.tenantId);
        appliedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to apply pending change for member ${member.id}: ${error.message}`,
          error.stack,
        );
        errorCount++;
      }
    }

    this.logger.log(
      `Scheduled plan change job completed: ${appliedCount} applied, ${errorCount} errors`,
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
      await tx.memberPlanChangeHistory.create({
        data: {
          tenantId: member.tenantId,
          memberId: member.id,
          oldPlanId: member.membershipPlanId,
          newPlanId: member.pendingMembershipPlanId!,
          oldStartDate: member.membershipStartDate,
          oldEndDate: member.membershipEndDate,
          newStartDate: member.pendingMembershipStartDate!,
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
        },
      });
    });
  }
}
