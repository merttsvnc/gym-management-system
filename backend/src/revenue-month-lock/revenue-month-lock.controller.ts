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
import { RevenueMonthLockService } from './revenue-month-lock.service';
import { CreateMonthLockDto } from './dto/create-month-lock.dto';
import { MonthLockQueryDto } from './dto/month-lock-query.dto';

/**
 * RevenueMonthLockController
 *
 * Handles HTTP endpoints for revenue month locking.
 * Locks prevent creating/editing/deleting sales in specific months.
 * Scoped by tenantId and branchId.
 *
 * Phase 2: Full implementation with authentication and validation
 */
@Controller('api/v1/revenue-month-locks')
@UseGuards(JwtAuthGuard, TenantGuard)
export class RevenueMonthLockController {
  constructor(
    private readonly revenueMonthLockService: RevenueMonthLockService,
  ) {}

  /**
   * GET /revenue-month-locks
   * Lists locked months for a tenant/branch
   */
  @Get()
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: MonthLockQueryDto,
  ) {
    if (!query.branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    return this.revenueMonthLockService.findAll({
      tenantId,
      branchId: query.branchId,
    });
  }

  /**
   * POST /revenue-month-locks
   * Locks a specific month
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Query('branchId') branchId: string,
    @Body() dto: CreateMonthLockDto,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    return this.revenueMonthLockService.create(
      dto.month,
      tenantId,
      branchId,
      userId,
    );
  }

  /**
   * DELETE /revenue-month-locks/:month
   * Unlocks a specific month
   */
  @Delete(':month')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
    @Param('month') month: string,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    await this.revenueMonthLockService.remove(tenantId, branchId, month);
    return { message: 'Month unlocked successfully' };
  }

  /**
   * GET /revenue-month-locks/check/:month
   * Checks if a specific month is locked
   */
  @Get('check/:month')
  async checkLock(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
    @Param('month') month: string,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query parameter is required');
    }

    return this.revenueMonthLockService.checkMonth(tenantId, branchId, month);
  }
}
