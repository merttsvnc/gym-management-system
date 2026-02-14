import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  getMonthRangeUtc,
  normalizeDayKey,
  getAllDaysInMonth,
  normalizeMonthKey,
} from '../utils/timezone.util';

/**
 * RevenueReportService
 *
 * Business logic for aggregated revenue reporting.
 * Combines membership payment revenue (Payment model) with product sales revenue (ProductSale model).
 *
 * Phase 2.5: Revenue aggregation endpoint
 * Phase 3: Advanced analytics endpoints (trend, daily, payment methods)
 */
@Injectable()
export class RevenueReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve tenant timezone (IANA string)
   * Fetches from tenant settings or returns default
   */
  private async getTenantTimezone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });

    return tenant?.timezone || 'Europe/Istanbul';
  }

  /**
   * Helper: Parse month string and return UTC date range for the tenant's timezone
   * @deprecated Use getMonthRangeUtc() with tenant timezone instead
   */
  private async getMonthDateRangeWithTimezone(
    tenantId: string,
    month: string,
  ): Promise<{
    startDate: Date;
    endDate: Date;
    timezone: string;
  }> {
    const timezone = await this.getTenantTimezone(tenantId);
    const { startUtc, endUtc } = getMonthRangeUtc(month, timezone);

    return { startDate: startUtc, endDate: endUtc, timezone };
  }

  /**
   * Helper: Get month key in YYYY-MM format from a date in tenant timezone
   * @deprecated Use normalizeMonthKey() with tenant timezone instead
   */
  private getMonthKeyInTimezone(date: Date, timezone: string): string {
    return normalizeMonthKey(date, timezone);
  }

  /**
   * Get monthly revenue breakdown for a tenant/branch
   *
   * Calculates:
   * - membershipRevenue: Sum of Payment.amount for the month
   * - productRevenue: Sum of ProductSale.totalAmount for the month
   * - totalRevenue: Sum of both
   * - locked: Whether RevenueMonthLock exists for this month
   *
   * @param tenantId - Tenant ID from JWT
   * @param branchId - Branch ID from query parameter
   * @param month - Month key in YYYY-MM format
   * @returns Revenue breakdown with membership + product revenue
   */
  async getMonthlyRevenue(
    tenantId: string,
    branchId: string,
    month: string,
  ): Promise<{
    membershipRevenue: Prisma.Decimal;
    productRevenue: Prisma.Decimal;
    totalRevenue: Prisma.Decimal;
    locked: boolean;
  }> {
    // Parse month string to get date range in tenant timezone
    const { startDate, endDate } = await this.getMonthDateRangeWithTimezone(
      tenantId,
      month,
    );

    // Query membership revenue from Payment table
    // Source: Existing Payment model stores membership fee payments
    // Business rule: Sum Payment.amount where paidOn is in the month range
    // Note: Payment records are created when members pay membership fees
    // Uses the same Payment model that PaymentsService.getRevenueReport() uses
    const membershipRevenueResult = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        branchId,
        paidOn: {
          gte: startDate,
          lt: endDate,
        },
        // Exclude corrected payments to avoid double-counting
        // (isCorrected=true means this payment has been superseded by a correction)
        isCorrected: false,
      },
      _sum: {
        amount: true,
      },
    });

    // Query product sales revenue from ProductSale table
    // Source: ProductSale model stores in-gym product sales (Phase 1 & 2)
    // Business rule: Sum ProductSale.totalAmount where soldAt is in the month range
    const productRevenueResult = await this.prisma.productSale.aggregate({
      where: {
        tenantId,
        branchId,
        soldAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: {
        totalAmount: true,
      },
    });

    // Check if month is locked
    const lock = await this.prisma.revenueMonthLock.findUnique({
      where: {
        tenantId_branchId_month: {
          tenantId,
          branchId,
          month,
        },
      },
    });

    // Convert aggregate results to Decimal (handle null case)
    const membershipRevenue =
      membershipRevenueResult._sum.amount || new Prisma.Decimal(0);
    const productRevenue =
      productRevenueResult._sum.totalAmount || new Prisma.Decimal(0);
    const totalRevenue = membershipRevenue.add(productRevenue);

    return {
      membershipRevenue,
      productRevenue,
      totalRevenue,
      locked: !!lock,
    };
  }

  /**
   * Phase 3: Get revenue trend for last N months
   *
   * Returns an array of monthly revenue data ordered ASC by month.
   * Uses optimized groupBy queries to fetch all months at once.
   *
   * @param tenantId - Tenant ID from JWT
   * @param branchId - Branch ID from query parameter
   * @param months - Number of months to return (default 6, max 24)
   * @returns Array of monthly revenue data
   */
  async getRevenueTrend(
    tenantId: string,
    branchId: string,
    months: number = 6,
  ): Promise<
    Array<{
      month: string;
      membershipRevenue: Prisma.Decimal;
      productRevenue: Prisma.Decimal;
      totalRevenue: Prisma.Decimal;
      locked: boolean;
    }>
  > {
    // Get tenant timezone
    const timezone = await this.getTenantTimezone(tenantId);

    // Calculate date range: from N months ago to current month in tenant timezone
    const now = new Date();
    const currentMonth = normalizeMonthKey(now, timezone);

    // Generate list of months to query
    const monthKeys: string[] = [];
    const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);

    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date(currentYear, currentMonthNum - 1 - i, 1);
      const monthKey = normalizeMonthKey(targetDate, timezone);
      monthKeys.push(monthKey);
    }

    // Get start and end dates for the entire range in tenant timezone
    const firstMonth = monthKeys[0];
    const lastMonth = monthKeys[monthKeys.length - 1];
    const { startUtc: startDate } = getMonthRangeUtc(firstMonth, timezone);
    const { endUtc: endDate } = getMonthRangeUtc(lastMonth, timezone);

    // Fetch all payments and product sales in the date range
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        branchId,
        paidOn: { gte: startDate, lt: endDate },
        isCorrected: false,
      },
      select: {
        amount: true,
        paidOn: true,
      },
    });

    const productSales = await this.prisma.productSale.findMany({
      where: {
        tenantId,
        branchId,
        soldAt: { gte: startDate, lt: endDate },
      },
      select: {
        totalAmount: true,
        soldAt: true,
      },
    });

    // Fetch all locks for these months
    const locks = await this.prisma.revenueMonthLock.findMany({
      where: {
        tenantId,
        branchId,
        month: { in: monthKeys },
      },
      select: {
        month: true,
      },
    });

    const lockSet = new Set(locks.map((l) => l.month));

    // Group revenue by month
    const revenueByMonth = new Map<
      string,
      { membership: Prisma.Decimal; product: Prisma.Decimal }
    >();

    // Initialize all months with zero
    monthKeys.forEach((monthKey) => {
      revenueByMonth.set(monthKey, {
        membership: new Prisma.Decimal(0),
        product: new Prisma.Decimal(0),
      });
    });

    // Aggregate membership revenue by month in tenant timezone
    payments.forEach((payment) => {
      const monthKey = this.getMonthKeyInTimezone(payment.paidOn, timezone);
      const current = revenueByMonth.get(monthKey);
      if (current) {
        current.membership = current.membership.add(payment.amount);
      }
    });

    // Aggregate product revenue by month in tenant timezone
    productSales.forEach((sale) => {
      const monthKey = this.getMonthKeyInTimezone(sale.soldAt, timezone);
      const current = revenueByMonth.get(monthKey);
      if (current) {
        current.product = current.product.add(sale.totalAmount);
      }
    });

    // Build result array
    return monthKeys.map((monthKey) => {
      const revenue = revenueByMonth.get(monthKey)!;
      return {
        month: monthKey,
        membershipRevenue: revenue.membership,
        productRevenue: revenue.product,
        totalRevenue: revenue.membership.add(revenue.product),
        locked: lockSet.has(monthKey),
      };
    });
  }

  /**
   * Phase 3: Get daily revenue breakdown for a given month
   *
   * Returns revenue for each day in the month, including days with zero revenue.
   * Groups by tenant timezone, not UTC, to match mobile app display.
   *
   * Uses PostgreSQL timezone conversion for accurate day grouping:
   * - soldAt/paidOn are stored in UTC (timestamptz)
   * - Grouped by (soldAt AT TIME ZONE $timezone)::date
   * - Example: 2026-02-13T21:35:00Z in Europe/Istanbul = 2026-02-14 00:35:00
   *   -> Grouped under 2026-02-14, not 2026-02-13
   *
   * @param tenantId - Tenant ID from JWT
   * @param branchId - Branch ID from query parameter
   * @param month - Month key in YYYY-MM format
   * @returns Array of daily revenue data
   */
  async getDailyBreakdown(
    tenantId: string,
    branchId: string,
    month: string,
  ): Promise<
    Array<{
      date: string;
      membershipRevenue: Prisma.Decimal;
      productRevenue: Prisma.Decimal;
      totalRevenue: Prisma.Decimal;
    }>
  > {
    // Get tenant timezone and month date range
    const timezone = await this.getTenantTimezone(tenantId);
    const { startUtc, endUtc } = getMonthRangeUtc(month, timezone);

    // Use raw SQL for timezone-aware grouping
    // PostgreSQL: (timestamptz AT TIME ZONE 'timezone')::date gives local date

    // Query product sales daily sums
    const productDailySums = await this.prisma.$queryRaw<
      Array<{ day: string; amount: string }>
    >`
      SELECT
        to_char((sold_at AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(total_amount), 0)::text AS amount
      FROM "ProductSale"
      WHERE tenant_id = ${tenantId}
        AND branch_id = ${branchId}
        AND sold_at >= ${startUtc}
        AND sold_at < ${endUtc}
      GROUP BY (sold_at AT TIME ZONE ${timezone})::date
      ORDER BY day ASC
    `;

    // Query membership payments daily sums
    const membershipDailySums = await this.prisma.$queryRaw<
      Array<{ day: string; amount: string }>
    >`
      SELECT
        to_char((paid_on AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(amount), 0)::text AS amount
      FROM "Payment"
      WHERE tenant_id = ${tenantId}
        AND branch_id = ${branchId}
        AND paid_on >= ${startUtc}
        AND paid_on < ${endUtc}
        AND is_corrected = false
      GROUP BY (paid_on AT TIME ZONE ${timezone})::date
      ORDER BY day ASC
    `;

    // Build map of daily revenue
    const revenueByDay = new Map<
      string,
      { membership: Prisma.Decimal; product: Prisma.Decimal }
    >();

    // Get all days in the month (in tenant timezone)
    const allDays = getAllDaysInMonth(month, timezone);

    // Initialize all days with zero
    allDays.forEach((day) => {
      revenueByDay.set(day, {
        membership: new Prisma.Decimal(0),
        product: new Prisma.Decimal(0),
      });
    });

    // Fill in product sales data
    productDailySums.forEach((row) => {
      const current = revenueByDay.get(row.day);
      if (current) {
        current.product = new Prisma.Decimal(row.amount);
      }
    });

    // Fill in membership payment data
    membershipDailySums.forEach((row) => {
      const current = revenueByDay.get(row.day);
      if (current) {
        current.membership = new Prisma.Decimal(row.amount);
      }
    });

    // Build result array (sorted by date)
    return allDays.map((day) => {
      const revenue = revenueByDay.get(day)!;
      return {
        date: day,
        membershipRevenue: revenue.membership,
        productRevenue: revenue.product,
        totalRevenue: revenue.membership.add(revenue.product),
      };
    });
  }

  /**
   * Phase 3: Get payment method breakdown for a given month
   *
   * Returns revenue grouped by payment method for both membership and product sales.
   *
   * @param tenantId - Tenant ID from JWT
   * @param branchId - Branch ID from query parameter
   * @param month - Month key in YYYY-MM format
   * @returns Payment method breakdown
   */
  async getPaymentMethodBreakdown(
    tenantId: string,
    branchId: string,
    month: string,
  ): Promise<{
    membershipByMethod: Array<{
      paymentMethod: string;
      amount: Prisma.Decimal;
    }>;
    productSalesByMethod: Array<{
      paymentMethod: string;
      amount: Prisma.Decimal;
    }>;
  }> {
    // Get month date range in tenant timezone
    const { startDate, endDate } = await this.getMonthDateRangeWithTimezone(
      tenantId,
      month,
    );

    // Group membership payments by payment method
    const membershipByMethod = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        tenantId,
        branchId,
        paidOn: { gte: startDate, lt: endDate },
        isCorrected: false,
      },
      _sum: {
        amount: true,
      },
    });

    // Group product sales by payment method
    const productSalesByMethod = await this.prisma.productSale.groupBy({
      by: ['paymentMethod'],
      where: {
        tenantId,
        branchId,
        soldAt: { gte: startDate, lt: endDate },
      },
      _sum: {
        totalAmount: true,
      },
    });

    return {
      membershipByMethod: membershipByMethod.map((item) => ({
        paymentMethod: item.paymentMethod,
        amount: item._sum.amount || new Prisma.Decimal(0),
      })),
      productSalesByMethod: productSalesByMethod.map((item) => ({
        paymentMethod: item.paymentMethod,
        amount: item._sum.totalAmount || new Prisma.Decimal(0),
      })),
    };
  }
}
