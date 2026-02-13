import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/**
 * ProductsService
 *
 * Business logic for in-gym product catalog management.
 * All operations are scoped by tenantId + branchId for multi-tenancy.
 *
 * Phase 2: Full implementation with validations and business rules
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all products for a tenant/branch with optional filters
   */
  async findAll(params: {
    tenantId: string;
    branchId: string;
    category?: string;
    isActive?: boolean;
  }) {
    const where: Prisma.ProductWhereInput = {
      tenantId: params.tenantId,
      branchId: params.branchId,
    };

    if (params.category !== undefined) {
      where.category = params.category;
    }

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    return this.prisma.product.findMany({
      where,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Find a single product by ID
   * Validates the product belongs to the specified tenant/branch
   */
  async findOne(id: string, tenantId: string, branchId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        tenantId,
        branchId,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Create a new product
   * Enforces name uniqueness per tenant/branch (case-insensitive)
   */
  async create(dto: CreateProductDto, tenantId: string, branchId: string) {
    // Check for duplicate name (case-insensitive)
    const existing = await this.prisma.product.findFirst({
      where: {
        tenantId,
        branchId,
        name: {
          equals: dto.name,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Product with name "${dto.name}" already exists`,
      );
    }

    // Create product
    return this.prisma.product.create({
      data: {
        tenantId,
        branchId,
        name: dto.name,
        defaultPrice: new Prisma.Decimal(dto.defaultPrice.toString()),
        category: dto.category,
        isActive: true,
      },
    });
  }

  /**
   * Update an existing product
   * Validates ownership and enforces name uniqueness if name changes
   */
  async update(
    id: string,
    dto: UpdateProductDto,
    tenantId: string,
    branchId: string,
  ) {
    // Verify product exists and belongs to tenant/branch
    await this.findOne(id, tenantId, branchId);

    // If name is changing, check for duplicates
    if (dto.name) {
      const existing = await this.prisma.product.findFirst({
        where: {
          tenantId,
          branchId,
          name: {
            equals: dto.name,
            mode: 'insensitive',
          },
          id: {
            not: id,
          },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Product with name "${dto.name}" already exists`,
        );
      }
    }

    // Build update data
    const updateData: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.defaultPrice !== undefined) {
      updateData.defaultPrice = new Prisma.Decimal(dto.defaultPrice.toString());
    }
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return this.prisma.product.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Soft delete (deactivate) a product
   * Sets isActive to false instead of hard deleting to preserve history
   */
  async remove(id: string, tenantId: string, branchId: string) {
    // Verify product exists and belongs to tenant/branch
    await this.findOne(id, tenantId, branchId);

    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
