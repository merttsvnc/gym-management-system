import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * ProductsController
 *
 * Handles HTTP endpoints for in-gym product catalog management.
 * Products are scoped by tenantId and branchId.
 *
 * Phase 1: Placeholder endpoints with TODO comments
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /products
   * TODO: Implement listing products for a tenant/branch
   * - Support filtering by category, isActive
   * - Support pagination
   * - Require authentication and extract tenantId/branchId from JWT
   */
  @Get()
  async findAll(@Query() query: any) {
    // TODO: Implement product listing
    return { message: 'TODO: List products', query };
  }

  /**
   * GET /products/:id
   * TODO: Implement getting a single product by ID
   * - Validate product belongs to user's tenant/branch
   * - Return 404 if not found
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    // TODO: Implement get product by ID
    return { message: 'TODO: Get product', id };
  }

  /**
   * POST /products
   * TODO: Implement creating a new product
   * - Extract tenantId/branchId from authenticated user
   * - Validate required fields: name, defaultPrice
   * - Validate defaultPrice is positive
   * - Optional fields: category
   */
  @Post()
  async create(@Body() createProductDto: any) {
    // TODO: Implement product creation
    return { message: 'TODO: Create product', data: createProductDto };
  }

  /**
   * PATCH /products/:id
   * TODO: Implement updating a product
   * - Validate product belongs to user's tenant/branch
   * - Allow updating: name, defaultPrice, category, isActive
   * - Validate defaultPrice is positive if provided
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateProductDto: any) {
    // TODO: Implement product update
    return { message: 'TODO: Update product', id, data: updateProductDto };
  }

  /**
   * DELETE /products/:id
   * TODO: Implement soft-delete or hard-delete
   * - Option 1: Set isActive = false (soft delete)
   * - Option 2: Check if product has associated sales, then prevent delete or cascade
   * - Validate product belongs to user's tenant/branch
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    // TODO: Implement product deletion
    return { message: 'TODO: Delete product', id };
  }
}
