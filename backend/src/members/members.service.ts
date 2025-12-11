/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberListQueryDto } from './dto/member-list-query.dto';
import { ChangeMemberStatusDto } from './dto/change-member-status.dto';
import { MemberStatus } from '@prisma/client';
import { MembershipPlansService } from '../membership-plans/membership-plans.service';
import { calculateMembershipEndDate } from '../membership-plans/utils/duration-calculator';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipPlansService: MembershipPlansService,
  ) {}

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
    // Validate branch belongs to tenant
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });

    if (!branch) {
      throw new NotFoundException('Şube bulunamadı');
    }

    if (branch.tenantId !== tenantId) {
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

    const member = await this.prisma.member.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email: dto.email?.trim(),
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        photoUrl: dto.photoUrl,
        membershipPlanId,
        membershipStartDate,
        membershipEndDate,
        membershipPriceAtPurchase,
        notes: dto.notes?.trim(),
        status: 'ACTIVE',
      },
    });

    return {
      ...member,
      remainingDays: this.calculateRemainingDays(member),
    };
  }

  /**
   * List members with filters, pagination, and search
   * Business rules:
   * - Filters by tenantId (tenant isolation)
   * - Supports filtering by branchId and status
   * - Supports search across firstName, lastName, and phone (substring, case-insensitive)
   * - Excludes archived members by default unless includeArchived is true
   */

  async findAll(tenantId: string, query: MemberListQueryDto) {
    const {
      page = 1,
      limit = 20,
      branchId,
      status,
      search,
      includeArchived = false,
    } = query;

    // Build where clause

    const where: any = {
      tenantId,
    };

    // Filter by branch
    if (branchId) {
      where.branchId = branchId;
    }

    // Filter by status
    if (status) {
      where.status = status;
    } else if (!includeArchived) {
      // Exclude archived members by default

      where.status = {
        not: 'ARCHIVED',
      };
    }

    // Search across firstName, lastName, and phone (substring, case-insensitive)
    if (search) {
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

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.member.count({ where }),
    ]);

    const dataWithRemainingDays = data.map((member) => ({
      ...member,
      remainingDays: this.calculateRemainingDays(member),
    }));

    return {
      data: dataWithRemainingDays,
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
   * - Optionally includes membership plan details if includePlan is true
   */
  async findOne(tenantId: string, id: string, includePlan = false) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: includePlan
        ? {
            membershipPlan: true,
          }
        : undefined,
    });

    if (!member) {
      throw new NotFoundException('Üye bulunamadı');
    }

    if (member.tenantId !== tenantId) {
      throw new NotFoundException('Üye bulunamadı');
    }

    return {
      ...member,
      remainingDays: this.calculateRemainingDays(member),
    };
  }

  /**
   * Update an existing member
   * Business rules:
   * - Validates member belongs to tenant
   * - Validates branch belongs to tenant if branchId is being updated
   * - Enforces phone uniqueness within tenant (excluding current member)
   * - Validates membershipEndAt is after membershipStartAt if dates are being updated
   */

  async update(tenantId: string, id: string, dto: UpdateMemberDto) {
    // Get existing member and validate tenant isolation
    const existingMember = await this.findOne(tenantId, id);

    // If branchId is being updated, validate new branch belongs to tenant
    if (dto.branchId && dto.branchId !== existingMember.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });

      if (!branch) {
        throw new NotFoundException('Şube bulunamadı');
      }

      if (branch.tenantId !== tenantId) {
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

    // Validate membership dates if being updated
    // Note: membershipPlanId changes are not allowed in v1 (spec restriction)
    const membershipStartDate = dto.membershipStartDate
      ? new Date(dto.membershipStartDate)
      : existingMember.membershipStartDate;
    const membershipEndDate = dto.membershipEndDate
      ? new Date(dto.membershipEndDate)
      : existingMember.membershipEndDate;

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

    if (dto.notes !== undefined)
      updateData.notes = dto.notes ? dto.notes.trim() : null;

    const updatedMember = await this.prisma.member.update({
      where: { id },
      data: updateData,
    });

    return {
      ...updatedMember,
      remainingDays: this.calculateRemainingDays(updatedMember),
    };
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

    const updatedMember = await this.prisma.member.update({
      where: { id },
      data: updateData,
    });

    return {
      ...updatedMember,
      remainingDays: this.calculateRemainingDays(updatedMember),
    };
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

    // If already archived, return as-is
    if (member.status === 'ARCHIVED') {
      return {
        ...member,
        remainingDays: this.calculateRemainingDays(member),
      };
    }

    const archivedMember = await this.prisma.member.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        pausedAt: null,
        resumedAt: null,
      },
    });

    return {
      ...archivedMember,
      remainingDays: this.calculateRemainingDays(archivedMember),
    };
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
}
