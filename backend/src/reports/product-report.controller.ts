import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProductReportService } from './product-report.service';
import { TopProductsQueryDto } from './dto/top-products-query.dto';
import { TopProductsResponseDto } from './dto/top-products-response.dto';

/**
 * ProductReportController
 *
 * Handles product sales analytics endpoints.
 *
 * Phase 3: Top selling products endpoint
 */
@Controller('api/v1/reports/products')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN')
export class ProductReportController {
  constructor(private readonly productReportService: ProductReportService) {}

  /**
   * GET /api/v1/reports/products/top?branchId=...&month=YYYY-MM&limit=10
   *
   * Returns top selling products for a given month.
   * Groups by productId (catalog products) or customName (custom products).
   * Sorted by revenue DESC.
   *
   * Phase 3: Top selling products endpoint
   *
   * @param tenantId - Extracted from JWT by TenantGuard
   * @param query - Contains branchId, month (YYYY-MM), and limit (default 10)
   * @returns Array of top selling products with quantity and revenue
   */
  @Get('top')
  async getTopSellingProducts(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: TopProductsQueryDto,
  ): Promise<TopProductsResponseDto> {
    const { branchId, month, limit = 10 } = query;

    const products = await this.productReportService.getTopSellingProducts(
      tenantId,
      branchId,
      month,
      limit,
    );

    return {
      month,
      currency: 'TRY',
      items: products.map((item) => ({
        name: item.name,
        productId: item.productId,
        quantity: item.quantity,
        revenue: item.revenue.toFixed(2),
      })),
    };
  }
}
