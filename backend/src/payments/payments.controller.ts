import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CorrectPaymentDto } from './dto/correct-payment.dto';
import { PaymentListQueryDto } from './dto/payment-list-query.dto';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';

@Controller('api/v1/payments')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /api/v1/payments
   * Creates a new payment
   * Returns 201 Created
   * Errors:
   * - 400: Validation errors (invalid amount, future date, etc.)
   * - 403: Member from different tenant
   * - 404: Member not found
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    const payment = await this.paymentsService.createPayment(tenantId, userId, {
      memberId: dto.memberId,
      amount: dto.amount,
      paidOn: dto.paidOn,
      paymentMethod: dto.paymentMethod,
      note: dto.note,
    });

    return PaymentResponseDto.fromPrismaPaymentWithRelations(payment);
  }

  /**
   * GET /api/v1/payments
   * Lists payments for the current tenant with filtering and pagination
   * Returns 200 OK with paginated payment list
   * Errors:
   * - 400: Invalid query parameters
   */
  @Get()
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PaymentListQueryDto,
  ) {
    const result = await this.paymentsService.listPayments(tenantId, {
      memberId: query.memberId,
      branchId: query.branchId,
      paymentMethod: query.paymentMethod,
      startDate: query.startDate,
      endDate: query.endDate,
      includeCorrections: query.includeCorrections,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data.map((payment) =>
        PaymentResponseDto.fromPrismaPaymentWithRelations(payment),
      ),
      pagination: result.pagination,
    };
  }

  /**
   * GET /api/v1/payments/revenue
   * Gets revenue report with aggregation
   * Returns 200 OK with revenue breakdown
   * Errors:
   * - 400: Invalid query parameters
   * Note: This route must come before :id to avoid matching "revenue" as an ID
   */
  @Get('revenue')
  async getRevenueReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: RevenueReportQueryDto,
  ) {
    return this.paymentsService.getRevenueReport(tenantId, {
      startDate: query.startDate,
      endDate: query.endDate,
      branchId: query.branchId,
      paymentMethod: query.paymentMethod,
      groupBy: query.groupBy,
    });
  }

  /**
   * GET /api/v1/payments/members/:memberId
   * Gets all payments for a specific member (payment history)
   * Returns 200 OK with paginated payment list
   * Errors:
   * - 403: Member from different tenant
   * - 404: Member not found
   * Note: This route must come before :id to avoid route conflicts
   */
  @Get('members/:memberId')
  async getMemberPayments(
    @CurrentUser('tenantId') tenantId: string,
    @Param('memberId') memberId: string,
    @Query() query: { startDate?: string; endDate?: string; page?: number; limit?: number },
  ) {
    const result = await this.paymentsService.getMemberPayments(
      tenantId,
      memberId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
      },
    );

    return {
      data: result.data.map((payment) =>
        PaymentResponseDto.fromPrismaPaymentWithRelations(payment),
      ),
      pagination: result.pagination,
    };
  }

  /**
   * GET /api/v1/payments/:id
   * Gets a single payment by ID
   * Returns 200 OK
   * Errors:
   * - 403: Payment from different tenant
   * - 404: Payment not found
   * Note: This route must come after specific routes like 'revenue' and 'members/:memberId'
   */
  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const payment = await this.paymentsService.getPaymentById(tenantId, id);
    return PaymentResponseDto.fromPrismaPaymentWithRelations(payment);
  }

  /**
   * POST /api/v1/payments/:id/correct
   * Corrects a payment
   * Returns 201 Created
   * Errors:
   * - 400: Validation errors, already corrected payment (single-correction rule)
   * - 403: Payment from different tenant
   * - 404: Payment not found
   * - 409: Version mismatch (concurrent correction attempt)
   */
  @Post(':id/correct')
  @HttpCode(HttpStatus.CREATED)
  async correct(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: CorrectPaymentDto,
  ) {
    const payment = await this.paymentsService.correctPayment(
      tenantId,
      userId,
      id,
      {
        amount: dto.amount,
        paidOn: dto.paidOn,
        paymentMethod: dto.paymentMethod,
        note: dto.note,
        correctionReason: dto.correctionReason,
        version: dto.version,
      },
    );

    // Check if payment is older than 90 days and include warning
    const paymentAgeInDays =
      (new Date().getTime() - payment.paidOn.getTime()) /
      (1000 * 60 * 60 * 24);
    const warning =
      paymentAgeInDays > 90
        ? 'Bu ödeme 90 günden eski. Düzeltme işlemi gerçekleştirildi ancak eski bir ödeme olduğu için dikkatli olunmalıdır.'
        : undefined;

    return {
      ...PaymentResponseDto.fromPrismaPaymentWithRelations(payment),
      warning,
    };
  }
}

