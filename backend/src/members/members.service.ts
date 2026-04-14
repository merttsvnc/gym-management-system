/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberListQueryDto } from './dto/member-list-query.dto';
import { ChangeMemberStatusDto } from './dto/change-member-status.dto';
import { SchedulePlanChangeDto } from './dto/schedule-plan-change.dto';
import { RenewMembershipDto } from './dto/renew-membership.dto';
import { MemberStatus, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { MembershipPlansService } from '../membership-plans/membership-plans.service';
import { calculateMembershipEndDate } from '../membership-plans/utils/duration-calculator';
import {
  calculateMembershipStatus,
  DerivedMembershipStatus,
  getTodayStart,
} from '../common/utils/membership-status.util';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipPlansService: MembershipPlansService,
  ) {}

  /**
   * Enrich member object with computed/derived fields
   *
   * Adds:
   * - remainingDays: legacy field (still computed for backwards compatibility)
   * - isMembershipActive: boolean (derived from membershipEndDate)
   * - membershipState: 'ACTIVE' | 'EXPIRED'
   * - daysRemaining: number | null (from derived status)
   * - isExpiringSoon: boolean (true if active and within 7 days)
   */
  private enrichMemberWithComputedFields<
    T extends {
      membershipStartDate: Date;
      membershipEndDate: Date;
      status: MemberStatus;
      pausedAt: Date | null;
      resumedAt: Date | null;
    },
  >(member: T): T & { remainingDays: number } & DerivedMembershipStatus {
    const derivedStatus = calculateMembershipStatus(member.membershipEndDate);

    return {
      ...member,
      // Legacy field - kept for backwards compatibility
      remainingDays: this.calculateRemainingDays(member),
      // New derived fields - single source of truth
      isMembershipActive: derivedStatus.isMembershipActive,
      membershipState: derivedStatus.membershipState,
      daysRemaining: derivedStatus.daysRemaining,
      isExpiringSoon: derivedStatus.isExpiringSoon,
    };
  }

  /**
   * Create a new member
   * Business rules:
   * - Validates branch belongs to tenant
   * - Enforces phone uniqueness within tenant
   * - Validates membership plan exists, is ACTIVE, and belongs to tenant
   * - Calculates membershipEndDate from plan duration
   * - Sets membershipPriceAtPurchase (defaults to plan price if not provided)
   *
   * Domain-level input: accepts membershipPlanId (DTO will be updated in Phase 3)
   */
  async create(
    tenantId: string,
    dto: CreateMemberDto & {
      membershipPlanId?: string;
      membershipStartDate?: string | Date;
      membershipPriceAtPurchase?: number;
    },
  ) {
    // Validate branch belongs to tenant (tenant-scoped query - no cross-tenant leak)
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });

    if (!branch) {
      throw new NotFoundException('Şube bulunamadı');
    }

    // Normalize phone number
    const phone = dto.phone.trim();

    // Check phone uniqueness within tenant
    const existingMember = await this.prisma.member.findFirst({
      where: {
        tenantId,
        phone,
      },
    });

    if (existingMember) {
      throw new ConflictException(
        'Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.',
      );
    }

    // Determine membership plan ID
    // TODO: Phase 3 will update DTO to require membershipPlanId
    // For now, support both old (membershipType) and new (membershipPlanId) approaches
    const membershipPlanId = dto.membershipPlanId;
    if (!membershipPlanId) {
      throw new BadRequestException(
        'Üyelik planı gereklidir. Lütfen bir plan seçiniz.',
      );
    }

    // Fetch and validate plan
    const plan = await this.membershipPlansService.getPlanByIdForTenant(
      tenantId,
      membershipPlanId,
    );

    // Validate plan is ACTIVE (for new members)
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Arşivlenmiş planlar yeni üyeler için kullanılamaz',
      );
    }

    // Determine membership start date
    const now = new Date();

    const membershipStartDate = dto.membershipStartDate
      ? new Date(dto.membershipStartDate)
      : now;

    // Calculate membership end date using duration calculator
    const membershipEndDate = calculateMembershipEndDate(
      membershipStartDate,
      plan.durationType,
      plan.durationValue,
    );

    // Set membership price at purchase (use provided value or default to plan price)
    const membershipPriceAtPurchase =
      dto.membershipPriceAtPurchase !== undefined
        ? dto.membershipPriceAtPurchase
        : plan.price.toNumber();

    try {
      const member = await this.prisma.member.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone,
          email: dto.email?.trim() || null,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          photoUrl: dto.photoUrl || null,
          membershipPlanId,
          membershipStartDate,
          membershipEndDate,
          membershipPriceAtPurchase,
          notes: dto.notes?.trim() || null,
          status: 'ACTIVE',
          // Extended profile fields
          address: dto.address?.trim() || null,
          district: dto.district?.trim() || null,
          nationalId: dto.nationalId?.trim() || null,
          maritalStatus: dto.maritalStatus,
          occupation: dto.occupation?.trim() || null,
          industry: dto.industry?.trim() || null,
          bloodType: dto.bloodType,
          emergencyContactName: dto.emergencyContactName?.trim() || null,
          emergencyContactPhone: dto.emergencyContactPhone?.trim() || null,
        },
      });

      return this.enrichMemberWithComputedFields(member);
    } catch (error) {
      // Handle unique constraint violation from database
      // P2002: "Unique constraint failed on the {constraint}"
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        // Check if target contains 'phone' (target can be array or string)
        const isPhoneConstraint =
          (Array.isArray(target) && target.includes('phone')) ||
          (typeof target === 'string' && target.includes('phone'));

        if (isPhoneConstraint) {
          throw new ConflictException(
            'Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.',
          );
        }
      }
      throw error;
    }
  }

  /**
   * List members with filters, pagination, and search
   * Business rules:
   * - Filters by tenantId (tenant isolation)
   * - Supports filtering by branchId and status
   * - Supports search across firstName, lastName, and phone (substring, case-insensitive)
   * - Excludes archived members by default unless includeArchived is true
   * - expired filter: membershipEndDate < today (exclude ARCHIVED unless includeArchived=true)
   * - expiringDays filter: status=ACTIVE AND membershipEndDate in [today, today+expiringDays]
   * - status=ACTIVE filter: status=ACTIVE AND membershipEndDate >= today (CRITICAL FIX)
   * - isPassiveFilter: status IN (INACTIVE, PAUSED)
   * - Priority: expired > expiringDays > isPassiveFilter > status > default
   */
  async findAll(
    tenantId: string,
    query: MemberListQueryDto & {
      isPassiveFilter?: boolean;
    },
  ) {
    // Ensure page and limit are numbers (convert if they come as strings)
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const {
      branchId,
      status,
      search,
      expiringDays,
      expired = false,
      includeArchived = false,
      isPassiveFilter = false,
    } = query;

    // Build where clause
    const where: any = {
      tenantId,
    };

    // Filter by branch
    if (branchId) {
      where.branchId = branchId;
    }

    // Get today's date at start of day for date comparisons
    const today = getTodayStart();

    // Handle expired members filter (takes highest precedence)
    // Expired = membershipEndDate < today (membershipEndDate is NOT NULL per schema)
    if (expired) {
      // Exclude archived members unless includeArchived is true
      if (!includeArchived) {
        where.status = {
          not: 'ARCHIVED',
        };
      }
      // Filter by membershipEndDate < today
      where.membershipEndDate = {
        lt: today,
      };
      // Handle search with expired filter using AND
      if (search) {
        where.AND = [
          { membershipEndDate: { lt: today } },
          {
            OR: [
              {
                firstName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                lastName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          },
        ];
        // Remove the direct membershipEndDate assignment since it's in AND
        delete where.membershipEndDate;
      }
    }
    // Handle expiringDays filter (takes precedence over status, but not over expired filter)
    else if (expiringDays !== undefined) {
      // expiringDays requires ACTIVE status AND membershipEndDate in range
      where.status = 'ACTIVE';
      const endDate = new Date(today);
      // CRITICAL FIX: Ensure expiringDays is treated as number (DTO validation may not cast properly in all cases)
      const expiringDaysNum =
        typeof expiringDays === 'string'
          ? parseInt(expiringDays, 10)
          : expiringDays;
      endDate.setDate(endDate.getDate() + expiringDaysNum);
      where.membershipEndDate = {
        gte: today,
        lte: endDate,
      };
    }
    // Handle PASSIVE filter (INACTIVE + PAUSED)
    else if (isPassiveFilter) {
      where.status = {
        in: [MemberStatus.INACTIVE, MemberStatus.PAUSED],
      };
    } else {
      // Filter by status (only if expiringDays, expired, and isPassiveFilter not provided)
      if (status) {
        // CRITICAL FIX: status=ACTIVE must also require membershipEndDate >= today
        if (status === MemberStatus.ACTIVE) {
          where.status = MemberStatus.ACTIVE;
          where.membershipEndDate = {
            gte: today,
          };
        } else {
          where.status = status;
        }
      } else if (!includeArchived) {
        // Exclude archived members by default
        where.status = {
          not: 'ARCHIVED',
        };
      }
    }

    // Search across firstName, lastName, and phone (substring, case-insensitive)
    // Only add search OR if not already handled by expired filter
    if (search && !expired) {
      where.OR = [
        {
          firstName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          lastName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // DEBUG: Log sanitized where clause
    this.logger.debug(
      `Members findAll where clause: ${JSON.stringify(where, null, 2)}`,
    );

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          membershipPlan: true,
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    const dataWithComputedFields = data.map((member) =>
      this.enrichMemberWithComputedFields(member),
    );

    return {
      data: dataWithComputedFields,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a member by ID
   * Business rules:
   * - Enforces tenant isolation - throws NotFoundException if member doesn't belong to tenant
   * - Always includes branch information
   * - Optionally includes membership plan details if includePlan is true
   * - Always includes pending membership plan if pendingMembershipPlanId exists
   */
  async findOne(tenantId: string, id: string, includePlan = false) {
    const member = await this.prisma.member.findFirst({
      where: { id, tenantId },
      include: {
        branch: true,
        ...(includePlan ? { membershipPlan: true } : {}),
        ...(includePlan ? { pendingMembershipPlan: true } : {}),
      },
    });

    if (!member) {
      throw new NotFoundException('Üye bulunamadı');
    }

    return this.enrichMemberWithComputedFields(member);
  }

  /**
   * Update an existing member
   * Business rules:
   * - Validates member belongs to tenant
   * - Validates branch belongs to tenant if branchId is being updated
   * - Enforces phone uniqueness within tenant (excluding current member)
   * - Validates membershipEndAt is after membershipStartAt if dates are being updated
   * - Rejects membershipPlanId and membershipPriceAtPurchase updates (v1 restriction - enforced at DTO level)
   * - If membershipStartDate changes: auto-recalculates membershipEndDate from plan duration
   * - If member is PAUSED: membershipStartDate changes are rejected (freeze logic depends on stable dates)
   * - If pending plan change exists and start date changes: pending dates are recalculated for consistency
   */

  async update(tenantId: string, id: string, dto: UpdateMemberDto) {
    // Get existing member and validate tenant isolation
    const existingMember = await this.findOne(tenantId, id);

    // If branchId is being updated, validate new branch belongs to tenant
    if (dto.branchId && dto.branchId !== existingMember.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId },
      });

      if (!branch) {
        throw new NotFoundException('Şube bulunamadı');
      }
    }

    // If phone is being updated, normalize and check uniqueness within tenant (excluding current member)
    if (dto.phone && dto.phone !== existingMember.phone) {
      const phone = dto.phone.trim();
      const existingMemberWithPhone = await this.prisma.member.findFirst({
        where: {
          tenantId,
          phone,
          id: {
            not: id,
          },
        },
      });

      if (existingMemberWithPhone) {
        throw new ConflictException(
          'Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.',
        );
      }
    }

    // Determine if membershipStartDate is being changed
    const isStartDateChanging =
      (dto.membershipStartDate !== undefined ||
        dto.membershipStartAt !== undefined) &&
      new Date(dto.membershipStartDate || dto.membershipStartAt!).getTime() !==
        existingMember.membershipStartDate.getTime();

    // EDGE CASE: Block start date changes for PAUSED members
    // Freeze/resume logic (calculateRemainingDays) depends on stable membershipStartDate.
    // Changing it while paused would corrupt the remaining-days calculation.
    if (isStartDateChanging && existingMember.status === 'PAUSED') {
      throw new BadRequestException(
        'Dondurulmuş üyelerin başlangıç tarihi değiştirilemez. Önce üyeliği devam ettirin.',
      );
    }

    // Resolve the new membershipStartDate value
    const membershipStartDate =
      dto.membershipStartDate || dto.membershipStartAt
        ? new Date(dto.membershipStartDate || dto.membershipStartAt!)
        : existingMember.membershipStartDate;

    // If start date is changing, auto-recalculate end date from the member's current plan
    let membershipEndDate: Date;

    if (isStartDateChanging) {
      // Fetch the member's current plan to get duration info
      const plan = await this.membershipPlansService.getPlanByIdForTenant(
        tenantId,
        existingMember.membershipPlanId,
      );

      membershipEndDate = calculateMembershipEndDate(
        membershipStartDate,
        plan.durationType,
        plan.durationValue,
      );

      this.logger.log(
        `Member ${id}: membershipStartDate changed → recalculated membershipEndDate ` +
          `(plan: ${plan.name}, ${plan.durationType}/${plan.durationValue}, ` +
          `new start: ${membershipStartDate.toISOString()}, new end: ${membershipEndDate.toISOString()})`,
      );
    } else {
      // Start date not changing — use explicitly provided endDate or keep existing
      membershipEndDate = dto.membershipEndDate
        ? new Date(dto.membershipEndDate)
        : existingMember.membershipEndDate;
    }

    if (membershipEndDate <= membershipStartDate) {
      throw new BadRequestException(
        'Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır',
      );
    }

    // Build update data

    const updateData: any = {};

    if (dto.branchId !== undefined) updateData.branchId = dto.branchId;

    if (dto.firstName !== undefined)
      updateData.firstName = dto.firstName.trim();

    if (dto.lastName !== undefined) updateData.lastName = dto.lastName.trim();

    if (dto.phone !== undefined) updateData.phone = dto.phone.trim();

    if (dto.email !== undefined)
      updateData.email = dto.email ? dto.email.trim() : null;

    if (dto.gender !== undefined) updateData.gender = dto.gender;

    if (dto.dateOfBirth !== undefined)
      updateData.dateOfBirth = dto.dateOfBirth
        ? new Date(dto.dateOfBirth)
        : null;

    if (dto.photoUrl !== undefined)
      updateData.photoUrl = dto.photoUrl ? dto.photoUrl : null;

    // Note: membershipPlanId changes are not allowed in v1 (spec restriction)
    // membershipType is deprecated and will be removed in Phase 3

    if (isStartDateChanging) {
      // Start date changed → write both start and recalculated end date
      updateData.membershipStartDate = membershipStartDate;
      updateData.membershipEndDate = membershipEndDate;
    } else {
      // Start date not changed — handle each date field independently (legacy behavior)
      if (
        dto.membershipStartDate !== undefined ||
        dto.membershipStartAt !== undefined
      )
        updateData.membershipStartDate = membershipStartDate;

      if (
        dto.membershipEndDate !== undefined ||
        dto.membershipEndAt !== undefined
      )
        updateData.membershipEndDate = membershipEndDate;
    }

    // EDGE CASE: If start date changed and a pending plan change exists,
    // recalculate pending dates to stay consistent (pendingStart = newEndDate + 1 day)
    if (isStartDateChanging && existingMember.pendingMembershipPlanId) {
      const pendingPlan =
        await this.membershipPlansService.getPlanByIdForTenant(
          tenantId,
          existingMember.pendingMembershipPlanId,
        );

      const newPendingStartDate = new Date(membershipEndDate);
      newPendingStartDate.setUTCDate(newPendingStartDate.getUTCDate() + 1);
      newPendingStartDate.setUTCHours(0, 0, 0, 0);

      const newPendingEndDate = calculateMembershipEndDate(
        newPendingStartDate,
        pendingPlan.durationType,
        pendingPlan.durationValue,
      );

      updateData.pendingMembershipStartDate = newPendingStartDate;
      updateData.pendingMembershipEndDate = newPendingEndDate;

      this.logger.log(
        `Member ${id}: pending plan change dates recalculated ` +
          `(pendingStart: ${newPendingStartDate.toISOString()}, pendingEnd: ${newPendingEndDate.toISOString()})`,
      );
    }

    if (dto.notes !== undefined)
      updateData.notes = dto.notes ? dto.notes.trim() : null;

    // Extended profile fields
    if (dto.address !== undefined)
      updateData.address = dto.address ? dto.address.trim() : null;

    if (dto.district !== undefined)
      updateData.district = dto.district ? dto.district.trim() : null;

    if (dto.nationalId !== undefined)
      updateData.nationalId = dto.nationalId ? dto.nationalId.trim() : null;

    if (dto.maritalStatus !== undefined)
      updateData.maritalStatus = dto.maritalStatus;

    if (dto.occupation !== undefined)
      updateData.occupation = dto.occupation ? dto.occupation.trim() : null;

    if (dto.industry !== undefined)
      updateData.industry = dto.industry ? dto.industry.trim() : null;

    if (dto.bloodType !== undefined) updateData.bloodType = dto.bloodType;

    if (dto.emergencyContactName !== undefined)
      updateData.emergencyContactName = dto.emergencyContactName
        ? dto.emergencyContactName.trim()
        : null;

    if (dto.emergencyContactPhone !== undefined)
      updateData.emergencyContactPhone = dto.emergencyContactPhone
        ? dto.emergencyContactPhone.trim()
        : null;

    try {
      const updatedMember = await this.prisma.member.update({
        where: { id_tenantId: { id, tenantId } },
        data: updateData,
      });

      return this.enrichMemberWithComputedFields(updatedMember);
    } catch (error) {
      // P2025: Record not found (wrong tenant or non-existent)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Üye bulunamadı');
      }
      // Handle unique constraint violation from database
      // P2002: "Unique constraint failed on the {constraint}"
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        // Check if target contains 'phone' (target can be array or string)
        const isPhoneConstraint =
          (Array.isArray(target) && target.includes('phone')) ||
          (typeof target === 'string' && target.includes('phone'));

        if (isPhoneConstraint) {
          throw new ConflictException(
            'Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.',
          );
        }
      }
      throw error;
    }
  }

  /**
   * Change member status with transition validation
   * Business rules:
   * - Validates status transition is allowed
   * - Cannot transition from ARCHIVED (terminal status)
   * - Cannot set ARCHIVED via this endpoint (use archive() instead)
   * - T055: When status changes ACTIVE → PAUSED: sets pausedAt = NOW(), don't modify membershipEndAt
   * - T056: When status changes PAUSED → ACTIVE: requires pausedAt, extends membershipEndAt by pause duration,
   *   sets resumedAt = NOW(), clears pausedAt (set null)
   * - When status changes from PAUSED to INACTIVE: clears pausedAt and resumedAt
   */

  async changeStatus(tenantId: string, id: string, dto: ChangeMemberStatusDto) {
    const member = await this.findOne(tenantId, id);

    // Cannot transition from ARCHIVED (terminal status)
    if (member.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Arşivlenmiş üyelerin durumu değiştirilemez',
      );
    }

    // Cannot set ARCHIVED via this endpoint (use archive() instead)
    if (dto.status === 'ARCHIVED') {
      throw new BadRequestException(
        "Üyeyi arşivlemek için arşivleme endpoint'ini kullanın",
      );
    }

    // Validate status transition using state machine
    // Defines allowed transitions: ACTIVE can go to PAUSED or INACTIVE,
    // PAUSED can resume to ACTIVE or become INACTIVE, etc.
    const validTransitions: Record<MemberStatus, MemberStatus[]> = {
      ACTIVE: ['PAUSED', 'INACTIVE'],
      PAUSED: ['ACTIVE', 'INACTIVE'],
      INACTIVE: ['ACTIVE'],
      ARCHIVED: [], // Terminal status, no transitions allowed
    };

    const allowedStatuses = validTransitions[member.status];
    if (!allowedStatuses.includes(dto.status)) {
      throw new BadRequestException(
        `Geçersiz durum geçişi: ${member.status} → ${dto.status}`,
      );
    }

    // Build update data with timestamp handling for freeze/resume logic
    const now = new Date();

    const updateData: any = {
      status: dto.status,
    };

    // T055: Handle ACTIVE → PAUSED transition (freeze membership)
    // When pausing: set pausedAt timestamp, don't modify membershipEndDate,
    // clear resumedAt for clean state
    if (member.status === 'ACTIVE' && dto.status === 'PAUSED') {
      updateData.pausedAt = now;
      updateData.resumedAt = null; // Clear resumedAt for clean state
      // Don't modify membershipEndDate - it will be extended when resuming
    }
    // T056: Handle PAUSED → ACTIVE transition (resume membership)
    // When resuming: require pausedAt exists, calculate pause duration,
    // extend membershipEndDate by pause duration, set resumedAt, clear pausedAt
    else if (member.status === 'PAUSED' && dto.status === 'ACTIVE') {
      // Require pausedAt; otherwise throw BadRequestException in Turkish
      if (!member.pausedAt) {
        throw new BadRequestException(
          'Üye durumu PAUSED ancak pausedAt değeri bulunamadı. Geçersiz durum.',
        );
      }

      // Calculate pause duration in milliseconds
      const pauseDurationMs = now.getTime() - member.pausedAt.getTime();

      // Extend membershipEndDate by pause duration to compensate for frozen time
      // This ensures remaining days calculation works correctly after resume
      const currentMembershipEndDate = new Date(member.membershipEndDate);
      updateData.membershipEndDate = new Date(
        currentMembershipEndDate.getTime() + pauseDurationMs,
      );

      // Set resumedAt timestamp and clear pausedAt for clean state management
      updateData.resumedAt = now;
      updateData.pausedAt = null;
    }
    // Handle transition from PAUSED to INACTIVE: clear both timestamps
    // When going from PAUSED to INACTIVE, we don't extend membership (different business rule)
    else if (member.status === 'PAUSED' && dto.status === 'INACTIVE') {
      updateData.pausedAt = null;
      updateData.resumedAt = null;
    }
    // For other transitions (ACTIVE → INACTIVE, INACTIVE → ACTIVE),
    // don't modify pausedAt/resumedAt (they remain as historical data)

    try {
      const updatedMember = await this.prisma.member.update({
        where: { id_tenantId: { id, tenantId } },
        data: updateData,
      });

      return this.enrichMemberWithComputedFields(updatedMember);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Üye bulunamadı');
      }
      throw error;
    }
  }

  /**
   * Archive a member (set status to ARCHIVED)
   * Business rules:
   * - Sets status to ARCHIVED
   * - Archiving is a terminal action - archived members cannot be reactivated via status endpoint
   * - Clears pausedAt and resumedAt timestamps when archiving
   */
  async archive(tenantId: string, id: string) {
    const member = await this.findOne(tenantId, id);

    // If already archived, return as-is (already enriched)
    if (member.status === 'ARCHIVED') {
      return member;
    }

    try {
      const archivedMember = await this.prisma.member.update({
        where: { id_tenantId: { id, tenantId } },
        data: {
          status: 'ARCHIVED',
          pausedAt: null,
          resumedAt: null,
        },
      });

      return this.enrichMemberWithComputedFields(archivedMember);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Üye bulunamadı');
      }
      throw error;
    }
  }

  /**
   * Calculate remaining membership days
   *
   * This is a computed value, not stored in the database. The calculation accounts for
   * paused periods where membership time is frozen.
   *
   * Business rules:
   * - Formula: (membershipEndDate - membershipStartDate) - (days elapsed while ACTIVE)
   * - Days while PAUSED don't count against remaining time
   * - Uses pausedAt and resumedAt timestamps to track pause periods
   * - If membershipEndDate is in the past, remaining days may be negative
   *
   * Freeze logic (T057):
   * - If status === PAUSED and pausedAt exists, remaining days stay constant during freeze
   * - After resume, membershipEndDate is extended by pause duration, so normal calculation works
   *
   * @param member - Member object with membership dates and status timestamps
   * @returns Number of remaining days (rounded to nearest integer)
   */
  calculateRemainingDays(member: {
    membershipStartDate: Date;
    membershipEndDate: Date;
    status: MemberStatus;
    pausedAt: Date | null;
    resumedAt: Date | null;
  }): number {
    // Safety check: invalid date range
    if (member.membershipEndDate <= member.membershipStartDate) {
      return 0;
    }

    const now = new Date();
    // Calculate total membership duration in days
    const totalDays =
      (member.membershipEndDate.getTime() -
        member.membershipStartDate.getTime()) /
      (1000 * 60 * 60 * 24);

    // If membership hasn't started yet, return full duration
    if (now < member.membershipStartDate) {
      return Math.round(totalDays);
    }

    // Calculate days elapsed while ACTIVE (excluding paused periods)
    // This is the key logic: paused days don't count against remaining time
    let activeDaysElapsed = 0;

    // Case 1: Currently PAUSED (freeze is active)
    // T057: Remaining days stay constant during freeze - only count active days up to pause point
    if (member.status === 'PAUSED' && member.pausedAt) {
      // Active days = time from membership start to when paused
      // Remaining days stay constant during freeze (don't decrease)
      activeDaysElapsed =
        (member.pausedAt.getTime() - member.membershipStartDate.getTime()) /
        (1000 * 60 * 60 * 24);
    }
    // Case 2: Previously paused and resumed (both timestamps exist - historical data)
    // This handles legacy data where pausedAt wasn't cleared on resume
    else if (member.pausedAt && member.resumedAt) {
      // Calculate active days in two parts:
      // 1. Active days before pause: pausedAt - start
      // 2. Active days after resume: now - resumedAt
      // The pause period (pausedAt to resumedAt) is excluded
      const activeDaysBeforePause =
        (member.pausedAt.getTime() - member.membershipStartDate.getTime()) /
        (1000 * 60 * 60 * 24);

      // Only count active days after resume if now is after resumedAt
      const activeDaysAfterResume =
        now > member.resumedAt
          ? (now.getTime() - member.resumedAt.getTime()) / (1000 * 60 * 60 * 24)
          : 0;

      activeDaysElapsed = activeDaysBeforePause + activeDaysAfterResume;
    }
    // Case 3: After resume (pausedAt cleared, resumedAt exists, membershipEndDate extended)
    // Since membershipEndDate was extended by pause duration in changeStatus(),
    // we can calculate normally - the extension compensates for the pause period
    else if (!member.pausedAt && member.resumedAt) {
      // Normal calculation: membershipEndDate was already extended, so just calculate elapsed time
      activeDaysElapsed =
        (now.getTime() - member.membershipStartDate.getTime()) /
        (1000 * 60 * 60 * 24);
    }
    // Case 4: No pause history (ACTIVE, INACTIVE, ARCHIVED without pause)
    else {
      // No pause period, so active days = total elapsed from start to now
      activeDaysElapsed =
        (now.getTime() - member.membershipStartDate.getTime()) /
        (1000 * 60 * 60 * 24);
    }

    // Remaining days = total membership days - active days elapsed
    // Note: paused days are excluded from activeDaysElapsed, so they don't reduce remaining time
    const remainingDays = totalDays - activeDaysElapsed;

    return Math.round(remainingDays);
  }

  /**
   * Schedule a membership plan change
   * Business rules:
   * - Validates member belongs to tenant
   * - Validates plan exists, is ACTIVE, and belongs to tenant
   * - Validates branch constraints (if plan is branch-scoped, must match member's branch)
   * - Computes start date: (member.membershipEndDate + 1 day) as date-only
   * - Computes end date from plan duration
   * - Snapshots price at schedule time
   * - Overwrites existing pending change if present
   * - No-op if new plan equals current plan and no pending exists
   * - Creates history record with changeType="SCHEDULED"
   */
  async schedulePlanChange(
    tenantId: string,
    memberId: string,
    dto: SchedulePlanChangeDto,
    userId: string,
  ) {
    // Get member and validate tenant isolation
    const member = await this.findOne(tenantId, memberId);

    // Fetch and validate plan
    const plan = await this.membershipPlansService.getPlanByIdForTenant(
      tenantId,
      dto.membershipPlanId,
    );

    // Validate plan is ACTIVE
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException('Bu üyelik planı aktif değil.');
    }

    // Validate branch constraints (if plan is branch-scoped, must match member's branch)
    if (plan.scope === 'BRANCH' && plan.branchId !== member.branchId) {
      throw new BadRequestException('Seçilen plan bu şube için geçerli değil.');
    }

    // No-op: if new plan equals current plan and no pending exists
    if (
      dto.membershipPlanId === member.membershipPlanId &&
      !member.pendingMembershipPlanId
    ) {
      return {
        ...this.enrichMemberWithComputedFields(member),
        message: 'Zaten aktif olan plan seçildi. Değişiklik yapılmadı.',
      };
    }

    // Compute start date: (member.membershipEndDate + 1 day) as date-only
    // If member has no membershipEndDate (edge case), startDate = today
    // Use UTC normalization to avoid timezone issues
    const currentEndDate = member.membershipEndDate || new Date();
    const pendingStartDate = new Date(currentEndDate);
    pendingStartDate.setUTCDate(pendingStartDate.getUTCDate() + 1);
    // Set to start of day (date-only) in UTC to avoid timezone issues
    pendingStartDate.setUTCHours(0, 0, 0, 0);

    // Compute end date from plan duration
    const pendingEndDate = calculateMembershipEndDate(
      pendingStartDate,
      plan.durationType,
      plan.durationValue,
    );

    // Snapshot price at schedule time
    const pendingPriceAtPurchase = plan.price.toNumber();

    const now = new Date();

    // Update member with pending plan change (overwrites existing if present)
    // Also create history record in the same transaction
    const updatedMember = await this.prisma.$transaction(async (tx) => {
      // Update member with pending fields (tenant-scoped)
      const updated = await tx.member.update({
        where: { id_tenantId: { id: memberId, tenantId } },
        data: {
          pendingMembershipPlanId: dto.membershipPlanId,
          pendingMembershipStartDate: pendingStartDate,
          pendingMembershipEndDate: pendingEndDate,
          pendingMembershipPriceAtPurchase: pendingPriceAtPurchase,
          pendingMembershipScheduledAt: now,
          pendingMembershipScheduledByUserId: userId,
        },
      });

      // Create history record with changeType="SCHEDULED"
      await tx.memberPlanChangeHistory.create({
        data: {
          tenantId,
          memberId,
          oldPlanId: member.membershipPlanId,
          newPlanId: dto.membershipPlanId,
          oldStartDate: member.membershipStartDate,
          oldEndDate: member.membershipEndDate,
          newStartDate: pendingStartDate,
          newEndDate: pendingEndDate,
          oldPriceAtPurchase: member.membershipPriceAtPurchase
            ? member.membershipPriceAtPurchase.toNumber()
            : null,
          newPriceAtPurchase: pendingPriceAtPurchase,
          changeType: 'SCHEDULED',
          scheduledAt: now,
          changedByUserId: userId,
        },
      });

      return updated;
    });

    return this.enrichMemberWithComputedFields(updatedMember);
  }

  /**
   * Cancel pending plan change
   * Business rules:
   * - Validates member belongs to tenant
   * - If pending exists, clears all pending fields and creates history record (CANCELLED)
   * - If no pending exists, returns 200 no-op
   */
  async cancelPendingPlanChange(tenantId: string, memberId: string) {
    // Get member and validate tenant isolation
    const member = await this.findOne(tenantId, memberId);

    // No-op if no pending change exists
    if (!member.pendingMembershipPlanId) {
      return this.enrichMemberWithComputedFields(member);
    }

    // Clear pending fields and create history record
    const updatedMember = await this.prisma.$transaction(async (tx) => {
      // Clear pending fields (tenant-scoped)
      const updated = await tx.member.update({
        where: { id_tenantId: { id: memberId, tenantId } },
        data: {
          pendingMembershipPlanId: null,
          pendingMembershipStartDate: null,
          pendingMembershipEndDate: null,
          pendingMembershipPriceAtPurchase: null,
          pendingMembershipScheduledAt: null,
          pendingMembershipScheduledByUserId: null,
        },
      });

      // Create history record with changeType="CANCELLED"
      await tx.memberPlanChangeHistory.create({
        data: {
          tenantId,
          memberId,
          oldPlanId: member.membershipPlanId,
          newPlanId: member.pendingMembershipPlanId,
          oldStartDate: member.membershipStartDate,
          oldEndDate: member.membershipEndDate,
          newStartDate: member.pendingMembershipStartDate,
          newEndDate: member.pendingMembershipEndDate,
          oldPriceAtPurchase: member.membershipPriceAtPurchase
            ? member.membershipPriceAtPurchase.toNumber()
            : null,
          newPriceAtPurchase: member.pendingMembershipPriceAtPurchase
            ? member.pendingMembershipPriceAtPurchase.toNumber()
            : null,
          changeType: 'CANCELLED',
          scheduledAt: member.pendingMembershipScheduledAt,
          changedByUserId: member.pendingMembershipScheduledByUserId,
        },
      });

      return updated;
    });

    return this.enrichMemberWithComputedFields(updatedMember);
  }

  /**
   * Renew membership for a member
   *
   * Business rules:
   * - ARCHIVED members cannot renew
   * - PAUSED members cannot renew (must resume first)
   * - If membershipPlanId provided in DTO, use that plan; otherwise use member's current plan
   * - Plan must be ACTIVE and belong to tenant
   * - Branch-scoped plans must match member's branch
   * - Expired member: newStart = now, newEnd = now + plan duration
   * - Active member (early renewal): keep current start, newEnd = currentEnd + plan duration
   * - Optionally creates payment record in the same transaction
   * - Creates history record with changeType="RENEWAL"
   * - Sets member status to ACTIVE if not already
   * - Clears pending plan change if present (renewal supersedes scheduled changes)
   */
  async renewMembership(
    tenantId: string,
    memberId: string,
    dto: RenewMembershipDto,
    userId: string,
  ) {
    // A) Pre-transaction validation: validate payment fields early to fail fast
    if (dto.createPayment) {
      if (!dto.paymentMethod) {
        throw new BadRequestException(
          'Ödeme oluşturmak için ödeme yöntemi zorunludur',
        );
      }

      if (dto.paymentAmount !== undefined) {
        if (dto.paymentAmount < 0.01 || dto.paymentAmount > 999999.99) {
          throw new BadRequestException(
            'Ödeme tutarı 0.01 ile 999999.99 arasında olmalıdır',
          );
        }
        const decimalParts = dto.paymentAmount.toString().split('.');
        if (decimalParts[1] && decimalParts[1].length > 2) {
          throw new BadRequestException(
            'Ödeme tutarı en fazla 2 ondalık basamak içerebilir',
          );
        }
      }

      if (dto.paidOn) {
        const paidOnDate = new Date(dto.paidOn);
        paidOnDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (paidOnDate > today) {
          throw new BadRequestException('Ödeme tarihi gelecekte olamaz');
        }
      }
    }

    // B) Plan validation (outside tx — plan data is immutable during renewal)
    const planId = dto.membershipPlanId;
    let plan: Awaited<
      ReturnType<typeof this.membershipPlansService.getPlanByIdForTenant>
    > | null = null;
    if (planId) {
      plan = await this.membershipPlansService.getPlanByIdForTenant(
        tenantId,
        planId,
      );
      if (plan.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Arşivlenmiş planlar üyelik yenilemesi için kullanılamaz',
        );
      }
    }

    // C) Execute all member-dependent logic inside a transaction with row-level locking.
    // PostgreSQL READ COMMITTED + plain SELECT allows two concurrent transactions to
    // read the same stale membershipEndDate. Since we compute newEndDate as an absolute
    // value (currentEndDate + duration), the second tx would overwrite the first's result.
    // SELECT ... FOR UPDATE acquires an exclusive row lock BEFORE reading, so the second
    // tx blocks here until the first commits, then reads the freshly committed endDate.
    const result = await this.prisma.$transaction(async (tx) => {
      // Acquire exclusive row lock — concurrent renewals for the same member will
      // serialize at this point. The second transaction blocks until the first commits,
      // then reads the updated (committed) row data via the subsequent findFirst.
      await tx.$queryRaw`SELECT 1 FROM "Member" WHERE "id" = ${memberId} AND "tenantId" = ${tenantId} FOR UPDATE`;

      // Read member with full Prisma types (row is already locked by us)
      const member = await tx.member.findFirst({
        where: { id: memberId, tenantId },
        include: { branch: true },
      });

      if (!member) {
        throw new NotFoundException('Üye bulunamadı');
      }

      // Archived members cannot renew
      if (member.status === 'ARCHIVED') {
        throw new BadRequestException(
          'Arşivlenmiş üyelerin üyeliği yenilenemez',
        );
      }

      // Paused members must resume first
      if (member.status === 'PAUSED') {
        throw new BadRequestException(
          'Dondurulmuş üyelerin üyeliği yenilenemez. Önce üyeliği devam ettirin.',
        );
      }

      // Determine which plan to use
      const effectivePlanId = planId || member.membershipPlanId;

      if (!effectivePlanId) {
        throw new BadRequestException(
          'Üyelik planı belirtilmedi ve üyenin mevcut planı bulunamadı',
        );
      }

      // If no plan was pre-validated (using member's current plan), fetch it now
      if (!plan) {
        plan = await this.membershipPlansService.getPlanByIdForTenant(
          tenantId,
          effectivePlanId,
        );
        if (plan.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Arşivlenmiş planlar üyelik yenilemesi için kullanılamaz',
          );
        }
      }

      // Validate branch constraints
      if (plan.scope === 'BRANCH' && plan.branchId !== member.branchId) {
        throw new BadRequestException(
          'Seçilen plan bu şube için geçerli değil',
        );
      }

      // Calculate new membership dates using fresh member data
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const currentEndDate = new Date(member.membershipEndDate);
      currentEndDate.setHours(0, 0, 0, 0);

      const isExpired = currentEndDate < now;

      let newStartDate: Date;
      let newEndDate: Date;

      if (isExpired) {
        newStartDate = now;
        newEndDate = calculateMembershipEndDate(
          now,
          plan.durationType,
          plan.durationValue,
        );
      } else {
        newStartDate = new Date(member.membershipStartDate);
        newEndDate = calculateMembershipEndDate(
          currentEndDate,
          plan.durationType,
          plan.durationValue,
        );
      }

      // Prepare member update data
      const membershipPriceAtPurchase = plan.price.toNumber();

      const memberUpdateData: any = {
        membershipPlanId: effectivePlanId,
        membershipStartDate: newStartDate,
        membershipEndDate: newEndDate,
        membershipPriceAtPurchase: membershipPriceAtPurchase,
      };

      if (member.status !== 'ACTIVE') {
        memberUpdateData.status = 'ACTIVE';
      }

      if (member.pendingMembershipPlanId) {
        memberUpdateData.pendingMembershipPlanId = null;
        memberUpdateData.pendingMembershipStartDate = null;
        memberUpdateData.pendingMembershipEndDate = null;
        memberUpdateData.pendingMembershipPriceAtPurchase = null;
        memberUpdateData.pendingMembershipScheduledAt = null;
        memberUpdateData.pendingMembershipScheduledByUserId = null;
      }

      if (member.pausedAt || member.resumedAt) {
        memberUpdateData.pausedAt = null;
        memberUpdateData.resumedAt = null;
      }

      // Update member record
      const updatedMember = await tx.member.update({
        where: { id_tenantId: { id: memberId, tenantId } },
        data: memberUpdateData,
      });

      // Create history record
      await tx.memberPlanChangeHistory.create({
        data: {
          tenantId,
          memberId,
          oldPlanId: member.membershipPlanId,
          newPlanId: effectivePlanId,
          oldStartDate: member.membershipStartDate,
          oldEndDate: member.membershipEndDate,
          newStartDate,
          newEndDate,
          oldPriceAtPurchase: member.membershipPriceAtPurchase
            ? member.membershipPriceAtPurchase.toNumber()
            : null,
          newPriceAtPurchase: membershipPriceAtPurchase,
          changeType: 'RENEWAL',
          appliedAt: new Date(),
          changedByUserId: userId,
        },
      });

      // Optionally create payment record
      let payment: {
        id: string;
        amount: Decimal;
        paidOn: Date;
        paymentMethod: string;
      } | null = null;
      if (dto.createPayment) {
        const paymentAmount = dto.paymentAmount ?? membershipPriceAtPurchase;
        const paidOnDate = dto.paidOn ? new Date(dto.paidOn) : new Date();
        paidOnDate.setUTCHours(0, 0, 0, 0);

        payment = await tx.payment.create({
          data: {
            tenantId,
            branchId: member.branchId,
            memberId,
            amount: new Decimal(paymentAmount),
            paidOn: paidOnDate,
            paymentMethod: dto.paymentMethod!,
            note: dto.note || null,
            createdBy: userId,
          },
          select: {
            id: true,
            amount: true,
            paidOn: true,
            paymentMethod: true,
          },
        });
      }

      return {
        updatedMember,
        payment,
        member,
        effectivePlanId,
        isExpired,
        newStartDate,
        newEndDate,
        membershipPriceAtPurchase,
      };
    });

    // Structured logging
    this.logger.log(
      JSON.stringify({
        event: 'membership.renewed',
        memberId,
        tenantId,
        planId: result.effectivePlanId,
        isExpired: result.isExpired,
        oldStartDate: result.member.membershipStartDate,
        oldEndDate: result.member.membershipEndDate,
        newStartDate: result.newStartDate.toISOString(),
        newEndDate: result.newEndDate.toISOString(),
        paymentCreated: !!result.payment,
        changedByUserId: userId,
      }),
    );

    const enrichedMember = this.enrichMemberWithComputedFields(
      result.updatedMember,
    );

    return {
      ...enrichedMember,
      renewal: {
        previousStartDate: result.member.membershipStartDate,
        previousEndDate: result.member.membershipEndDate,
        newStartDate: result.newStartDate,
        newEndDate: result.newEndDate,
        planId: result.effectivePlanId,
        planName: plan!.name,
        wasExpired: result.isExpired,
      },
      ...(result.payment
        ? {
            payment: {
              id: result.payment.id,
              amount: result.payment.amount.toString(),
              paidOn: result.payment.paidOn,
              paymentMethod: result.payment.paymentMethod,
            },
          }
        : {}),
    };
  }
}
