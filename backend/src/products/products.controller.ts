import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

/**
 * ProductsController
 *
 * Handles HTTP endpoints for in-gym product catalog management.
 * Products are scoped by tenantId and branchId.
 *
 * Phase 2: Full implementation with authentication and validation
 */
@Controller('products')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /products
   * Lists products for the tenant/branch with optional filters
   */
  @Get()
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ProductQueryDto,
  ) {
    // branchId is required
    if (!query.branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    return this.productsService.findAll({
      tenantId,
      branchId: query.branchId,
      category: query.category,
      isActive: query.isActive,
    });
  }

  /**
   * GET /products/:id
   * Gets a single product by ID
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

    return this.productsService.findOne(id, tenantId, branchId);
  }

  /**
   * POST /products
   * Creates a new product
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
    @Body() dto: CreateProductDto,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    return this.productsService.create(dto, tenantId, branchId);
  }

  /**
   * PATCH /products/:id
   * Updates an existing product
   */
  @Patch(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    return this.productsService.update(id, dto, tenantId, branchId);
  }

  /**
   * DELETE /products/:id
   * Soft deletes (deactivates) a product
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

    await this.productsService.remove(id, tenantId, branchId);
    return { message: 'Product deactivated successfully' };
  }
}
