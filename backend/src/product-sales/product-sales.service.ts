import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateProductSaleDto,
  SaleItemDto,
} from './dto/create-product-sale.dto';
import { getMonthKey } from '../common/utils/date-helpers';

/**
 * ProductSalesService
 *
 * Business logic for in-gym product sales transactions.
 * All operations are scoped by tenantId + branchId for multi-tenancy.
 *
 * Phase 2: Full implementation with month lock enforcement and totals calculation
 */
@Injectable()
export class ProductSalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all sales for a tenant/branch with optional filters
   */
  async findAll(params: {
    tenantId: string;
    branchId: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.ProductSaleWhereInput = {
      tenantId: params.tenantId,
      branchId: params.branchId,
    };

    if (params.from || params.to) {
      where.soldAt = {};
      if (params.from) {
        where.soldAt.gte = params.from;
      }
      if (params.to) {
        where.soldAt.lte = params.to;
      }
    }

    return this.prisma.productSale.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: [{ soldAt: 'desc' }, { createdAt: 'desc' }],
      take: params.limit || 20,
      skip: params.offset || 0,
    });
  }

  /**
   * Find a single sale by ID with items
   */
  async findOne(id: string, tenantId: string, branchId: string) {
    const sale = await this.prisma.productSale.findFirst({
      where: {
        id,
        tenantId,
        branchId,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Product sale with ID ${id} not found`);
    }

    return sale;
  }

  /**
   * Create a new product sale with items
   * Enforces month lock, validates items, and calculates totals
   */
  async create(
    dto: CreateProductSaleDto,
    tenantId: string,
    branchId: string,
    userId?: string,
  ) {
    // Fail-fast: validate request context
    this.assertRequestContext(tenantId, branchId, userId);

    // Parse soldAt or default to now
    const soldAt = dto.soldAt ? new Date(dto.soldAt) : new Date();

    // Check month lock
    const isLocked = await this.checkMonthLock(tenantId, branchId, soldAt);
    if (isLocked) {
      const monthKey = getMonthKey(soldAt);
      throw new ForbiddenException(
        `Cannot create sale: month ${monthKey} is locked`,
      );
    }

    // Validate and process items
    const processedItems = await this.validateAndProcessItems(
      dto.items,
      tenantId,
      branchId,
    );

    // Calculate total
    const totalAmount = processedItems.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Prisma.Decimal(0),
    );

    // Create sale with items in transaction (with Prisma error handling)
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sale = await tx.productSale.create({
          data: {
            tenantId,
            branchId,
            soldAt,
            paymentMethod: dto.paymentMethod,
            note: dto.note,
            totalAmount,
            createdByUserId: userId,
            items: {
              create: processedItems.map((item) => ({
                tenantId,
                branchId,
                productId: item.productId,
                customName: item.customName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
              })),
            },
          },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        return sale;
      });
    } catch (error) {
      // Handle Prisma errors and convert to user-friendly messages
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Foreign key constraint error
        if (error.code === 'P2003') {
          throw new BadRequestException(
            'Invalid reference in request (check branchId/productId)',
          );
        }
        // Unique constraint error
        if (error.code === 'P2002') {
          throw new BadRequestException('Duplicate record detected');
        }
      }
      // Re-throw if not a handled Prisma error
      throw error;
    }
  }

  /**
   * Delete a product sale
   * Enforces month lock based on sale's soldAt date
   */
  async remove(id: string, tenantId: string, branchId: string) {
    // Find sale first
    const sale = await this.findOne(id, tenantId, branchId);

    // Check month lock
    const isLocked = await this.checkMonthLock(tenantId, branchId, sale.soldAt);
    if (isLocked) {
      const monthKey = getMonthKey(sale.soldAt);
      throw new ForbiddenException(
        `Cannot delete sale: month ${monthKey} is locked`,
      );
    }

    // Delete sale (cascade to items)
    await this.prisma.productSale.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Validate and process sale items
   * Enforces XOR rule, validates products, and calculates line totals
   */
  private async validateAndProcessItems(
    items: SaleItemDto[],
    tenantId: string,
    branchId: string,
  ) {
    const processed: Array<{
      productId?: string;
      customName?: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }> = [];

    for (const item of items) {
      // Enforce XOR: exactly one of productId or customName
      if (
        (item.productId && item.customName) ||
        (!item.productId && !item.customName)
      ) {
        throw new BadRequestException(
          'Each item must have exactly one of: productId or customName',
        );
      }

      // Validate quantity
      if (!item.quantity || item.quantity < 1) {
        throw new BadRequestException('Quantity must be at least 1');
      }

      let unitPrice: Prisma.Decimal;

      // Handle catalog item
      if (item.productId) {
        const product = await this.prisma.product.findFirst({
          where: {
            id: item.productId,
            tenantId,
            branchId,
            isActive: true,
          },
        });

        if (!product) {
          throw new BadRequestException('Invalid productId for this branch.');
        }

        // Use provided unitPrice or default to product's defaultPrice
        if (item.unitPrice !== undefined && item.unitPrice !== null) {
          unitPrice = new Prisma.Decimal(item.unitPrice.toString());
        } else {
          if (!product.defaultPrice) {
            throw new BadRequestException(
              `Product ${item.productId} has no default price. Please provide unitPrice`,
            );
          }
          unitPrice = product.defaultPrice;
        }
      } else {
        // Handle custom item
        if (!item.customName || item.customName.trim().length < 2) {
          throw new BadRequestException(
            'Custom name must be at least 2 characters',
          );
        }

        if (item.unitPrice === undefined || item.unitPrice === null) {
          throw new BadRequestException(
            'unitPrice is required for custom items',
          );
        }

        const priceValue = new Prisma.Decimal(item.unitPrice.toString());
        if (priceValue.lessThan(0)) {
          throw new BadRequestException('unitPrice must be 0 or greater');
        }

        unitPrice = priceValue;
      }

      // Calculate line total
      const lineTotal = unitPrice.mul(item.quantity);

      processed.push({
        productId: item.productId,
        customName: item.customName?.trim(),
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    return processed;
  }

  /**
   * Check if a month is locked for a tenant/branch
   */
  private async checkMonthLock(
    tenantId: string,
    branchId: string,
    date: Date,
  ): Promise<boolean> {
    const monthKey = getMonthKey(date);

    const lock = await this.prisma.revenueMonthLock.findUnique({
      where: {
        tenantId_branchId_month: {
          tenantId,
          branchId,
          month: monthKey,
        },
      },
    });

    return !!lock;
  }

  /**
   * Assert that request context is valid (fail-fast validation)
   */
  private assertRequestContext(
    tenantId: string | undefined,
    branchId: string | undefined,
    userId?: string | undefined,
  ): void {
    if (!tenantId || !userId) {
      throw new BadRequestException(
        'Unauthorized: missing user context (token required)',
      );
    }

    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
  }
}
