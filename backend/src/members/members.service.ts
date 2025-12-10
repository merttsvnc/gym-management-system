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

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new member
   * Business rules:
   * - Validates branch belongs to tenant
   * - Enforces phone uniqueness within tenant
   * - Sets default values for membershipType, membershipStartAt, membershipEndAt
   */
  async create(tenantId: string, dto: CreateMemberDto) {
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

    // Set default values
    const now = new Date();
    const membershipStartAt = dto.membershipStartAt
      ? new Date(dto.membershipStartAt)
      : now;
    const membershipEndAt = dto.membershipEndAt
      ? new Date(dto.membershipEndAt)
      : new Date(membershipStartAt.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from start
    const membershipType = dto.membershipType || 'Basic';

    // Validate membershipEndAt is after membershipStartAt
    if (membershipEndAt <= membershipStartAt) {
      throw new BadRequestException(
        'Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır',
      );
    }

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
        membershipType,
        membershipStartAt,
        membershipEndAt,
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
   */
  async findOne(tenantId: string, id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
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
    const membershipStartAt = dto.membershipStartAt
      ? new Date(dto.membershipStartAt)
      : existingMember.membershipStartAt;
    const membershipEndAt = dto.membershipEndAt
      ? new Date(dto.membershipEndAt)
      : existingMember.membershipEndAt;

    if (membershipEndAt <= membershipStartAt) {
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

    if (dto.membershipType !== undefined)
      updateData.membershipType = dto.membershipType;

    if (dto.membershipStartAt !== undefined)
      updateData.membershipStartAt = membershipStartAt;

    if (dto.membershipEndAt !== undefined)
      updateData.membershipEndAt = membershipEndAt;

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

    // Validate status transition
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

    // Build update data with timestamp handling
    const now = new Date();

    const updateData: any = {
      status: dto.status,
    };

    // T055: Handle ACTIVE → PAUSED transition
    // Set pausedAt = new Date(), don't modify membershipEndAt, clear resumedAt
    if (member.status === 'ACTIVE' && dto.status === 'PAUSED') {
      updateData.pausedAt = now;

      updateData.resumedAt = null; // Clear resumedAt for clean state
      // Don't modify membershipEndAt
    }
    // T056: Handle PAUSED → ACTIVE transition
    // Require pausedAt, calculate pause duration, extend membershipEndAt, set resumedAt, clear pausedAt
    else if (member.status === 'PAUSED' && dto.status === 'ACTIVE') {
      // Require pausedAt; otherwise throw BadRequestException in Turkish
      if (!member.pausedAt) {
        throw new BadRequestException(
          'Üye durumu PAUSED ancak pausedAt değeri bulunamadı. Geçersiz durum.',
        );
      }

      // Calculate pause duration in milliseconds
      const pauseDurationMs = now.getTime() - member.pausedAt.getTime();

      // Extend membershipEndAt by pause duration
      const currentMembershipEndAt = new Date(member.membershipEndAt);

      updateData.membershipEndAt = new Date(
        currentMembershipEndAt.getTime() + pauseDurationMs,
      );

      // Set resumedAt = now

      updateData.resumedAt = now;

      // Clear pausedAt (set null) for clean state management

      updateData.pausedAt = null;
    }
    // Handle transition from PAUSED to INACTIVE: clear both timestamps
    else if (member.status === 'PAUSED' && dto.status === 'INACTIVE') {
      updateData.pausedAt = null;

      updateData.resumedAt = null;
    }
    // For other transitions, don't modify pausedAt/resumedAt
    // (they remain as historical data)

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
   * Business rules:
   * - Computed value, not stored in database
   * - Formula: (membershipEndAt - membershipStartAt) - (days elapsed while ACTIVE)
   * - Days while PAUSED don't count against remaining time
   * - Uses pausedAt and resumedAt timestamps to track pause periods
   * - If membershipEndAt is in the past, remaining days may be negative
   *
   * T057: If status === PAUSED and pausedAt exists, remaining days stay constant during freeze.
   * After resume, the extended membershipEndAt makes normal remaining-day logic work.
   */
  calculateRemainingDays(member: {
    membershipStartAt: Date;
    membershipEndAt: Date;
    status: MemberStatus;
    pausedAt: Date | null;
    resumedAt: Date | null;
  }): number {
    // Safety check: invalid dates
    if (member.membershipEndAt <= member.membershipStartAt) {
      return 0;
    }

    const now = new Date();
    const totalDays =
      (member.membershipEndAt.getTime() - member.membershipStartAt.getTime()) /
      (1000 * 60 * 60 * 24);

    // If membership hasn't started yet, return full duration
    if (now < member.membershipStartAt) {
      return Math.round(totalDays);
    }

    // Calculate days elapsed while ACTIVE (excluding paused periods)
    let activeDaysElapsed = 0;

    // T057: If currently PAUSED and pausedAt exists, remaining days stay constant
    // Calculate active days only up to pausedAt (freeze duration doesn't count)
    if (member.status === 'PAUSED' && member.pausedAt) {
      // Active days elapsed = time from start to when paused
      // Remaining days stay constant during freeze (don't decrease)
      activeDaysElapsed =
        (member.pausedAt.getTime() - member.membershipStartAt.getTime()) /
        (1000 * 60 * 60 * 24);
    }
    // If was previously paused and resumed (both timestamps exist - historical data)
    // This case handles members who were paused/resumed before the new logic
    else if (member.pausedAt && member.resumedAt) {
      // Calculate active days in two parts:
      // 1. Active days before pause: pausedAt - start
      // 2. Active days after resume: now - resumedAt
      const activeDaysBeforePause =
        (member.pausedAt.getTime() - member.membershipStartAt.getTime()) /
        (1000 * 60 * 60 * 24);

      // Only count active days after resume if now is after resumedAt
      const activeDaysAfterResume =
        now > member.resumedAt
          ? (now.getTime() - member.resumedAt.getTime()) / (1000 * 60 * 60 * 24)
          : 0;

      activeDaysElapsed = activeDaysBeforePause + activeDaysAfterResume;
    }
    // After resume (pausedAt cleared, resumedAt exists, membershipEndAt extended)
    // Since membershipEndAt was extended by pause duration, calculate normally
    // The extension compensates for the pause period
    else if (!member.pausedAt && member.resumedAt) {
      // Normal calculation: membershipEndAt was already extended, so just calculate elapsed time
      activeDaysElapsed =
        (now.getTime() - member.membershipStartAt.getTime()) /
        (1000 * 60 * 60 * 24);
    }
    // For other cases (no pause history, or INACTIVE/ARCHIVED)
    else {
      // No pause period, so active days = total elapsed from start to now
      activeDaysElapsed =
        (now.getTime() - member.membershipStartAt.getTime()) /
        (1000 * 60 * 60 * 24);
    }

    // Remaining days = total membership days - active days elapsed
    // Note: paused days are excluded from activeDaysElapsed, so they don't reduce remaining time
    const remainingDays = totalDays - activeDaysElapsed;

    return Math.round(remainingDays);
  }
}
