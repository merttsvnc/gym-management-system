import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProductSalesService } from './product-sales.service';
import { CreateProductSaleDto } from './dto/create-product-sale.dto';
import { ProductSaleQueryDto } from './dto/product-sale-query.dto';
import { toMoneyString } from '../common/utils/money.util';

/**
 * ProductSalesController
 *
 * Handles HTTP endpoints for in-gym product sales transactions.
 * Sales are scoped by tenantId and branchId.
 *
 * Phase 2: Full implementation with authentication and validation
 */
@Controller('api/v1/product-sales')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ProductSalesController {
  constructor(private readonly productSalesService: ProductSalesService) {}

  /**
   * GET /product-sales
   * Lists sales for the tenant/branch with optional filters
   */
  @Get()
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ProductSaleQueryDto,
  ) {
    if (!query.branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    const params: any = {
      tenantId,
      branchId: query.branchId,
      limit: query.limit,
      offset: query.offset,
    };

    if (query.from) {
      params.from = new Date(query.from);
    }

    if (query.to) {
      params.to = new Date(query.to);
    }

    const sales = await this.productSalesService.findAll(params);

    // Serialize Decimal fields to strings with 2 decimal places
    return sales.map((sale) => ({
      ...sale,
      totalAmount: toMoneyString(sale.totalAmount),
      items: sale.items.map((item) => ({
        ...item,
        unitPrice: toMoneyString(item.unitPrice),
        lineTotal: toMoneyString(item.lineTotal),
        product: item.product
          ? {
              ...item.product,
              defaultPrice: toMoneyString(item.product.defaultPrice),
            }
          : null,
      })),
    }));
  }

  /**
   * GET /product-sales/:id
   * Gets a single sale by ID with items
   */
  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    const sale = await this.productSalesService.findOne(id, tenantId, branchId);

    // Serialize Decimal fields to strings with 2 decimal places
    return {
      ...sale,
      totalAmount: toMoneyString(sale.totalAmount),
      items: sale.items.map((item) => ({
        ...item,
        unitPrice: toMoneyString(item.unitPrice),
        lineTotal: toMoneyString(item.lineTotal),
        product: item.product
          ? {
              ...item.product,
              defaultPrice: toMoneyString(item.product.defaultPrice),
            }
          : null,
      })),
    };
  }

  /**
   * POST /product-sales
   * Creates a new product sale with items
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Query('branchId') branchId: string,
    @Body() dto: CreateProductSaleDto,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    const sale = await this.productSalesService.create(
      dto,
      tenantId,
      branchId,
      userId,
    );

    // Serialize Decimal fields to strings with 2 decimal places
    return {
      ...sale,
      totalAmount: toMoneyString(sale.totalAmount),
      items: sale.items.map((item) => ({
        ...item,
        unitPrice: toMoneyString(item.unitPrice),
        lineTotal: toMoneyString(item.lineTotal),
        product: item.product
          ? {
              ...item.product,
              defaultPrice: toMoneyString(item.product.defaultPrice),
            }
          : null,
      })),
    };
  }

  /**
   * DELETE /product-sales/:id
   * Deletes a product sale (with month lock enforcement)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    await this.productSalesService.remove(id, tenantId, branchId);
    return { message: 'Product sale deleted successfully' };
  }
}
