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
import { toMoneyString } from '../common/utils/money.util';

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
    this.validateBranchId(query.branchId);

    const products = await this.productsService.findAll({
      tenantId,
      branchId: query.branchId,
      category: query.category,
      isActive: query.isActive,
    });

    // Serialize Decimal fields to strings with 2 decimal places
    return products.map((product) => ({
      ...product,
      defaultPrice: toMoneyString(product.defaultPrice),
    }));
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
    this.validateBranchId(branchId);

    const product = await this.productsService.findOne(id, tenantId, branchId);

    // Serialize Decimal fields to strings with 2 decimal places
    return {
      ...product,
      defaultPrice: toMoneyString(product.defaultPrice),
    };
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
    this.validateBranchId(branchId);

    const product = await this.productsService.create(dto, tenantId, branchId);

    // Serialize Decimal fields to strings with 2 decimal places
    return {
      ...product,
      defaultPrice: toMoneyString(product.defaultPrice),
    };
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
    this.validateBranchId(branchId);

    const product = await this.productsService.update(
      id,
      dto,
      tenantId,
      branchId,
    );

    // Serialize Decimal fields to strings with 2 decimal places
    return {
      ...product,
      defaultPrice: toMoneyString(product.defaultPrice),
    };
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
    this.validateBranchId(branchId);

    await this.productsService.remove(id, tenantId, branchId);
    return { message: 'Product deactivated successfully' };
  }

  /**
   * Validates branchId: required, not placeholder, valid format (cuid or UUID)
   */
  private validateBranchId(branchId: string | undefined): void {
    if (!branchId || typeof branchId !== 'string' || !branchId.trim()) {
      throw new BadRequestException('branchId query parameter is required.');
    }

    const trimmed = branchId.trim();
    const placeholders = [
      'branch-id-placeholder',
      'placeholder',
      'default',
      'undefined',
      'null',
      '00000000-0000-0000-0000-000000000000',
    ];
    if (placeholders.includes(trimmed.toLowerCase())) {
      throw new BadRequestException(
        'Invalid branchId. Please select a real branch.',
      );
    }

    // Accept cuid (25 chars, starts with c) or UUID v4 format
    const cuidRegex = /^c[a-z0-9]{24}$/i;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!cuidRegex.test(trimmed) && !uuidRegex.test(trimmed)) {
      throw new BadRequestException(
        'Invalid branchId format. Must be a valid branch identifier.',
      );
    }
  }
}
