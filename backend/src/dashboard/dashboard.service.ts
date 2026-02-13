import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';
import { MembershipDistributionItemDto } from './dto/membership-distribution.dto';
import { MonthlyMembersItemDto } from './dto/monthly-members.dto';
import { Prisma } from '@prisma/client';
import {
  getTodayStart,
  getActiveMembershipWhere,
  getExpiringSoonMembershipWhere,
} from '../common/utils/membership-status.util';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build reusable where clause for member queries
   * Ensures tenant isolation and optional branch filtering
   * Note: branchId validation happens implicitly via tenantId filter
   * (members can only belong to branches of the same tenant)
   */
  private buildMemberWhere(
    tenantId: string,
    branchId?: string,
  ): Prisma.MemberWhereInput {
    const where: Prisma.MemberWhereInput = {
      tenantId,
    };

    if (branchId) {
      // Filter by branchId (implicitly validated via tenantId)
      where.branchId = branchId;
    }

    return where;
  }

  /**
   * Get dashboard summary statistics
   * Returns total, active, passive members, and expiring soon count
   *
   * BUSINESS RULES (aligned with mobile filtering semantics):
   * - totalMembers: all members except ARCHIVED (within tenant scope; if branchId provided, limit to that branch)
   * - activeMembers: status = ACTIVE AND membershipEndDate >= today (CRITICAL: both conditions required)
   * - passiveMembers: status IN (INACTIVE, PAUSED) (operationally passive, regardless of end date)
   * - expiringSoonMembers: status = ACTIVE AND membershipEndDate in [today, today + expiringDays]
   *   membershipEndDate is NOT NULL per schema, so no null check needed
   *
   * @param tenantId - Tenant ID for isolation
   * @param branchId - Optional branch filter
   * @param expiringDays - Number of days to look ahead for expiring members (default 7, min 1, max 60)
   */
  async getSummary(
    tenantId: string,
    branchId?: string,
    expiringDays: number = 7,
  ): Promise<DashboardSummaryDto> {
    // Validate expiringDays
    if (expiringDays < 1 || expiringDays > 60) {
      throw new BadRequestException('expiringDays must be between 1 and 60');
    }

    // Log dashboard summary request (debug level, no PII)
    this.logger.debug(
      `Dashboard summary requested: tenantId=${tenantId}, branchId=${branchId || 'none'}, expiringDays=${expiringDays}`,
    );

    const where = this.buildMemberWhere(tenantId, branchId);
    const today = getTodayStart();

    // Total members: all except ARCHIVED
    const totalWhere: Prisma.MemberWhereInput = {
      ...where,
      status: {
        not: 'ARCHIVED',
      },
    };

    // Active members: status = ACTIVE AND membershipEndDate >= today
    const activeWhere: Prisma.MemberWhereInput = {
      ...where,
      status: 'ACTIVE',
      membershipEndDate: {
        gte: today,
      },
    };

    // Passive members: status IN (INACTIVE, PAUSED)
    const passiveWhere: Prisma.MemberWhereInput = {
      ...where,
      status: {
        in: ['INACTIVE', 'PAUSED'],
      },
    };

    // Expiring soon: status = ACTIVE AND membershipEndDate in [today, today + expiringDays]
    const expiringSoonWhere: Prisma.MemberWhereInput = {
      ...where,
      status: 'ACTIVE',
      membershipEndDate: {
        ...getExpiringSoonMembershipWhere(today, expiringDays)
          .membershipEndDate,
      },
    };

    // Execute all counts in parallel
    const [totalMembers, activeMembers, passiveMembers, expiringSoonMembers] =
      await Promise.all([
        this.prisma.member.count({ where: totalWhere }),
        this.prisma.member.count({ where: activeWhere }),
        this.prisma.member.count({ where: passiveWhere }),
        this.prisma.member.count({ where: expiringSoonWhere }),
      ]);

    return {
      counts: {
        totalMembers,
        activeMembers,
        passiveMembers,
        expiringSoonMembers,
      },
      meta: {
        expiringDays,
        ...(branchId ? { branchId } : {}),
      },
    };
  }

  /**
   * Get membership distribution (active member count per plan)
   * Uses Prisma aggregation to avoid N+1 queries
   *
   * BUSINESS RULE: Uses derived membership status based on membershipEndDate only.
   * Active = membershipEndDate >= today (start of day)
   */
  async getMembershipDistribution(
    tenantId: string,
    branchId?: string,
  ): Promise<MembershipDistributionItemDto[]> {
    const where = this.buildMemberWhere(tenantId, branchId);
    const today = getTodayStart();

    // Active member definition: membershipEndDate >= today
    // No longer checking status field - using derived status only
    const activeMemberWhere: Prisma.MemberWhereInput = {
      ...where,
      ...getActiveMembershipWhere(today),
    };

    // Use groupBy to get counts per planId in a single query
    const distribution = await this.prisma.member.groupBy({
      by: ['membershipPlanId'],
      where: activeMemberWhere,
      _count: {
        id: true,
      },
    });

    // Extract plan IDs
    const planIds = distribution.map((item) => item.membershipPlanId);

    if (planIds.length === 0) {
      return [];
    }

    // Fetch plan names in a single query (no per-plan queries)
    const plans = await this.prisma.membershipPlan.findMany({
      where: {
        id: { in: planIds },
        tenantId, // Ensure tenant isolation
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Create a map for quick lookup
    const planMap = new Map(plans.map((plan) => [plan.id, plan.name]));

    // Combine distribution data with plan names
    return distribution
      .map((item) => {
        const planName = planMap.get(item.membershipPlanId);
        if (!planName) {
          // Plan not found (shouldn't happen, but handle gracefully)
          return null;
        }
        return {
          planId: item.membershipPlanId,
          planName,
          activeMemberCount: item._count.id,
        };
      })
      .filter((item): item is MembershipDistributionItemDto => item !== null)
      .sort((a, b) => b.activeMemberCount - a.activeMemberCount); // Sort by count descending
  }

  /**
   * Get monthly new members count
   * Returns last N months (default 6, max 12) with zero months included
   *
   * BUGFIX 2026-01-28: Use UTC consistently to avoid timezone-related aggregation bugs
   * - All date calculations use UTC methods (getUTCFullYear, getUTCMonth, etc.)
   * - Month keys are generated using UTC to match PostgreSQL's stored timestamps
   * - Prevents key mismatch between fill logic and count logic due to timezone conversions
   */
  async getMonthlyMembers(
    tenantId: string,
    branchId?: string,
    months: number = 6,
  ): Promise<MonthlyMembersItemDto[]> {
    // Validate months parameter
    if (months < 1 || months > 12) {
      throw new BadRequestException(
        'Months parameter must be between 1 and 12',
      );
    }

    const where = this.buildMemberWhere(tenantId, branchId);

    // Calculate date range using UTC to avoid timezone bugs
    // Start: first day of the month (months - 1) ago (to include current month)
    // End: current moment in UTC
    const now = new Date();

    // Create start date: first day of month (months - 1) ago in UTC
    // E.g., for months=6 on 2026-01-28: start = 2025-08-01 (Aug, Sep, Oct, Nov, Dec, Jan = 6 months)
    const startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (months - 1),
        1,
        0,
        0,
        0,
        0,
      ),
    );

    // End date: current moment (include all members created up to now)
    const endDate = new Date();

    // Get all members created in the date range
    const members = await this.prisma.member.findMany({
      where: {
        ...where,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Initialize result array with all months (including zeros)
    const monthCounts = new Map<string, number>();

    // Initialize all months with zero counts using UTC
    for (let i = 0; i < months; i++) {
      // Calculate month offset in UTC
      const targetDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      const monthKey = `${targetDate.getUTCFullYear()}-${(targetDate.getUTCMonth() + 1).toString().padStart(2, '0')}`;
      monthCounts.set(monthKey, 0);
    }

    // Count members per month using UTC to generate keys
    for (const member of members) {
      const createdAt = new Date(member.createdAt);
      // Use UTC methods to avoid timezone conversion bugs
      const monthKey = `${createdAt.getUTCFullYear()}-${(createdAt.getUTCMonth() + 1).toString().padStart(2, '0')}`;
      const currentCount = monthCounts.get(monthKey) || 0;
      monthCounts.set(monthKey, currentCount + 1);
    }

    // Convert map to array and sort by month (oldest first)
    const result: MonthlyMembersItemDto[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      const monthKey = `${targetDate.getUTCFullYear()}-${(targetDate.getUTCMonth() + 1).toString().padStart(2, '0')}`;
      result.push({
        month: monthKey,
        newMembers: monthCounts.get(monthKey) || 0,
      });
    }

    return result;
  }
}
