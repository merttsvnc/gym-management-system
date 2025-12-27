import { Injectable, BadRequestException } from '@nestjs/common';
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
   * Returns total, active, inactive members, and expiring soon count
   *
   * BUSINESS RULE: Uses derived membership status based on membershipEndDate only.
   * Active = membershipEndDate >= today (start of day)
   */
  async getSummary(
    tenantId: string,
    branchId?: string,
  ): Promise<DashboardSummaryDto> {
    const where = this.buildMemberWhere(tenantId, branchId);
    const today = getTodayStart();

    // Active member definition: membershipEndDate >= today
    // No longer checking status field - using derived status only
    const activeWhere: Prisma.MemberWhereInput = {
      ...where,
      ...getActiveMembershipWhere(today),
    };

    // Expiring soon: active members with membershipEndDate between today and today+7 days
    const expiringSoonWhere: Prisma.MemberWhereInput = {
      ...where,
      ...getExpiringSoonMembershipWhere(today),
    };

    // Execute all counts in parallel
    const [totalMembers, activeMembers, expiringSoon] = await Promise.all([
      this.prisma.member.count({ where }),
      this.prisma.member.count({ where: activeWhere }),
      this.prisma.member.count({ where: expiringSoonWhere }),
    ]);

    // Inactive/expired members calculation:
    // totalMembers - activeMembers (includes expired, paused, archived)
    const inactiveMembers = totalMembers - activeMembers;

    return {
      totalMembers,
      activeMembers,
      inactiveMembers,
      expiringSoon,
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

    // Calculate date range: from (today - N months) to today
    const today = getTodayStart();
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1); // First day of the month
    startDate.setHours(0, 0, 0, 0);

    // Get all members created in the date range
    const members = await this.prisma.member.findMany({
      where: {
        ...where,
        createdAt: {
          gte: startDate,
          lte: today,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Initialize result array with all months (including zeros)
    const result: MonthlyMembersItemDto[] = [];
    const monthCounts = new Map<string, number>();

    // Initialize all months with zero counts
    for (let i = 0; i < months; i++) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth() + 1;
      const monthKey = `${date.getFullYear()}-${month.toString().padStart(2, '0')}`;
      monthCounts.set(monthKey, 0);
    }

    // Count members per month
    for (const member of members) {
      const memberDate = new Date(member.createdAt);
      const month = memberDate.getMonth() + 1;
      const monthKey = `${memberDate.getFullYear()}-${month.toString().padStart(2, '0')}`;
      const currentCount = monthCounts.get(monthKey) || 0;
      monthCounts.set(monthKey, currentCount + 1);
    }

    // Convert map to array and sort by month (oldest first)
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth() + 1;
      const monthKey = `${date.getFullYear()}-${month.toString().padStart(2, '0')}`;
      result.push({
        month: monthKey,
        newMembers: monthCounts.get(monthKey) || 0,
      });
    }

    return result;
  }
}
