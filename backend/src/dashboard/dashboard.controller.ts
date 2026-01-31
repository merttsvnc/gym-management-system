import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';
import { MembershipDistributionItemDto } from './dto/membership-distribution.dto';
import {
  MonthlyMembersQueryDto,
  MonthlyMembersItemDto,
} from './dto/monthly-members.dto';

@Controller('api/v1/dashboard')
@UseGuards(JwtAuthGuard, TenantGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard/summary
   * Get dashboard summary statistics for mobile home page cards
   * Query parameters:
   * - branchId?: string (optional branch filter)
   * - expiringDays?: number (default 7, min 1, max 60)
   * Returns: counts (totalMembers, activeMembers, passiveMembers, expiringSoonMembers) and meta
   */
  @Get('summary')
  async getSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('expiringDays') expiringDays?: string,
  ): Promise<DashboardSummaryDto> {
    const expiringDaysNum = expiringDays
      ? parseInt(expiringDays, 10)
      : undefined;
    return this.dashboardService.getSummary(
      tenantId,
      branchId,
      expiringDaysNum,
    );
  }

  /**
   * GET /api/v1/dashboard/membership-distribution
   * Get membership distribution (active member count per plan)
   * Query parameters:
   * - branchId?: string (optional branch filter)
   * Returns: Array of { planId, planName, activeMemberCount }
   */
  @Get('membership-distribution')
  async getMembershipDistribution(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
  ): Promise<MembershipDistributionItemDto[]> {
    return this.dashboardService.getMembershipDistribution(tenantId, branchId);
  }

  /**
   * GET /api/v1/dashboard/monthly-members
   * Get monthly new members count
   * Query parameters:
   * - branchId?: string (optional branch filter)
   * - months?: number (default 6, max 12)
   * Returns: Array of { month: "YYYY-MM", newMembers: number }
   */
  @Get('monthly-members')
  async getMonthlyMembers(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: MonthlyMembersQueryDto,
  ): Promise<MonthlyMembersItemDto[]> {
    return this.dashboardService.getMonthlyMembers(
      tenantId,
      query.branchId,
      query.months || 6,
    );
  }
}
