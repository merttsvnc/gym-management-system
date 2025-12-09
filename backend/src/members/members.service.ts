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
}

