import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RevenueReportService } from './revenue-report.service';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
import { RevenueReportResponseDto } from './dto/revenue-report-response.dto';
import { RevenueTrendQueryDto } from './dto/revenue-trend-query.dto';
import { RevenueTrendResponseDto } from './dto/revenue-trend-response.dto';
import { DailyBreakdownQueryDto } from './dto/daily-breakdown-query.dto';
import { DailyBreakdownResponseDto } from './dto/daily-breakdown-response.dto';
import { PaymentMethodBreakdownQueryDto } from './dto/payment-method-breakdown-query.dto';
import { PaymentMethodBreakdownResponseDto } from './dto/payment-method-breakdown-response.dto';

/**
 * RevenueReportController
 *
 * Handles aggregated revenue reporting endpoints.
 * Combines membership revenue (payments) and product sales revenue.
 *
 * Phase 2.5: Revenue aggregation endpoint
 * Phase 3: Advanced analytics endpoints (trend, daily, payment methods)
 */
@Controller('reports')
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

  /**
   * GET /api/v1/reports/revenue/trend?branchId=...&months=6
   *
   * Returns monthly revenue trend for the last N months.
   * Combines membership and product revenue per month.
   *
   * Phase 3: Monthly revenue trend endpoint
   *
   * @param tenantId - Extracted from JWT by TenantGuard
   * @param query - Contains branchId and months (default 6, max 24)
   * @returns Array of monthly revenue data ordered ASC
   */
  @Get('revenue/trend')
  async getRevenueTrend(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: RevenueTrendQueryDto,
  ): Promise<RevenueTrendResponseDto> {
    const { branchId, months = 6 } = query;

    const trend = await this.revenueReportService.getRevenueTrend(
      tenantId,
      branchId,
      months,
    );

    return {
      currency: 'TRY',
      months: trend.map((item) => ({
        month: item.month,
        membershipRevenue: item.membershipRevenue.toFixed(2),
        productRevenue: item.productRevenue.toFixed(2),
        totalRevenue: item.totalRevenue.toFixed(2),
        locked: item.locked,
      })),
    };
  }

  /**
   * GET /api/v1/reports/revenue/daily?branchId=...&month=YYYY-MM
   *
   * Returns daily revenue breakdown for a given month.
   * Includes all days in the month, even with zero revenue.
   *
   * Phase 3: Daily revenue breakdown endpoint
   *
   * @param tenantId - Extracted from JWT by TenantGuard
   * @param query - Contains branchId and month (YYYY-MM)
   * @returns Array of daily revenue data
   */
  @Get('revenue/daily')
  async getDailyBreakdown(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: DailyBreakdownQueryDto,
  ): Promise<DailyBreakdownResponseDto> {
    const { branchId, month } = query;

    const daily = await this.revenueReportService.getDailyBreakdown(
      tenantId,
      branchId,
      month,
    );

    return {
      month,
      currency: 'TRY',
      days: daily.map((item) => ({
        date: item.date,
        membershipRevenue: item.membershipRevenue.toFixed(2),
        productRevenue: item.productRevenue.toFixed(2),
        totalRevenue: item.totalRevenue.toFixed(2),
      })),
    };
  }

  /**
   * GET /api/v1/reports/revenue/payment-methods?branchId=...&month=YYYY-MM
   *
   * Returns payment method breakdown for a given month.
   * Groups membership and product revenue by payment method.
   *
   * Phase 3: Payment method breakdown endpoint
   *
   * @param tenantId - Extracted from JWT by TenantGuard
   * @param query - Contains branchId and month (YYYY-MM)
   * @returns Revenue grouped by payment method
   */
  @Get('revenue/payment-methods')
  async getPaymentMethodBreakdown(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PaymentMethodBreakdownQueryDto,
  ): Promise<PaymentMethodBreakdownResponseDto> {
    const { branchId, month } = query;

    const breakdown = await this.revenueReportService.getPaymentMethodBreakdown(
      tenantId,
      branchId,
      month,
    );

    return {
      month,
      currency: 'TRY',
      membershipByMethod: breakdown.membershipByMethod.map((item) => ({
        paymentMethod: item.paymentMethod,
        amount: item.amount.toFixed(2),
      })),
      productSalesByMethod: breakdown.productSalesByMethod.map((item) => ({
        paymentMethod: item.paymentMethod,
        amount: item.amount.toFixed(2),
      })),
    };
  }
}
