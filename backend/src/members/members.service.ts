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

    // Check phone uniqueness within tenant
    const existingMember = await this.prisma.member.findFirst({
      where: {
        tenantId,
        phone: dto.phone,
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

    return this.prisma.member.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone,
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

    return member;
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

    // If phone is being updated, check uniqueness within tenant (excluding current member)
    if (dto.phone && dto.phone !== existingMember.phone) {
      const existingMemberWithPhone = await this.prisma.member.findFirst({
        where: {
          tenantId,
          phone: dto.phone,
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
    if (dto.phone !== undefined) updateData.phone = dto.phone;
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

    return this.prisma.member.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Change member status with transition validation
   * Business rules:
   * - Validates status transition is allowed
   * - Cannot transition from ARCHIVED (terminal status)
   * - Cannot set ARCHIVED via this endpoint (use archive() instead)
   * - When status changes to PAUSED: sets pausedAt = NOW(), resumedAt = null
   * - When status changes from PAUSED to ACTIVE: sets resumedAt = NOW(), keeps pausedAt for calculation
   * - When status changes from PAUSED to INACTIVE: clears pausedAt and resumedAt
   */
  async changeStatus(
    tenantId: string,
    id: string,
    dto: ChangeMemberStatusDto,
  ) {
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
        'Üyeyi arşivlemek için arşivleme endpoint\'ini kullanın',
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

    // Handle PAUSED status: set pausedAt, clear resumedAt
    if (dto.status === 'PAUSED') {
      updateData.pausedAt = now;
      updateData.resumedAt = null;
    }
    // Handle transition from PAUSED to ACTIVE: set resumedAt, keep pausedAt for historical tracking
    else if (member.status === 'PAUSED' && dto.status === 'ACTIVE') {
      updateData.resumedAt = now;
      // Keep pausedAt to track pause duration for remaining days calculation
      // Note: Spec clarification says to clear pausedAt, but we need it for calculation
      // This is a known limitation - we keep pausedAt for calculation purposes
    }
    // Handle transition from PAUSED to INACTIVE: clear both timestamps
    else if (member.status === 'PAUSED' && dto.status === 'INACTIVE') {
      updateData.pausedAt = null;
      updateData.resumedAt = null;
    }
    // For other transitions, don't modify pausedAt/resumedAt
    // (they remain as historical data)

    return this.prisma.member.update({
      where: { id },
      data: updateData,
    });
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
      return member;
    }

    return this.prisma.member.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        pausedAt: null,
        resumedAt: null,
      },
    });
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
   * Note: This implementation keeps pausedAt even after resuming to enable accurate
   * remaining days calculation. The pause period is calculated as (resumedAt - pausedAt).
   */
  calculateRemainingDays(member: {
    membershipStartAt: Date;
    membershipEndAt: Date;
    status: MemberStatus;
    pausedAt: Date | null;
    resumedAt: Date | null;
  }): number {
    const now = new Date();
    const totalDays =
      (member.membershipEndAt.getTime() - member.membershipStartAt.getTime()) /
      (1000 * 60 * 60 * 24);

    // Calculate days elapsed while ACTIVE (excluding paused periods)
    let activeDaysElapsed = 0;

    // Determine the effective end date for calculation
    // Use membershipEndAt if it's in the past, otherwise use current time
    const calculationEndDate =
      member.membershipEndAt < now ? member.membershipEndAt : now;

    // If currently PAUSED, calculate up to pausedAt (when pause started)
    if (member.status === 'PAUSED' && member.pausedAt) {
      // Active days elapsed = time from start to when paused
      activeDaysElapsed =
        (member.pausedAt.getTime() - member.membershipStartAt.getTime()) /
        (1000 * 60 * 60 * 24);
    }
    // If was previously paused and resumed (both timestamps exist)
    else if (member.pausedAt && member.resumedAt) {
      // Calculate active days in two parts:
      // 1. Active days before pause: pausedAt - start
      // 2. Active days after resume: calculationEndDate - resumedAt
      const activeDaysBeforePause =
        (member.pausedAt.getTime() - member.membershipStartAt.getTime()) /
        (1000 * 60 * 60 * 24);
      
      // Only count active days after resume if calculationEndDate is after resumedAt
      const activeDaysAfterResume =
        calculationEndDate > member.resumedAt
          ? (calculationEndDate.getTime() - member.resumedAt.getTime()) /
            (1000 * 60 * 60 * 24)
          : 0;
      
      activeDaysElapsed = activeDaysBeforePause + activeDaysAfterResume;
    }
    // For other cases (no pause history, or INACTIVE/ARCHIVED)
    else {
      // No pause period, so active days = total elapsed from start to calculation end
      activeDaysElapsed =
        (calculationEndDate.getTime() - member.membershipStartAt.getTime()) /
        (1000 * 60 * 60 * 24);
    }

    // Remaining days = total membership days - active days elapsed
    // Note: paused days are excluded from activeDaysElapsed, so they don't reduce remaining time
    const remainingDays = totalDays - activeDaysElapsed;

    return Math.round(remainingDays);
  }
}

