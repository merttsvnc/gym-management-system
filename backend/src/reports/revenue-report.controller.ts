import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RevenueReportService } from './revenue-report.service';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
import { RevenueReportResponseDto } from './dto/revenue-report-response.dto';

/**
 * RevenueReportController
 *
 * Handles aggregated revenue reporting endpoints.
 * Combines membership revenue (payments) and product sales revenue.
 *
 * Phase 2.5: Revenue aggregation endpoint
 */
@Controller('api/v1/reports')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN')
export class RevenueReportController {
  constructor(private readonly revenueReportService: RevenueReportService) {}

  /**
   * GET /api/v1/reports/revenue?month=YYYY-MM&branchId=...
   *
   * Returns monthly revenue breakdown combining:
   * - membershipRevenue: Total from membership payments (Payment model)
   * - productRevenue: Total from in-gym product sales (ProductSale model)
   * - totalRevenue: Sum of both
   * - locked: Whether the month is locked for financial reporting
   *
   * Scope: tenantId from JWT, branchId from query param (required)
   *
   * @param tenantId - Extracted from JWT by TenantGuard
   * @param query - Contains month (YYYY-MM) and branchId
   * @returns Revenue breakdown with 2 decimal precision
   */
  @Get('revenue')
  async getMonthlyRevenue(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: RevenueReportQueryDto,
  ): Promise<RevenueReportResponseDto> {
    const { month, branchId } = query;

    // Get revenue data from service
    const revenue = await this.revenueReportService.getMonthlyRevenue(
      tenantId,
      branchId,
      month,
    );

    // Format response with Decimal values as strings with 2 decimal places
    return {
      month,
      membershipRevenue: revenue.membershipRevenue.toFixed(2),
      productRevenue: revenue.productRevenue.toFixed(2),
      totalRevenue: revenue.totalRevenue.toFixed(2),
      currency: 'TRY',
      locked: revenue.locked,
    };
  }
}
