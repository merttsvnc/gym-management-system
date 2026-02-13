import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { RevenueMonthLockService } from './revenue-month-lock.service';

/**
 * RevenueMonthLockController
 *
 * Handles HTTP endpoints for revenue month locking.
 * Locks prevent creating/editing/deleting sales in specific months.
 * Scoped by tenantId and branchId.
 *
 * Phase 1: Placeholder endpoints with TODO comments
 */
@Controller('revenue-month-locks')
export class RevenueMonthLockController {
  constructor(
    private readonly revenueMonthLockService: RevenueMonthLockService,
  ) {}

  /**
   * GET /revenue-month-locks
   * TODO: Implement listing locked months for a tenant/branch
   * - Filter by tenantId/branchId (from JWT)
   * - Optional: filter by specific month or date range
   * - Order by: month DESC
   */
  @Get()
  async findAll(@Query() query: any) {
    // TODO: Implement locked months listing
    return { message: 'TODO: List revenue month locks', query };
  }

  /**
   * POST /revenue-month-locks
   * TODO: Implement locking a month
   * - Extract tenantId/branchId from authenticated user
   * - Required field: month (format: "YYYY-MM", e.g., "2026-02")
   * - Validate month format
   * - Prevent locking future months (optional business rule)
   * - Record lockedByUserId from JWT
   * - Return 409 Conflict if month already locked
   */
  @Post()
  async create(@Body() createLockDto: any) {
    // TODO: Implement month locking
    return { message: 'TODO: Lock revenue month', data: createLockDto };
  }

  /**
   * DELETE /revenue-month-locks/:month
   * TODO: Implement unlocking a month
   * - Validate lock belongs to user's tenant/branch
   * - month param format: "YYYY-MM"
   * - Delete the lock record
   * - Consider: require admin permission for unlocking
   * - Return 404 if lock not found
   */
  @Delete(':month')
  async remove(@Param('month') month: string) {
    // TODO: Implement month unlocking
    return { message: 'TODO: Unlock revenue month', month };
  }

  /**
   * GET /revenue-month-locks/check/:month
   * TODO: Implement checking if a specific month is locked
   * - month param format: "YYYY-MM"
   * - Return { isLocked: boolean, lockedAt?: Date }
   * - Used by frontend to show lock status before operations
   */
  @Get('check/:month')
  async checkLock(@Param('month') month: string, @Query() query: any) {
    // TODO: Implement month lock check
    return { message: 'TODO: Check month lock status', month, query };
  }
}
