import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MembershipPlan,
  DurationType,
  PlanStatus,
  PlanScope,
  Prisma,
} from '@prisma/client';

export interface CreatePlanInput {
  scope: PlanScope;
  branchId?: string;
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
  maxFreezeDays?: number | null;
  autoRenew?: boolean;
  sortOrder?: number | null;
  status?: PlanStatus;
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
   * - Plan name must be unique within tenant (TENANT scope) or branch (BRANCH scope) (case-insensitive, ACTIVE only)
   * - Duration value must be in valid range (DAYS: 1-730, MONTHS: 1-24)
   * - Currency must be valid ISO 4217 format (3 uppercase letters)
   * - Price must be >= 0
   * - New plans are created with status ACTIVE
   * - scopeKey is computed internally: "TENANT" for TENANT scope, branchId for BRANCH scope
   */
  async createPlanForTenant(
    tenantId: string,
    input: CreatePlanInput,
  ): Promise<MembershipPlan> {
    // Validate scope and branchId combination
    this.validateScopeAndBranchId(input);

    // Validate branch belongs to tenant (if BRANCH scope)
    if (input.scope === PlanScope.BRANCH) {
      await this.validateBranchBelongsToTenant(
        tenantId,
        input.branchId || '',
      );
    }

    // Validate duration value
    this.validateDurationValue(input.durationType, input.durationValue);

    // Validate currency format
    this.validateCurrency(input.currency);

    // Validate price
    if (input.price < 0) {
      throw new BadRequestException('Fiyat negatif olamaz');
    }

    // Compute scopeKey internally (never user-provided)
    const scopeKey = this.computeScopeKey(
      input.scope,
      input.branchId || null,
    );

    // Check name uniqueness (case-insensitive, ACTIVE only, scope-aware)
    await this.checkNameUniqueness(
      tenantId,
      input.name,
      null,
      input.scope,
      input.branchId || null,
    );

    // Create plan with status ACTIVE
    return this.prisma.membershipPlan.create({
      data: {
        tenantId,
        scope: input.scope,
        branchId: input.scope === PlanScope.BRANCH ? input.branchId : null,
        scopeKey, // Computed internally, never user-provided
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

    // Check name uniqueness if name is being updated (scope-aware)
    if (input.name && input.name.trim() !== existingPlan.name) {
      await this.checkNameUniqueness(
        tenantId,
        input.name,
        planId,
        existingPlan.scope,
        existingPlan.branchId,
      );
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
   * Validate scope and branchId combination
   * Business rules:
   * - TENANT scope requires branchId to be null/undefined
   * - BRANCH scope requires branchId to be provided (non-empty string)
   */
  private validateScopeAndBranchId(input: CreatePlanInput): void {
    if (input.scope === PlanScope.TENANT) {
      if (input.branchId !== null && input.branchId !== undefined) {
        throw new BadRequestException(
          'TENANT kapsamındaki planlar için branchId belirtilmemelidir',
        );
      }
    } else if (input.scope === PlanScope.BRANCH) {
      if (!input.branchId || input.branchId.trim() === '') {
        throw new BadRequestException(
          'BRANCH kapsamındaki planlar için branchId gereklidir',
        );
      }
    }
  }

  /**
   * Validate branch belongs to tenant and is active (for BRANCH scope)
   * Business rules:
   * - Branch must exist
   * - Branch must belong to tenantId
   * - Branch must be active (isActive=true) for BRANCH scope plans
   * - Returns 403 Forbidden for cross-tenant access (generic message, no tenant leakage)
   * - Returns 404 Not Found if branch doesn't exist
   */
  private async validateBranchBelongsToTenant(
    tenantId: string,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Şube bulunamadı');
    }

    if (branch.tenantId !== tenantId) {
      // Generic error message to prevent tenant leakage
      throw new ForbiddenException('Bu işlem için yetkiniz bulunmamaktadır');
    }

    if (!branch.isActive) {
      throw new BadRequestException(
        'Arşivlenmiş şubeler için plan oluşturulamaz',
      );
    }
  }

  /**
   * Compute scopeKey based on scope and branchId
   * Business rules:
   * - TENANT scope => scopeKey = "TENANT"
   * - BRANCH scope => scopeKey = branchId (must be non-empty)
   * - scopeKey is ALWAYS computed internally, never user-provided
   */
  private computeScopeKey(scope: PlanScope, branchId?: string | null): string {
    if (scope === PlanScope.TENANT) {
      return 'TENANT';
    } else if (scope === PlanScope.BRANCH) {
      if (!branchId || branchId.trim() === '') {
        throw new BadRequestException(
          'BRANCH kapsamı için branchId gereklidir',
        );
      }
      return branchId;
    }
    throw new BadRequestException(`Geçersiz plan kapsamı: ${scope}`);
  }

  /**
   * Check plan name uniqueness (scope-aware, case-insensitive, ACTIVE only)
   * Business rules:
   * - TENANT scope: checks tenantId + name (case-insensitive, ACTIVE only)
   * - BRANCH scope: checks tenantId + branchId + name (case-insensitive, ACTIVE only)
   * - Excludes archived plans from uniqueness checks (archivedAt is null)
   * - Allows same name across different branches (BRANCH scope)
   * - Allows same name between TENANT and BRANCH scopes
   * - Throws ConflictException if duplicate found
   */
  private async checkNameUniqueness(
    tenantId: string,
    name: string,
    excludePlanId: string | null,
    scope: PlanScope,
    branchId: string | null,
  ): Promise<void> {
    const where: Prisma.MembershipPlanWhereInput = {
      tenantId,
      scope,
      name: {
        equals: name.trim(),
        mode: 'insensitive',
      },
      archivedAt: null, // Only non-archived plans count toward uniqueness
    };

    // For BRANCH scope, also filter by branchId
    if (scope === PlanScope.BRANCH) {
      if (!branchId) {
        throw new BadRequestException(
          'BRANCH kapsamı için branchId gereklidir',
        );
      }
      where.branchId = branchId;
    } else {
      // For TENANT scope, ensure branchId is null
      where.branchId = null;
    }

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
