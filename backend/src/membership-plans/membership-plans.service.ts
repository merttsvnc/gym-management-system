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
  scope?: PlanScope;
  branchId?: string;
  q?: string; // Name contains search (case-insensitive)
  includeArchived?: boolean; // Default false
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
      await this.validateBranchBelongsToTenant(tenantId, input.branchId || '');
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
    const scopeKey = this.computeScopeKey(input.scope, input.branchId || null);

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
   * - Supports filtering by scope, branchId, status
   * - Supports search by name (case-insensitive) via 'q' parameter
   * - Supports includeArchived flag (default false, uses archivedAt for archived logic)
   * - Default pagination: page=1, limit=20
   * - Sorting: sortOrder ASC, then createdAt ASC
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
    const {
      status,
      search,
      page = 1,
      limit = 20,
      scope,
      branchId,
      q,
      includeArchived = false,
    } = filters;

    // Validate branchId if provided (must exist and belong to tenant)
    if (branchId) {
      await this.validateBranchIdForListing(tenantId, branchId);
    }

    const where: Prisma.MembershipPlanWhereInput = {
      tenantId,
    };

    // Filter by scope
    if (scope) {
      where.scope = scope;
    }

    // Filter by branchId (returns only BRANCH-scoped plans for that branch)
    if (branchId) {
      where.branchId = branchId;
      // If branchId is provided, implicitly filter to BRANCH scope
      where.scope = PlanScope.BRANCH;
    }

    // Filter by archivedAt (not status) - archived = archivedAt != null
    if (!includeArchived) {
      where.archivedAt = null;
    }

    // Filter by status if provided (legacy support)
    if (status) {
      where.status = status;
    }

    // Name search: use 'q' parameter if provided, fallback to 'search' for backward compatibility
    const nameSearch = q || search;
    if (nameSearch) {
      where.name = {
        contains: nameSearch,
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
   * - Returns only ACTIVE plans (archivedAt is null)
   * - If branchId is NOT provided: returns TENANT plans only
   * - If branchId is provided (and valid for tenant): returns TENANT plans + BRANCH plans for that branch
   * - Does NOT return BRANCH plans for other branches
   * - Ordered by sortOrder ASC, then createdAt ASC
   * - If includeMemberCount=true, includes activeMemberCount per plan (uses single query with aggregation)
   */
  async listActivePlansForTenant(
    tenantId: string,
    branchId?: string,
    includeMemberCount?: boolean,
  ): Promise<
    MembershipPlan[] | (MembershipPlan & { activeMemberCount: number })[]
  > {
    // Validate branchId if provided
    if (branchId) {
      await this.validateBranchIdForListing(tenantId, branchId);
    }

    // Build where clause: ACTIVE plans (archivedAt is null)
    const where: Prisma.MembershipPlanWhereInput = {
      tenantId,
      archivedAt: null, // ACTIVE = archivedAt is null
    };

    if (branchId) {
      // Return TENANT plans + BRANCH plans for the specified branch
      where.OR = [
        { scope: PlanScope.TENANT }, // TENANT-scoped plans
        {
          scope: PlanScope.BRANCH,
          branchId: branchId, // BRANCH-scoped plans for this branch only
        },
      ];
    } else {
      // No branchId provided: return only TENANT plans
      where.scope = PlanScope.TENANT;
    }

    // If includeMemberCount is true, use aggregation to avoid N+1 queries
    if (includeMemberCount) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const plansWithCounts = await this.prisma.membershipPlan.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          _count: {
            select: {
              members: {
                where: {
                  status: 'ACTIVE',
                  membershipEndDate: {
                    gte: today,
                  },
                },
              },
            },
          },
        },
      });

      // Map results to include activeMemberCount
      return plansWithCounts.map((plan) => ({
        ...plan,
        activeMemberCount: plan._count.members,
      })) as (MembershipPlan & { activeMemberCount: number })[];
    }

    return this.prisma.membershipPlan.findMany({
      where,
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
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, tenantId },
    });

    if (!plan) {
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

    // Note: scope and branchId are immutable after creation.
    // Immutability is enforced at the DTO/controller layer (fields not in UpdatePlanDto).
    // ValidationPipe with forbidNonWhitelisted=true rejects requests with these fields.

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

    // Defense-in-depth: Ensure immutable fields are never in updateData
    // Even though UpdatePlanInput doesn't include them, verify at runtime
    if ('scope' in updateData) {
      throw new BadRequestException(
        'Plan kapsamı (scope) değiştirilemez. Plan oluşturulduktan sonra kapsam değiştirilemez.',
      );
    }
    if ('branchId' in updateData) {
      throw new BadRequestException(
        'Plan şubesi (branchId) değiştirilemez. Plan oluşturulduktan sonra şube değiştirilemez.',
      );
    }
    if ('scopeKey' in updateData) {
      throw new BadRequestException(
        'Plan scopeKey değiştirilemez. scopeKey sistem tarafından yönetilir.',
      );
    }

    try {
      return await this.prisma.membershipPlan.update({
        where: { id_tenantId: { id: planId, tenantId } },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Plan bulunamadı');
      }
      throw error;
    }
  }

  /**
   * Archive a plan for a tenant (soft delete)
   * Business rules:
   * - Sets archivedAt = now (uses archivedAt for archived logic, not status)
   * - MUST be idempotent: if already archived (archivedAt != null), return successfully without error
   * - Does NOT block archival when active members exist (spec says warn, not block)
   * - Returns plan with active member count for warnings (used later by controller)
   */
  async archivePlanForTenant(
    tenantId: string,
    planId: string,
  ): Promise<{ plan: MembershipPlan; activeMemberCount: number }> {
    const plan = await this.getPlanByIdForTenant(tenantId, planId);

    // Idempotent: if already archived (archivedAt != null), return successfully
    if (plan.archivedAt !== null) {
      const activeMemberCount = await this.countActiveMembersForPlan(planId);
      return { plan, activeMemberCount };
    }

    const activeMemberCount = await this.countActiveMembersForPlan(planId);

    // Soft delete by setting archivedAt = now and status = ARCHIVED
    try {
      const archivedPlan = await this.prisma.membershipPlan.update({
        where: { id_tenantId: { id: planId, tenantId } },
        data: {
          archivedAt: new Date(),
          status: PlanStatus.ARCHIVED,
        },
      });

      return { plan: archivedPlan, activeMemberCount };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Plan bulunamadı');
      }
      throw error;
    }
  }

  /**
   * Restore an archived plan (set archivedAt back to null)
   * Business rules:
   * - If plan already ACTIVE (archivedAt is null), return 400 Bad Request
   * - Before restoring, run uniqueness validation (case-insensitive, archivedAt null check)
   * - Recompute scopeKey during restore:
   *   - TENANT -> "TENANT"
   *   - BRANCH -> branchId (must exist)
   * - Then set archivedAt = null
   */
  async restorePlanForTenant(
    tenantId: string,
    planId: string,
  ): Promise<MembershipPlan> {
    const plan = await this.getPlanByIdForTenant(tenantId, planId);

    // If plan already ACTIVE (archivedAt is null), return 400
    if (plan.archivedAt === null) {
      throw new BadRequestException(
        'Plan zaten aktif durumda. Arşivlenmiş planlar geri yüklenebilir.',
      );
    }

    // Before restoring, run uniqueness validation (case-insensitive, archivedAt null check)
    await this.checkNameUniqueness(
      tenantId,
      plan.name,
      planId,
      plan.scope,
      plan.branchId,
    );

    // Recompute scopeKey during restore
    const scopeKey = this.computeScopeKey(plan.scope, plan.branchId);

    // Restore by setting archivedAt = null, status = ACTIVE, and updating scopeKey
    try {
      return await this.prisma.membershipPlan.update({
        where: { id_tenantId: { id: planId, tenantId } },
        data: {
          archivedAt: null,
          status: PlanStatus.ACTIVE,
          scopeKey, // Recompute scopeKey during restore
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Plan bulunamadı');
      }
      throw error;
    }
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

    try {
      await this.prisma.membershipPlan.delete({
        where: { id_tenantId: { id: planId, tenantId } },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Plan bulunamadı');
      }
      throw error;
    }
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
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });

    if (!branch) {
      throw new NotFoundException('Şube bulunamadı');
    }

    if (!branch.isActive) {
      throw new BadRequestException(
        'Arşivlenmiş şubeler için plan oluşturulamaz',
      );
    }
  }

  /**
   * Validate branchId for listing operations
   * Business rules:
   * - Branch must exist
   * - Branch must belong to tenantId
   * - Returns 400 Bad Request with generic Turkish message if invalid (no tenant leakage)
   * - Used for listing filters (doesn't require branch to be active)
   */
  private async validateBranchIdForListing(
    tenantId: string,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });

    if (!branch) {
      throw new BadRequestException('Geçersiz şube kimliği');
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
    throw new BadRequestException(`Geçersiz plan kapsamı: ${String(scope)}`);
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
