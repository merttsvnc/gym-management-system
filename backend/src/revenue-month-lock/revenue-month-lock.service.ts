import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidMonthKey } from '../common/utils/date-helpers';

/**
 * RevenueMonthLockService
 *
 * Business logic for revenue month locking mechanism.
 * Prevents creating/editing/deleting sales in locked months.
 * All operations are scoped by tenantId + branchId for multi-tenancy.
 *
 * Phase 2: Full implementation
 */
@Injectable()
export class RevenueMonthLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all locks for a tenant/branch
   */
  async findAll(params: { tenantId: string; branchId: string }) {
    return this.prisma.revenueMonthLock.findMany({
      where: {
        tenantId: params.tenantId,
        branchId: params.branchId,
      },
      orderBy: { month: 'desc' },
    });
  }

  /**
   * Check if a specific month is locked
   */
  async checkMonth(
    tenantId: string,
    branchId: string,
    month: string,
  ): Promise<{ locked: boolean }> {
    const lock = await this.prisma.revenueMonthLock.findUnique({
      where: {
        tenantId_branchId_month: {
          tenantId,
          branchId,
          month,
        },
      },
    });

    return { locked: !!lock };
  }

  /**
   * Create (lock) a month
   * Uses upsert to handle duplicate attempts gracefully
   */
  async create(
    month: string,
    tenantId: string,
    branchId: string,
    userId?: string,
  ) {
    // Validate month format
    if (!isValidMonthKey(month)) {
      throw new ConflictException(
        'Invalid month format. Expected YYYY-MM (e.g., 2026-02)',
      );
    }

    // Upsert: create if not exists, return existing if already locked
    return this.prisma.revenueMonthLock.upsert({
      where: {
        tenantId_branchId_month: {
          tenantId,
          branchId,
          month,
        },
      },
      update: {}, // No updates if it already exists
      create: {
        tenantId,
        branchId,
        month,
        lockedByUserId: userId,
      },
    });
  }

  /**
   * Delete (unlock) a month
   */
  async remove(tenantId: string, branchId: string, month: string) {
    // Check if lock exists
    const lock = await this.prisma.revenueMonthLock.findUnique({
      where: {
        tenantId_branchId_month: {
          tenantId,
          branchId,
          month,
        },
      },
    });

    if (!lock) {
      throw new NotFoundException(`Month lock for ${month} not found`);
    }

    // Delete lock
    await this.prisma.revenueMonthLock.delete({
      where: {
        tenantId_branchId_month: {
          tenantId,
          branchId,
          month,
        },
      },
    });

    return { success: true };
  }
}
