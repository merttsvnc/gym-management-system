import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MembershipPlan,
  DurationType,
  PlanStatus,
  Prisma,
} from '@prisma/client';

export interface CreatePlanInput {
  name: string;
  description?: string;
  durationType: DurationType;
  durationValue: number;
  price: number;
  currency: string;
  maxFreezeDays?: number;
  autoRenew?: boolean;
  sortOrder?: number;
}

export interface UpdatePlanInput {
  name?: string;
  description?: string;
  durationType?: DurationType;
  durationValue?: number;
  price?: number;
  currency?: string;
  maxFreezeDays?: number;
  autoRenew?: boolean;
  sortOrder?: number;
}

export interface PlanListFilters {
  status?: PlanStatus;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MembershipPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new membership plan for a tenant
   * Business rules:
   * - Plan name must be unique within tenant (case-insensitive)
   * - Duration value must be in valid range (DAYS: 1-730, MONTHS: 1-24)
   * - Currency must be valid ISO 4217 format (3 uppercase letters)
   * - Price must be >= 0
   * - New plans are created with status ACTIVE
   */
  async createPlanForTenant(
    tenantId: string,
    input: CreatePlanInput,
  ): Promise<MembershipPlan> {
    // Validate duration value
    this.validateDurationValue(input.durationType, input.durationValue);

    // Validate currency format
    this.validateCurrency(input.currency);

    // Validate price
    if (input.price < 0) {
      throw new BadRequestException('Fiyat negatif olamaz');
    }

    // Check name uniqueness (case-insensitive)
    await this.checkNameUniqueness(tenantId, input.name, null);

    // Create plan with status ACTIVE
    return this.prisma.membershipPlan.create({
      data: {
        tenantId,
        name: input.name.trim(),
        description: input.description?.trim(),
        durationType: input.durationType,
        durationValue: input.durationValue,
        price: input.price,
        currency: input.currency.toUpperCase(),
        maxFreezeDays: input.maxFreezeDays,
        autoRenew: input.autoRenew ?? false,
        status: PlanStatus.ACTIVE,
        sortOrder: input.sortOrder,
      },
    });
  }

