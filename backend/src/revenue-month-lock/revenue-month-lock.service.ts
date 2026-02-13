import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * RevenueMonthLockService
 * 
 * Business logic for revenue month locking mechanism.
 * Prevents creating/editing/deleting sales in locked months.
 * All operations are scoped by tenantId + branchId for multi-tenancy.
 * 
 * Phase 1: Placeholder methods with TODO comments
 */
@Injectable()
export class RevenueMonthLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TODO: Implement findAll
   * - Query locks filtered by tenantId, branchId
   * - Optional: filter by month or date range
   * - Order by: month DESC
   */
  async findAll(params: {
    tenantId: string;
    branchId: string;
    month?: string;
  }) {
    // TODO: Implement
    return [];
  }

  /**
   * TODO: Implement isMonthLocked
   * - Check if a specific month is locked for a tenant/branch
   * - month format: "YYYY-MM"
   * - Return boolean
   * - Used by other services (ProductSalesService) to validate operations
   */
  async isMonthLocked(
    tenantId: string,
    branchId: string,
    month: string,
  ): Promise<boolean> {
    // TODO: Implement
    // const lock = await this.prisma.revenueMonthLock.findUnique({
    //   where: { tenantId_branchId_month: { tenantId, branchId, month } }
    // });
    // return !!lock;
    return false;
  }

  /**
   * TODO: Implement isDateLocked
   * - Helper to check if a date falls in a locked month
   * - Extract YYYY-MM from date and call isMonthLocked
   * - Used by sales operations to validate soldAt date
   */
  async isDateLocked(
    tenantId: string,
    branchId: string,
    date: Date,
  ): Promise<boolean> {
    // TODO: Implement
    // const month = date.toISOString().slice(0, 7); // "YYYY-MM"
    // return this.isMonthLocked(tenantId, branchId, month);
    return false;
  }

  /**
   * TODO: Implement create
   * - Create a lock for a specific month
   * - Validate month format (YYYY-MM)
   * - Optional: validate month is not in the future
   * - Record lockedByUserId
   * - Handle unique constraint violation (month already locked)
   */
  async create(data: {
    tenantId: string;
    branchId: string;
    month: string;
    lockedByUserId?: string;
  }) {
    // TODO: Implement
    // Validation example:
    // if (!/^\d{4}-\d{2}$/.test(data.month)) {
    //   throw new BadRequestException('Invalid month format. Expected YYYY-MM');
    // }
    return null;
  }

  /**
   * TODO: Implement remove
   * - Delete a lock for a specific month
   * - Validate lock exists and belongs to tenant/branch
   * - Consider: require admin role check before unlocking
   */
  async remove(tenantId: string, branchId: string, month: string) {
    // TODO: Implement
    return null;
  }

  /**
   * TODO: Implement findOne (optional)
   * - Get details of a specific lock
   * - Return lock info: month, lockedAt, lockedByUserId
   */
  async findOne(tenantId: string, branchId: string, month: string) {
    // TODO: Implement
    return null;
  }
}
