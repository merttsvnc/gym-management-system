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
   * Get dashboard summary statistics
   * Query parameters:
   * - branchId?: string (optional branch filter)
   * Returns: totalMembers, activeMembers, inactiveMembers, expiringSoon
   */
  @Get('summary')
  async getSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
  ): Promise<DashboardSummaryDto> {
    return this.dashboardService.getSummary(tenantId, branchId);
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