  /**
   * List plans for a tenant with filters and pagination
   * Business rules:
   * - All queries are tenant-scoped
   * - Supports filtering by status
   * - Supports search by name (case-insensitive)
   * - Default pagination: page=1, limit=20
   */
  async listPlansForTenant(
    tenantId: string,
    filters: PlanListFilters = {},
  ): Promise<{
    data: MembershipPlan[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { status, search, page = 1, limit = 20 } = filters;

    const where: Prisma.MembershipPlanWhereInput = {
      tenantId,
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.membershipPlan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.membershipPlan.count({ where }),
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
   * List active plans for a tenant (no pagination, for dropdowns)
   * Business rules:
   * - Returns only ACTIVE plans
   * - Ordered by sortOrder, then createdAt
   */
  async listActivePlansForTenant(tenantId: string): Promise<MembershipPlan[]> {
    return this.prisma.membershipPlan.findMany({
      where: {
        tenantId,
        status: PlanStatus.ACTIVE,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get a plan by ID for a tenant
   * Business rules:
   * - Enforces tenant isolation - throws NotFoundException if plan doesn't belong to tenant
   */
  async getPlanByIdForTenant(
    tenantId: string,
    planId: string,
  ): Promise<MembershipPlan> {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan bulunamadı');
    }

    if (plan.tenantId !== tenantId) {
      throw new NotFoundException('Plan bulunamadı');
    }

    return plan;
  }

  /**
   * Update a plan for a tenant
   * Business rules:
   * - Validates plan belongs to tenant
   * - Validates name uniqueness if name is being updated
   * - Validates duration value if duration is being updated
   * - Validates currency format if currency is being updated
   */
  async updatePlanForTenant(
    tenantId: string,
    planId: string,
    input: UpdatePlanInput,
  ): Promise<MembershipPlan> {
    const existingPlan = await this.getPlanByIdForTenant(tenantId, planId);

    // Validate duration value if being updated
    if (input.durationType && input.durationValue !== undefined) {
      this.validateDurationValue(input.durationType, input.durationValue);
    } else if (input.durationValue !== undefined) {
      // If only durationValue is provided, use existing durationType
      this.validateDurationValue(
        existingPlan.durationType,
        input.durationValue,
      );
    }

    // Validate currency if being updated
    if (input.currency) {
      this.validateCurrency(input.currency);
    }

    // Validate price if being updated
    if (input.price !== undefined && input.price < 0) {
      throw new BadRequestException('Fiyat negatif olamaz');
    }

    // Check name uniqueness if name is being updated
    if (input.name && input.name.trim() !== existingPlan.name) {
      await this.checkNameUniqueness(tenantId, input.name, planId);
    }

    // Build update data
    const updateData: Prisma.MembershipPlanUpdateInput = {};

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() ?? null;
    }
    if (input.durationType !== undefined) {
      updateData.durationType = input.durationType;
    }
    if (input.durationValue !== undefined) {
      updateData.durationValue = input.durationValue;
    }
    if (input.price !== undefined) {
      updateData.price = input.price;
    }
    if (input.currency !== undefined) {
      updateData.currency = input.currency.toUpperCase();
    }
    if (input.maxFreezeDays !== undefined) {
      updateData.maxFreezeDays = input.maxFreezeDays ?? null;
    }
    if (input.autoRenew !== undefined) {
      updateData.autoRenew = input.autoRenew;
    }
    if (input.sortOrder !== undefined) {
      updateData.sortOrder = input.sortOrder ?? null;
    }

    return this.prisma.membershipPlan.update({
      where: { id: planId },
      data: updateData,
    });
  }

  /**
   * Archive a plan for a tenant
   * Business rules:
   * - Sets status to ARCHIVED
   * - Does NOT block archival when active members exist (spec says warn, not block)
   * - Returns plan with active member count for warnings (used later by controller)
   */
  async archivePlanForTenant(
    tenantId: string,
    planId: string,
  ): Promise<{ plan: MembershipPlan; activeMemberCount: number }> {
    const plan = await this.getPlanByIdForTenant(tenantId, planId);

    if (plan.status === PlanStatus.ARCHIVED) {
      // Already archived, return as-is
      const activeMemberCount = await this.countActiveMembersForPlan(planId);
      return { plan, activeMemberCount };
    }

    const activeMemberCount = await this.countActiveMembersForPlan(planId);

    const archivedPlan = await this.prisma.membershipPlan.update({
      where: { id: planId },
      data: {
        status: PlanStatus.ARCHIVED,
      },
    });

    return { plan: archivedPlan, activeMemberCount };
  }

  /**
   * Restore an archived plan (set status back to ACTIVE)
   * Business rules:
   * - Sets status to ACTIVE
   * - No restrictions on restoration
   */
  async restorePlanForTenant(
    tenantId: string,
    planId: string,
  ): Promise<MembershipPlan> {
    const plan = await this.getPlanByIdForTenant(tenantId, planId);

    if (plan.status === PlanStatus.ACTIVE) {
      // Already active, return as-is
      return plan;
    }

    return this.prisma.membershipPlan.update({
      where: { id: planId },
      data: {
        status: PlanStatus.ACTIVE,
      },
    });
  }

  /**
   * Delete a plan for a tenant (hard delete)
   * Business rules:
   * - Cannot delete if ANY member exists for that plan (any status)
   * - Throws BadRequestException with Turkish message if members exist
   */
  async deletePlanForTenant(tenantId: string, planId: string): Promise<void> {
    // Verify plan exists for tenant
    await this.getPlanByIdForTenant(tenantId, planId);

    // Check if any members exist for this plan (any status)
    const memberCount = await this.prisma.member.count({
      where: {
        membershipPlanId: planId,
      },
    });

    if (memberCount > 0) {
      throw new BadRequestException(
        'Bu plana bağlı üyeler olduğu için silinemez. Lütfen planı arşivleyin.',
      );
    }

    await this.prisma.membershipPlan.delete({
      where: { id: planId },
    });
  }

  /**
   * Count active members for a plan
   * Business rules:
   * - "Active member" = Member where:
   *   - status = ACTIVE
   *   - membershipEndDate >= today
   */
  async countActiveMembersForPlan(planId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.member.count({
      where: {
        membershipPlanId: planId,
        status: 'ACTIVE',
        membershipEndDate: {
          gte: today,
        },
      },
    });
  }

  /**
   * Validate duration value is in valid range
   * Business rules:
   * - DAYS: Must be between 1 and 730 (inclusive)
   * - MONTHS: Must be between 1 and 24 (inclusive)
   */
  private validateDurationValue(
    durationType: DurationType,
    durationValue: number,
  ): void {
    if (durationType === DurationType.DAYS) {
      if (durationValue < 1 || durationValue > 730) {
        throw new BadRequestException(
          'Süre değeri 1 ile 730 gün arasında olmalıdır',
        );
      }
    } else if (durationType === DurationType.MONTHS) {
      if (durationValue < 1 || durationValue > 24) {
        throw new BadRequestException(
          'Süre değeri 1 ile 24 ay arasında olmalıdır',
        );
      }
    }
  }

  /**
   * Validate currency format (ISO 4217)
   * Business rules:
   * - Must be 3 uppercase letters
   * - Regex: /^[A-Z]{3}$/
   */
  private validateCurrency(currency: string): void {
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException(
        'Para birimi 3 büyük harfli ISO 4217 formatında olmalıdır (örn: USD, EUR, TRY)',
      );
    }
  }

  /**
   * Check plan name uniqueness within tenant (case-insensitive)
   * Business rules:
   * - Plan names must be unique within tenant (case-insensitive)
   * - Throws ConflictException if duplicate found
   */
  private async checkNameUniqueness(
    tenantId: string,
    name: string,
    excludePlanId: string | null,
  ): Promise<void> {
    const where: Prisma.MembershipPlanWhereInput = {
      tenantId,
      name: {
        equals: name.trim(),
        mode: 'insensitive',
      },
    };

    if (excludePlanId) {
      where.id = {
        not: excludePlanId,
      };
    }

    const existingPlan = await this.prisma.membershipPlan.findFirst({
      where,
    });

    if (existingPlan) {
      throw new ConflictException(
        'Bu plan adı zaten kullanılıyor. Lütfen farklı bir ad seçiniz.',
      );
    }
  }
}
