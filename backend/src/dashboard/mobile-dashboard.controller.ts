import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

/**
 * Mobile-specific dashboard controller
 * Provides endpoints optimized for mobile app home page cards
 */
@Controller('api/mobile/dashboard')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MobileDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/mobile/dashboard/summary
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
}
