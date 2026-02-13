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
 */
@Injectable()
export class RevenueReportService {
  constructor(private readonly prisma: PrismaService) {}

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
    const [year, monthStr] = month.split('-');
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(monthStr, 10);

    // Compute month range in UTC:
    // start = first day of month at 00:00:00.000Z
    // end = first day of next month at 00:00:00.000Z
    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));

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
}
