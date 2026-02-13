import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

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
   * Helper: Parse month string and return UTC date range
   */
  private getMonthDateRange(month: string): {
    startDate: Date;
    endDate: Date;
  } {
    const [year, monthStr] = month.split('-');
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(monthStr, 10);

    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));

    return { startDate, endDate };
  }

  /**
   * Helper: Get month key in YYYY-MM format from a date
   */
  private getMonthKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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
    // Parse month string to get date range
    const { startDate, endDate } = this.getMonthDateRange(month);

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
    // Calculate date range: from N months ago to current month
    const now = new Date();
    const endYear = now.getUTCFullYear();
    const endMonth = now.getUTCMonth();

    // Generate list of months to query
    const monthKeys: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(Date.UTC(endYear, endMonth - i, 1));
      monthKeys.push(this.getMonthKey(date));
    }

    // Get start and end dates for the entire range
    const firstMonth = monthKeys[0];
    const lastMonth = monthKeys[monthKeys.length - 1];
    const { startDate } = this.getMonthDateRange(firstMonth);
    const { endDate } = this.getMonthDateRange(lastMonth);

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

    // Aggregate membership revenue by month
    payments.forEach((payment) => {
      const monthKey = this.getMonthKey(payment.paidOn);
      const current = revenueByMonth.get(monthKey);
      if (current) {
        current.membership = current.membership.add(payment.amount);
      }
    });

    // Aggregate product revenue by month
    productSales.forEach((sale) => {
      const monthKey = this.getMonthKey(sale.soldAt);
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
    const { startDate, endDate } = this.getMonthDateRange(month);

    // Fetch all payments for the month
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

    // Fetch all product sales for the month
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

    // Generate all days in the month
    const daysInMonth = new Date(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      0,
    ).getUTCDate();

    const revenueByDay = new Map<
      string,
      { membership: Prisma.Decimal; product: Prisma.Decimal }
    >();

    // Initialize all days with zero
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), day),
      );
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      revenueByDay.set(dateKey, {
        membership: new Prisma.Decimal(0),
        product: new Prisma.Decimal(0),
      });
    }

    // Aggregate membership revenue by day
    payments.forEach((payment) => {
      const dateKey = payment.paidOn.toISOString().split('T')[0];
      const current = revenueByDay.get(dateKey);
      if (current) {
        current.membership = current.membership.add(payment.amount);
      }
    });

    // Aggregate product revenue by day
    productSales.forEach((sale) => {
      const dateKey = sale.soldAt.toISOString().split('T')[0];
      const current = revenueByDay.get(dateKey);
      if (current) {
        current.product = current.product.add(sale.totalAmount);
      }
    });

    // Build result array (sorted by date)
    const result: Array<{
      date: string;
      membershipRevenue: Prisma.Decimal;
      productRevenue: Prisma.Decimal;
      totalRevenue: Prisma.Decimal;
    }> = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), day),
      );
      const dateKey = date.toISOString().split('T')[0];
      const revenue = revenueByDay.get(dateKey)!;

      result.push({
        date: dateKey,
        membershipRevenue: revenue.membership,
        productRevenue: revenue.product,
        totalRevenue: revenue.membership.add(revenue.product),
      });
    }

    return result;
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
    const { startDate, endDate } = this.getMonthDateRange(month);

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
