import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreatePaymentInput {
  memberId: string;
  amount: number;
  paidOn: Date | string;
  paymentMethod: PaymentMethod;
  note?: string;
}

export interface CorrectPaymentInput {
  amount?: number;
  paidOn?: Date | string;
  paymentMethod?: PaymentMethod;
  note?: string;
  correctionReason?: string;
  version: number;
}

export interface PaymentListFilters {
  memberId?: string;
  branchId?: string;
  paymentMethod?: PaymentMethod;
  startDate?: Date | string;
  endDate?: Date | string;
  includeCorrections?: boolean;
  page?: number;
  limit?: number;
}

export interface RevenueReportFilters {
  startDate: Date | string;
  endDate: Date | string;
  branchId?: string;
  paymentMethod?: PaymentMethod;
  groupBy?: 'day' | 'week' | 'month';
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new payment
   * Business rules:
   * - Validates member belongs to tenant
   * - Validates amount is positive (0.01 minimum)
   * - Validates paidOn date is not in future (using tenant timezone)
   * - Truncates paidOn to start-of-day UTC before storing
   * - Sets branchId from member's branch automatically
   */
  async createPayment(
    tenantId: string,
    userId: string,
    input: CreatePaymentInput,
  ) {
    // Validate member belongs to tenant
    const member = await this.prisma.member.findUnique({
      where: { id: input.memberId },
      include: { branch: true },
    });

    if (!member) {
      throw new NotFoundException('Üye bulunamadı');
    }

    if (member.tenantId !== tenantId) {
      throw new NotFoundException('Üye bulunamadı');
    }

    // Validate amount
    this.validateAmount(input.amount);

    // Validate and truncate paidOn date
    const paidOnDate = this.validateAndTruncatePaidOn(
      input.paidOn,
      tenantId,
    );

    // Create payment
    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: member.branchId,
        memberId: input.memberId,
        amount: new Decimal(input.amount),
        paidOn: paidOnDate,
        paymentMethod: input.paymentMethod,
        note: input.note,
        createdBy: userId,
      },
      include: {
        member: true,
        branch: true,
      },
    });

    return payment;
  }

  /**
   * Correct a payment
   * Business rules:
   * - Validates original payment belongs to tenant
   * - Hard-fails with BadRequestException if isCorrected = true (single-correction rule)
   * - Validates version matches expected value
   * - Throws ConflictException on version mismatch
   * - Creates new payment record with corrected values
   * - Marks original payment as corrected and increments version atomically
   */
  async correctPayment(
    tenantId: string,
    userId: string,
    paymentId: string,
    input: CorrectPaymentInput,
  ) {
    // Get original payment and validate tenant isolation
    const originalPayment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!originalPayment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    if (originalPayment.tenantId !== tenantId) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Single-correction rule: hard-fail if already corrected
    if (originalPayment.isCorrected) {
      throw new BadRequestException(
        'Bu ödeme zaten düzeltilmiş. Bir ödeme yalnızca bir kez düzeltilebilir.',
      );
    }

    // Validate version matches (optimistic locking)
    if (originalPayment.version !== input.version) {
      throw new ConflictException(
        'Ödeme başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.',
      );
    }

    // Validate amount if provided
    if (input.amount !== undefined) {
      this.validateAmount(input.amount);
    }

    // Validate and truncate paidOn date if provided
    let paidOnDate = originalPayment.paidOn;
    if (input.paidOn !== undefined) {
      paidOnDate = this.validateAndTruncatePaidOn(input.paidOn, tenantId);
    }

    // Use corrected values or original values
    const correctedAmount =
      input.amount !== undefined
        ? new Decimal(input.amount)
        : originalPayment.amount;
    const correctedPaymentMethod =
      input.paymentMethod !== undefined
        ? input.paymentMethod
        : originalPayment.paymentMethod;
    const correctedNote =
      input.note !== undefined ? input.note : originalPayment.note;

    // Atomic transaction: create corrected payment + update original
    const result = await this.prisma.$transaction(async (tx) => {
      // Create corrected payment
      const correctedPayment = await tx.payment.create({
        data: {
          tenantId: originalPayment.tenantId,
          branchId: originalPayment.branchId,
          memberId: originalPayment.memberId,
          amount: correctedAmount,
          paidOn: paidOnDate,
          paymentMethod: correctedPaymentMethod,
          note: correctedNote,
          isCorrection: true,
          correctedPaymentId: originalPayment.id,
          createdBy: userId,
        },
        include: {
          member: true,
          branch: true,
        },
      });

      // Update original payment: mark as corrected and increment version
      // Use updateMany to ensure atomicity and detect concurrent updates
      const updateResult = await tx.payment.updateMany({
        where: {
          id: originalPayment.id,
          version: originalPayment.version, // Optimistic locking check
        },
        data: {
          isCorrected: true,
          correctedPaymentId: correctedPayment.id,
          version: { increment: 1 },
        },
      });

      // If updateResult.count === 0, version was changed by another transaction
      if (updateResult.count === 0) {
        throw new ConflictException(
          'Ödeme başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.',
        );
      }

      return correctedPayment;
    });

    return result;
  }

  /**
   * Get a payment by ID
   * Business rules:
   * - Enforces tenant isolation - throws NotFoundException if payment doesn't belong to tenant
   */
  async getPaymentById(tenantId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        member: true,
        branch: true,
        correctedPayment: true,
        correctingPayment: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    if (payment.tenantId !== tenantId) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    return payment;
  }

  /**
   * List payments with filtering and pagination
   * Business rules:
   * - Filters by tenant automatically
   * - Supports filtering by memberId, branchId, paymentMethod, date range
   * - Excludes corrected original payments by default (unless includeCorrections = true)
   */
  async listPayments(tenantId: string, filters: PaymentListFilters = {}) {
    const {
      memberId,
      branchId,
      paymentMethod,
      startDate,
      endDate,
      includeCorrections = false,
      page = 1,
      limit = 20,
    } = filters;

    const where: Prisma.PaymentWhereInput = {
      tenantId,
    };

    // Filter by member
    if (memberId) {
      where.memberId = memberId;
    }

    // Filter by branch
    if (branchId) {
      where.branchId = branchId;
    }

    // Filter by payment method
    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    // Filter by date range
    if (startDate || endDate) {
      where.paidOn = {};
      if (startDate) {
        where.paidOn.gte = this.truncateToStartOfDayUTC(startDate);
      }
      if (endDate) {
        const endDateTruncated = this.truncateToStartOfDayUTC(endDate);
        // Add 1 day to include the entire end date
        endDateTruncated.setUTCDate(endDateTruncated.getUTCDate() + 1);
        where.paidOn.lt = endDateTruncated;
      }
    }

    // Exclude corrected original payments by default
    if (!includeCorrections) {
      where.OR = [
        { isCorrection: true }, // Include corrections
        { isCorrected: false }, // Include non-corrected originals
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { paidOn: 'desc' },
        include: {
          member: true,
          branch: true,
          correctedPayment: true,
          correctingPayment: true,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all payments for a specific member
   * Business rules:
   * - Filters by tenant automatically
   * - Validates member belongs to tenant
   */
  async getMemberPayments(
    tenantId: string,
    memberId: string,
    filters: { startDate?: Date | string; endDate?: Date | string } = {},
  ) {
    // Validate member belongs to tenant
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Üye bulunamadı');
    }

    if (member.tenantId !== tenantId) {
      throw new NotFoundException('Üye bulunamadı');
    }

    return this.listPayments(tenantId, {
      ...filters,
      memberId,
    });
  }

  /**
   * Get revenue report with aggregation
   * Business rules:
   * - Excludes corrected original payments (isCorrection=false AND isCorrected=true)
   * - Includes corrected payment amounts (isCorrection=true)
   * - Filters by tenant automatically
   * - Uses database GROUP BY for period breakdown
   */
  async getRevenueReport(
    tenantId: string,
    filters: RevenueReportFilters,
  ) {
    const {
      startDate,
      endDate,
      branchId,
      paymentMethod,
      groupBy = 'day',
    } = filters;

    // Build where clause
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      // Exclude corrected original payments
      // Include: isCorrection=true OR (isCorrection=false AND isCorrected=false)
      OR: [
        { isCorrection: true }, // Include corrections
        { isCorrected: false }, // Include non-corrected originals
      ],
    };

    // Filter by branch
    if (branchId) {
      where.branchId = branchId;
    }

    // Filter by payment method
    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    // Filter by date range
    const startDateTruncated = this.truncateToStartOfDayUTC(startDate);
    const endDateTruncated = this.truncateToStartOfDayUTC(endDate);
    // Add 1 day to include the entire end date
    endDateTruncated.setUTCDate(endDateTruncated.getUTCDate() + 1);

    where.paidOn = {
      gte: startDateTruncated,
      lt: endDateTruncated,
    };

    // Get all payments matching filters
    const payments = await this.prisma.payment.findMany({
      where,
      select: {
        amount: true,
        paidOn: true,
        paymentMethod: true,
        branchId: true,
      },
    });

    // Calculate total revenue
    const totalRevenue = payments.reduce(
      (sum, payment) => sum + payment.amount.toNumber(),
      0,
    );

    // Group by period
    const grouped = this.groupPaymentsByPeriod(payments, groupBy);

    return {
      totalRevenue,
      period: groupBy,
      breakdown: grouped,
    };
  }

  /**
   * Validate amount is positive, max 999999.99, 2 decimal places
   */
  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new BadRequestException(
        'Ödeme tutarı pozitif olmalıdır (minimum 0.01)',
      );
    }

    if (amount > 999999.99) {
      throw new BadRequestException(
        'Ödeme tutarı maksimum 999999.99 olabilir',
      );
    }

    // Check decimal places (max 2)
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      throw new BadRequestException(
        'Ödeme tutarı en fazla 2 ondalık basamak içerebilir',
      );
    }
  }

  /**
   * Validate paidOn date is not in future and truncate to start-of-day UTC
   * Uses tenant timezone for validation (currently defaults to UTC, can be extended when timezone is added to Tenant)
   */
  private validateAndTruncatePaidOn(
    paidOn: Date | string,
    tenantId: string,
  ): Date {
    const date = typeof paidOn === 'string' ? new Date(paidOn) : paidOn;

    // TODO: Get tenant timezone from Tenant model when timezone field is added
    // For now, use UTC as default
    const tenantTimezone = 'UTC';

    // Validate date is not in future
    // Compare dates in tenant timezone
    const todayInTenantTimezone = this.getTodayInTimezone(tenantTimezone);
    const paidOnInTenantTimezone = this.getDateInTimezone(date, tenantTimezone);

    if (paidOnInTenantTimezone > todayInTenantTimezone) {
      throw new BadRequestException(
        'Ödeme tarihi gelecekte olamaz. Bugün veya geçmiş bir tarih seçiniz.',
      );
    }

    // Truncate to start-of-day UTC (DATE-ONLY semantics)
    return this.truncateToStartOfDayUTC(date);
  }

  /**
   * Truncate date to start-of-day UTC (00:00:00Z)
   * This ensures paidOn represents DATE-ONLY business date
   */
  private truncateToStartOfDayUTC(date: Date | string): Date {
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    const truncated = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return truncated;
  }

  /**
   * Get today's date in specified timezone
   * Currently simplified - can be enhanced with timezone library when Tenant timezone is added
   */
  private getTodayInTimezone(timezone: string): Date {
    // For now, return today in UTC
    // TODO: Use timezone library (e.g., date-fns-tz) when Tenant timezone is added
    const now = new Date();
    return this.truncateToStartOfDayUTC(now);
  }

  /**
   * Get date in specified timezone
   * Currently simplified - can be enhanced with timezone library when Tenant timezone is added
   */
  private getDateInTimezone(date: Date, timezone: string): Date {
    // For now, return date truncated to start of day
    // TODO: Use timezone library (e.g., date-fns-tz) when Tenant timezone is added
    return this.truncateToStartOfDayUTC(date);
  }

  /**
   * Group payments by period (day/week/month)
   */
  private groupPaymentsByPeriod(
    payments: Array<{ amount: Decimal; paidOn: Date }>,
    groupBy: 'day' | 'week' | 'month',
  ): Array<{ period: string; revenue: number; count: number }> {
    const grouped = new Map<string, { revenue: number; count: number }>();

    for (const payment of payments) {
      let periodKey: string;

      switch (groupBy) {
        case 'day':
          periodKey = payment.paidOn.toISOString().split('T')[0]; // YYYY-MM-DD
          break;
        case 'week':
          // Get week start date (Monday)
          const weekStart = this.getWeekStart(payment.paidOn);
          periodKey = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          periodKey = `${payment.paidOn.getUTCFullYear()}-${String(payment.paidOn.getUTCMonth() + 1).padStart(2, '0')}`; // YYYY-MM
          break;
        default:
          periodKey = payment.paidOn.toISOString().split('T')[0];
      }

      const existing = grouped.get(periodKey) || { revenue: 0, count: 0 };
      grouped.set(periodKey, {
        revenue: existing.revenue + payment.amount.toNumber(),
        count: existing.count + 1,
      });
    }

    return Array.from(grouped.entries())
      .map(([period, data]) => ({
        period,
        revenue: data.revenue,
        count: data.count,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Get week start date (Monday) for a given date
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getUTCDay();
    // Convert Sunday (0) to 7 for easier calculation
    const dayOfWeek = day === 0 ? 7 : day;
    // Calculate days to subtract to get to Monday (day 1)
    const daysToSubtract = dayOfWeek - 1;
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - daysToSubtract);
    return this.truncateToStartOfDayUTC(weekStart);
  }
}

