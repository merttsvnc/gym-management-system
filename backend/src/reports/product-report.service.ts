import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * ProductReportService
 *
 * Business logic for product sales analytics.
 * Phase 3: Top selling products endpoint
 */
@Injectable()
export class ProductReportService {
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
   * Phase 3: Get top selling products for a given month
   *
   * Groups product sales by:
   * - productId (when not null): Join with Product table to get name
   * - customName (when productId is null): Use customName as product identifier
   *
   * Returns products sorted by revenue DESC, limited by the limit parameter.
   *
   * @param tenantId - Tenant ID from JWT
   * @param branchId - Branch ID from query parameter
   * @param month - Month key in YYYY-MM format
   * @param limit - Maximum number of products to return (default 10)
   * @returns Array of top selling products with quantity and revenue
   */
  async getTopSellingProducts(
    tenantId: string,
    branchId: string,
    month: string,
    limit: number = 10,
  ): Promise<
    Array<{
      name: string;
      productId: string | null;
      quantity: number;
      revenue: Prisma.Decimal;
    }>
  > {
    const { startDate, endDate } = this.getMonthDateRange(month);

    // Fetch all product sale line items for the month
    type LineItemWithProduct = {
      productId: string | null;
      customName: string | null;
      quantity: number;
      lineTotal: Prisma.Decimal;
      product: { name: string } | null;
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const lineItems = (await this.prisma.productSaleItem.findMany({
      where: {
        sale: {
          tenantId,
          branchId,
          soldAt: { gte: startDate, lt: endDate },
        },
      },
      select: {
        productId: true,
        customName: true,
        quantity: true,
        lineTotal: true,
        product: {
          select: {
            name: true,
          },
        },
      },
    })) as LineItemWithProduct[];

    // Group by productId or customName
    const groupedData = new Map<
      string,
      {
        name: string;
        productId: string | null;
        quantity: number;
        revenue: Prisma.Decimal;
      }
    >();

    lineItems.forEach((item) => {
      let key: string;
      let name: string;
      let productId: string | null;

      if (item.productId) {
        // Catalog product: group by productId
        key = `product:${item.productId}`;
        name = item.product?.name || 'Unknown Product';
        productId = item.productId;
      } else {
        // Custom product: group by customName
        key = `custom:${item.customName}`;
        name = item.customName || 'Unknown Custom Product';
        productId = null;
      }

      const existing = groupedData.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue = existing.revenue.add(item.lineTotal);
      } else {
        groupedData.set(key, {
          name,
          productId,
          quantity: item.quantity,
          revenue: new Prisma.Decimal(item.lineTotal),
        });
      }
    });

    // Convert to array and sort by revenue DESC
    const sortedProducts = Array.from(groupedData.values()).sort((a, b) => {
      // Sort by revenue descending
      return b.revenue.comparedTo(a.revenue);
    });

    // Return top N products
    return sortedProducts.slice(0, limit);
  }
}
