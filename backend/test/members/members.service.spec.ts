/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MembershipPlansService } from '../../src/membership-plans/membership-plans.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MemberStatus, MemberGender } from '@prisma/client';

describe('MembersService', () => {
  let service: MembersService;

  // Mock PrismaService
  const mockPrismaService = {
    member: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    branch: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: MembershipPlansService,
          useValue: {
            getPlanByIdForTenant: jest.fn().mockResolvedValue({
              id: 'plan-1',
              name: 'Basic Plan',
              durationType: 'MONTHS',
              durationValue: 1,
              price: { toNumber: () => 100 },
              currency: 'USD',
              status: 'ACTIVE',
              tenantId: 'tenant-1',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =====================================================================
  // CREATE MEMBER TESTS
  // =====================================================================

  describe('create', () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';
    const createDto = {
      branchId,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      gender: MemberGender.MALE,
      dateOfBirth: '1990-01-01',
      membershipType: 'Premium',
      membershipPlanId: 'plan-1',
    };

    it('should create a member successfully with valid data', async () => {
      const mockBranch = { id: branchId, tenantId, name: 'Main Branch' };
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      const mockCreatedMember = {
        id: 'member-1',
        tenantId,
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        gender: MemberGender.MALE,
        dateOfBirth: new Date('1990-01-01'),
        photoUrl: null,
        membershipType: 'Premium',
        membershipPlanId: 'plan-1',
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        remainingDays: 365,
      } as any;

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.create.mockResolvedValue(mockCreatedMember);

      const result = await service.create(tenantId, createDto);

      expect(result).toHaveProperty('id', 'member-1');
      expect(result).toHaveProperty('firstName', 'John');
      expect(result).toHaveProperty('remainingDays');
      expect(mockPrismaService.branch.findUnique).toHaveBeenCalledWith({
        where: { id: branchId },
      });
      expect(mockPrismaService.member.findFirst).toHaveBeenCalledWith({
        where: { tenantId, phone: '+1234567890' },
      });
    });

    it('should throw NotFoundException if branch does not exist', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(null);

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Şube bulunamadı',
      );
    });

    it('should throw NotFoundException if branch belongs to another tenant', async () => {
      const mockBranch = { id: branchId, tenantId: 'other-tenant' };
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Şube bulunamadı',
      );
    });

    it('should throw ConflictException if phone number already exists in tenant', async () => {
      const mockBranch = { id: branchId, tenantId };
      const mockExistingMember = {
        id: 'existing-member',
        phone: '+1234567890',
        tenantId,
      };

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.member.findFirst.mockResolvedValue(mockExistingMember);

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Bu telefon numarası zaten kullanılıyor',
      );
    });

    it('should normalize phone number by trimming whitespace', async () => {
      const mockBranch = { id: branchId, tenantId };
      const createDtoWithSpaces = {
        ...createDto,
        phone: '  +1234567890  ',
      };
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        phone: '+1234567890',
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        status: 'ACTIVE',
      } as any);

      await service.create(tenantId, createDtoWithSpaces);

      expect(mockPrismaService.member.findFirst).toHaveBeenCalledWith({
        where: { tenantId, phone: '+1234567890' },
      });
    });

    it.skip('should set default membershipType to "Basic" if not provided', async () => {
      const mockBranch = { id: branchId, tenantId };
      const dtoWithoutType = { ...createDto };
      delete (dtoWithoutType as any).membershipType;
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        membershipType: 'Basic',
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        status: 'ACTIVE',
      } as any);

      await service.create(tenantId, dtoWithoutType);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            membershipType: 'Basic',
          }),
        }),
      );
    });

    it.skip('should set default 1-year membership duration if dates not provided', async () => {
      const mockBranch = { id: branchId, tenantId };
      const dtoWithoutDates = { ...createDto };
      delete (dtoWithoutDates as any).membershipStartDate;
      delete (dtoWithoutDates as any).membershipEndDate;

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.create.mockImplementation(({ data }) => {
        const startAt = data.membershipStartDate;
        const endAt = data.membershipEndDate;
        const diffInDays =
          (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60 * 24);
        expect(diffInDays).toBeCloseTo(365, 0);
        return Promise.resolve({
          id: 'member-1',
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: 'ACTIVE',
        } as any);
      });

      await service.create(tenantId, dtoWithoutDates);
    });

    it.skip('should throw BadRequestException if membershipEndAt is before membershipStartAt', async () => {
      const mockBranch = { id: branchId, tenantId };
      const invalidDto = {
        ...createDto,
        membershipStartDate: '2024-12-31',
        membershipEndDate: '2024-01-01',
      };

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(service.create(tenantId, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(tenantId, invalidDto)).rejects.toThrow(
        'Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır',
      );
    });

    it('should trim firstName, lastName, email, and notes', async () => {
      const mockBranch = { id: branchId, tenantId };
      const dtoWithSpaces = {
        ...createDto,
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: '  john@example.com  ',
        notes: '  Test notes  ',
      };

      const trimTestStartDate = new Date();
      const trimTestEndDate = new Date(trimTestStartDate);
      trimTestEndDate.setFullYear(trimTestEndDate.getFullYear() + 1);

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        membershipStartDate: trimTestStartDate,
        membershipEndDate: trimTestEndDate,
        status: 'ACTIVE',
      } as any);

      await service.create(tenantId, dtoWithSpaces);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            notes: 'Test notes',
          }),
        }),
      );
    });
  });

  // =====================================================================
  // FIND ALL MEMBERS TESTS
  // =====================================================================

  describe('findAll', () => {
    const tenantId = 'tenant-1';

    it('should return paginated list of members', async () => {
      const mockMembers = [
        {
          id: 'member-1',
          tenantId,
          firstName: 'John',
          membershipStartDate: new Date(),
          membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: MemberStatus.ACTIVE,
          pausedAt: null,
          resumedAt: null,
        },
        {
          id: 'member-2',
          tenantId,
          firstName: 'Jane',
          membershipStartDate: new Date(),
          membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: MemberStatus.ACTIVE,
          pausedAt: null,
          resumedAt: null,
        },
      ];

      mockPrismaService.member.findMany.mockResolvedValue(mockMembers);
      mockPrismaService.member.count.mockResolvedValue(2);

      const result = await service.findAll(tenantId, { page: 1, limit: 20 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty('remainingDays');
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by branchId', async () => {
      const branchId = 'branch-1';
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(0);

      await service.findAll(tenantId, { page: 1, limit: 20, branchId });

      expect(mockPrismaService.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            branchId,
          }),
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(0);

      await service.findAll(tenantId, {
        page: 1,
        limit: 20,
        status: MemberStatus.PAUSED,
      });

      expect(mockPrismaService.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            status: MemberStatus.PAUSED,
          }),
        }),
      );
    });

    it('should exclude ARCHIVED members by default', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(0);

      await service.findAll(tenantId, { page: 1, limit: 20 });

      expect(mockPrismaService.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'ARCHIVED' },
          }),
        }),
      );
    });

    it('should include ARCHIVED members when includeArchived is true', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(0);

      await service.findAll(tenantId, {
        page: 1,
        limit: 20,
        includeArchived: true,
      });

      const callArgs = mockPrismaService.member.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('status');
    });

    it('should search across firstName, lastName, and phone (case-insensitive)', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(0);

      await service.findAll(tenantId, {
        page: 1,
        limit: 20,
        search: 'john',
      });

      expect(mockPrismaService.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { firstName: { contains: 'john', mode: 'insensitive' } },
              { lastName: { contains: 'john', mode: 'insensitive' } },
              { phone: { contains: 'john', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should apply pagination correctly', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(100);

      await service.findAll(tenantId, { page: 3, limit: 10 });

      expect(mockPrismaService.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (page 3 - 1) * 10
          take: 10,
        }),
      );
    });

    it('should calculate totalPages correctly', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(25);

      const result = await service.findAll(tenantId, { page: 1, limit: 10 });

      expect(result.pagination.totalPages).toBe(3); // Math.ceil(25/10)
    });
  });

  // =====================================================================
  // FIND ONE MEMBER TESTS
  // =====================================================================

  describe('findOne', () => {
    const tenantId = 'tenant-1';
    const memberId = 'member-1';

    it('should return a member with remainingDays and branch information', async () => {
      const mockBranch = {
        id: 'branch-1',
        tenantId,
        name: 'Main Branch',
        address: '123 Main St',
        isDefault: true,
        isActive: true,
      };

      const mockMember = {
        id: memberId,
        tenantId,
        firstName: 'John',
        lastName: 'Doe',
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
        branch: mockBranch,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

      const result = await service.findOne(tenantId, memberId);

      expect(result).toHaveProperty('id', memberId);
      expect(result).toHaveProperty('remainingDays');
      expect(typeof result.remainingDays).toBe('number');
      expect(result).toHaveProperty('branch');
      expect(result.branch).toHaveProperty('id', 'branch-1');
      expect(result.branch).toHaveProperty('name', 'Main Branch');
    });

    it('should throw NotFoundException if member does not exist', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue(null);

      await expect(service.findOne(tenantId, memberId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(tenantId, memberId)).rejects.toThrow(
        'Üye bulunamadı',
      );
    });

    it('should throw NotFoundException if member belongs to another tenant', async () => {
      const mockMember = {
        id: memberId,
        tenantId: 'other-tenant',
        firstName: 'John',
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

      await expect(service.findOne(tenantId, memberId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(tenantId, memberId)).rejects.toThrow(
        'Üye bulunamadı',
      );
    });
  });

  // =====================================================================
  // UPDATE MEMBER TESTS
  // =====================================================================

  describe('update', () => {
    const tenantId = 'tenant-1';
    const memberId = 'member-1';
    const existingMember = {
      id: memberId,
      tenantId,
      branchId: 'branch-1',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      membershipStartDate: new Date('2024-01-01'),
      membershipEndDate: new Date('2025-01-01'),
      status: MemberStatus.ACTIVE,
      pausedAt: null,
      resumedAt: null,
    };

    beforeEach(() => {
      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);
    });

    it('should update member successfully', async () => {
      const updateDto = { firstName: 'Jane' };
      const updatedMember = { ...existingMember, firstName: 'Jane' };

      mockPrismaService.member.update.mockResolvedValue(updatedMember);

      const result = await service.update(tenantId, memberId, updateDto);

      expect(result).toHaveProperty('firstName', 'Jane');
      expect(result).toHaveProperty('remainingDays');
    });

    it('should throw NotFoundException if member belongs to another tenant', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({
        ...existingMember,
        tenantId: 'other-tenant',
      });

      await expect(
        service.update(tenantId, memberId, { firstName: 'Jane' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if new branch does not exist', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.update(tenantId, memberId, { branchId: 'new-branch' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if new branch belongs to another tenant', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: 'new-branch',
        tenantId: 'other-tenant',
      });

      await expect(
        service.update(tenantId, memberId, { branchId: 'new-branch' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if phone number is already used by another member', async () => {
      const updateDto = { phone: '+9876543210' };
      mockPrismaService.member.findFirst.mockResolvedValue({
        id: 'other-member',
        phone: '+9876543210',
        tenantId,
      });

      await expect(
        service.update(tenantId, memberId, updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating phone to same value', async () => {
      const updateDto = { phone: '+1234567890' };
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.update.mockResolvedValue(existingMember);

      await service.update(tenantId, memberId, updateDto);

      // Should not throw error
      expect(mockPrismaService.member.update).toHaveBeenCalled();
    });

    it.skip('should throw BadRequestException if membershipEndAt is before membershipStartAt', async () => {
      const updateDto = {
        membershipStartDate: '2024-12-31',
        membershipEndDate: '2024-01-01',
      };

      await expect(
        service.update(tenantId, memberId, updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should trim string fields during update', async () => {
      const updateDto = {
        firstName: '  Jane  ',
        lastName: '  Smith  ',
        phone: '  +9876543210  ',
      };

      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.update.mockResolvedValue(existingMember);

      await service.update(tenantId, memberId, updateDto);

      expect(mockPrismaService.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'Jane',
            lastName: 'Smith',
            phone: '+9876543210',
          }),
        }),
      );
    });
  });

  // =====================================================================
  // CHANGE STATUS TESTS
  // =====================================================================

  describe('changeStatus', () => {
    const tenantId = 'tenant-1';
    const memberId = 'member-1';

    it('should change status from ACTIVE to PAUSED and set pausedAt', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.ACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.member.update.mockResolvedValue({
        ...mockMember,
        status: MemberStatus.PAUSED,
        pausedAt: new Date(),
      });

      const result = await service.changeStatus(tenantId, memberId, {
        status: MemberStatus.PAUSED,
      });

      expect(result.status).toBe(MemberStatus.PAUSED);
      expect(mockPrismaService.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MemberStatus.PAUSED,
            pausedAt: expect.any(Date),
            resumedAt: null,
          }),
        }),
      );
    });

    it('should change status from PAUSED to ACTIVE and set resumedAt', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.PAUSED,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        pausedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.member.update.mockResolvedValue({
        ...mockMember,
        status: MemberStatus.ACTIVE,
        resumedAt: new Date(),
      });

      const result = await service.changeStatus(tenantId, memberId, {
        status: MemberStatus.ACTIVE,
      });

      expect(result.status).toBe(MemberStatus.ACTIVE);
      expect(mockPrismaService.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MemberStatus.ACTIVE,
            resumedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw BadRequestException when transitioning from ARCHIVED', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.ARCHIVED,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

      await expect(
        service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ACTIVE,
        }),
      ).rejects.toThrow('Arşivlenmiş üyelerin durumu değiştirilemez');
    });

    it('should throw BadRequestException when trying to set ARCHIVED via changeStatus', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.ACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

      await expect(
        service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ARCHIVED,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ARCHIVED,
        }),
      ).rejects.toThrow(
        "Üyeyi arşivlemek için arşivleme endpoint'ini kullanın",
      );
    });

    it('should throw BadRequestException for invalid transition INACTIVE to PAUSED', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.INACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

      await expect(
        service.changeStatus(tenantId, memberId, {
          status: MemberStatus.PAUSED,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changeStatus(tenantId, memberId, {
          status: MemberStatus.PAUSED,
        }),
      ).rejects.toThrow('Geçersiz durum geçişi: INACTIVE → PAUSED');
    });

    it('should allow transition from ACTIVE to INACTIVE', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.ACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.member.update.mockResolvedValue({
        ...mockMember,
        status: MemberStatus.INACTIVE,
      });

      const result = await service.changeStatus(tenantId, memberId, {
        status: MemberStatus.INACTIVE,
      });

      expect(result.status).toBe(MemberStatus.INACTIVE);
    });

    it('should allow transition from PAUSED to INACTIVE and clear timestamps', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.PAUSED,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: new Date(),
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.member.update.mockResolvedValue({
        ...mockMember,
        status: MemberStatus.INACTIVE,
        pausedAt: null,
        resumedAt: null,
      });

      await service.changeStatus(tenantId, memberId, {
        status: MemberStatus.INACTIVE,
      });

      expect(mockPrismaService.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MemberStatus.INACTIVE,
            pausedAt: null,
            resumedAt: null,
          }),
        }),
      );
    });

    it('should allow transition from INACTIVE to ACTIVE', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.INACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.member.update.mockResolvedValue({
        ...mockMember,
        status: MemberStatus.ACTIVE,
      });

      const result = await service.changeStatus(tenantId, memberId, {
        status: MemberStatus.ACTIVE,
      });

      expect(result.status).toBe(MemberStatus.ACTIVE);
    });
  });

  // =====================================================================
  // FREEZE/RESUME LOGIC TESTS (T058, T059, T060)
  // =====================================================================

  describe('MembersService - Freeze/Resume Logic', () => {
    const tenantId = 'tenant-1';
    const memberId = 'member-1';

    beforeEach(() => {
      // Use fake timers for deterministic tests
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // T058: Active → Paused → Active transition
    describe('T058 - Active → Paused → Active transition', () => {
      it('should set pausedAt when transitioning ACTIVE → PAUSED', async () => {
        const now = new Date('2024-01-15T10:00:00Z');
        jest.setSystemTime(now);

        const membershipStartDate = new Date('2024-01-01T00:00:00Z');
        const membershipEndDate = new Date('2025-01-01T00:00:00Z');

        const mockMember = {
          id: memberId,
          tenantId,
          status: MemberStatus.ACTIVE,
          membershipStartDate,
          membershipEndDate,
          pausedAt: null,
          resumedAt: null,
        };

        mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
        mockPrismaService.member.update.mockImplementation(({ data }) => {
          return Promise.resolve({
            ...mockMember,
            ...data,
          });
        });

        const result = await service.changeStatus(tenantId, memberId, {
          status: MemberStatus.PAUSED,
        });

        expect(result.status).toBe(MemberStatus.PAUSED);
        expect(result.pausedAt).toBeDefined();
        expect(result.pausedAt?.getTime()).toBe(now.getTime());
        expect(result.resumedAt).toBeNull();
        expect(result.membershipEndDate.getTime()).toBe(
          membershipEndDate.getTime(),
        );

        expect(mockPrismaService.member.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: MemberStatus.PAUSED,
              pausedAt: expect.any(Date),
              resumedAt: null,
            }),
          }),
        );
      });

      it('should throw if trying to resume without pausedAt', async () => {
        const now = new Date('2024-01-15T10:00:00Z');
        jest.setSystemTime(now);

        const mockMember = {
          id: memberId,
          tenantId,
          status: MemberStatus.PAUSED,
          membershipStartDate: new Date('2024-01-01T00:00:00Z'),
          membershipEndDate: new Date('2025-01-01T00:00:00Z'),
          pausedAt: null, // Invalid: PAUSED but no pausedAt
          resumedAt: null,
        };

        mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

        await expect(
          service.changeStatus(tenantId, memberId, {
            status: MemberStatus.ACTIVE,
          }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.changeStatus(tenantId, memberId, {
            status: MemberStatus.ACTIVE,
          }),
        ).rejects.toThrow('pausedAt değeri bulunamadı');
      });

      it('should extend membershipEndAt and clear pausedAt on PAUSED → ACTIVE', async () => {
        const now = new Date('2024-01-25T10:00:00Z');
        jest.setSystemTime(now);

        const membershipStartDate = new Date('2024-01-01T00:00:00Z');
        const originalMembershipEndAt = new Date('2025-01-01T00:00:00Z');
        const pausedAt = new Date('2024-01-15T10:00:00Z'); // Paused 10 days ago

        const pauseDurationMs = now.getTime() - pausedAt.getTime(); // 10 days
        const expectedNewEndAt = new Date(
          originalMembershipEndAt.getTime() + pauseDurationMs,
        );

        const mockMember = {
          id: memberId,
          tenantId,
          status: MemberStatus.PAUSED,
          membershipStartDate,
          membershipEndDate: originalMembershipEndAt,
          pausedAt,
          resumedAt: null,
        };

        mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
        mockPrismaService.member.update.mockImplementation(({ data }) => {
          return Promise.resolve({
            ...mockMember,
            ...data,
          });
        });

        const result = await service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ACTIVE,
        });

        expect(result.status).toBe(MemberStatus.ACTIVE);
        expect(result.resumedAt).toBeDefined();
        expect(result.resumedAt?.getTime()).toBe(now.getTime());
        expect(result.pausedAt).toBeNull();
        expect(result.membershipEndDate.getTime()).toBe(
          expectedNewEndAt.getTime(),
        );

        expect(mockPrismaService.member.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: MemberStatus.ACTIVE,
              pausedAt: null,
              resumedAt: expect.any(Date),
              membershipEndDate: expect.any(Date),
            }),
          }),
        );

        // Verify membershipEndAt was extended by pause duration
        const updateCall = mockPrismaService.member.update.mock.calls[0][0];
        const extendedEndAt = updateCall.data.membershipEndDate;
        expect(extendedEndAt.getTime()).toBe(expectedNewEndAt.getTime());
      });
    });

    // T059: Pause duration & extension accuracy
    describe('T059 - Pause duration & extension accuracy', () => {
      it('should extend membershipEndAt by exactly 1 day for 1-day pause', async () => {
        const now = new Date('2024-01-16T10:00:00Z');
        jest.setSystemTime(now);

        const membershipStartDate = new Date('2024-01-01T00:00:00Z');
        const originalMembershipEndAt = new Date('2025-01-01T00:00:00Z');
        const pausedAt = new Date('2024-01-15T10:00:00Z'); // 1 day ago

        const oneDayMs = 24 * 60 * 60 * 1000;
        const expectedNewEndAt = new Date(
          originalMembershipEndAt.getTime() + oneDayMs,
        );

        const mockMember = {
          id: memberId,
          tenantId,
          status: MemberStatus.PAUSED,
          membershipStartDate,
          membershipEndDate: originalMembershipEndAt,
          pausedAt,
          resumedAt: null,
        };

        mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
        mockPrismaService.member.update.mockImplementation(({ data }) => {
          return Promise.resolve({
            ...mockMember,
            ...data,
          });
        });

        await service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ACTIVE,
        });

        const updateCall = mockPrismaService.member.update.mock.calls[0][0];
        const extendedEndAt = updateCall.data.membershipEndDate;
        expect(extendedEndAt.getTime()).toBe(expectedNewEndAt.getTime());
      });

      it('should extend membershipEndAt by exactly 7 days for 7-day pause', async () => {
        const now = new Date('2024-01-22T10:00:00Z');
        jest.setSystemTime(now);

        const membershipStartDate = new Date('2024-01-01T00:00:00Z');
        const originalMembershipEndAt = new Date('2025-01-01T00:00:00Z');
        const pausedAt = new Date('2024-01-15T10:00:00Z'); // 7 days ago

        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const expectedNewEndAt = new Date(
          originalMembershipEndAt.getTime() + sevenDaysMs,
        );

        const mockMember = {
          id: memberId,
          tenantId,
          status: MemberStatus.PAUSED,
          membershipStartDate,
          membershipEndDate: originalMembershipEndAt,
          pausedAt,
          resumedAt: null,
        };

        mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
        mockPrismaService.member.update.mockImplementation(({ data }) => {
          return Promise.resolve({
            ...mockMember,
            ...data,
          });
        });

        await service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ACTIVE,
        });

        const updateCall = mockPrismaService.member.update.mock.calls[0][0];
        const extendedEndAt = updateCall.data.membershipEndDate;
        expect(extendedEndAt.getTime()).toBe(expectedNewEndAt.getTime());
      });

      it('should extend membershipEndAt by exactly 30 days for 30-day pause', async () => {
        const now = new Date('2024-02-14T10:00:00Z');
        jest.setSystemTime(now);

        const membershipStartDate = new Date('2024-01-01T00:00:00Z');
        const originalMembershipEndAt = new Date('2025-01-01T00:00:00Z');
        const pausedAt = new Date('2024-01-15T10:00:00Z'); // 30 days ago

        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const expectedNewEndAt = new Date(
          originalMembershipEndAt.getTime() + thirtyDaysMs,
        );

        const mockMember = {
          id: memberId,
          tenantId,
          status: MemberStatus.PAUSED,
          membershipStartDate,
          membershipEndDate: originalMembershipEndAt,
          pausedAt,
          resumedAt: null,
        };

        mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
        mockPrismaService.member.update.mockImplementation(({ data }) => {
          return Promise.resolve({
            ...mockMember,
            ...data,
          });
        });

        await service.changeStatus(tenantId, memberId, {
          status: MemberStatus.ACTIVE,
        });

        const updateCall = mockPrismaService.member.update.mock.calls[0][0];
        const extendedEndAt = updateCall.data.membershipEndDate;
        expect(extendedEndAt.getTime()).toBe(expectedNewEndAt.getTime());
      });

      it('should assert Turkish error message if pausedAt is missing during resume', async () => {
        const now = new Date('2024-01-15T10:00:00Z');
        jest.setSystemTime(now);

        const mockMember = {
          id: memberId,
          tenantId,
          status: MemberStatus.PAUSED,
          membershipStartDate: new Date('2024-01-01T00:00:00Z'),
          membershipEndDate: new Date('2025-01-01T00:00:00Z'),
          pausedAt: null,
          resumedAt: null,
        };

        mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

        await expect(
          service.changeStatus(tenantId, memberId, {
            status: MemberStatus.ACTIVE,
          }),
        ).rejects.toThrow(BadRequestException);

        try {
          await service.changeStatus(tenantId, memberId, {
            status: MemberStatus.ACTIVE,
          });
        } catch (error: any) {
          expect(error.message).toContain('pausedAt');
          expect(error.message).toContain('bulunamadı');
        }
      });
    });

    // T060: calculateRemainingDays correctness
    describe('T060 - calculateRemainingDays correctness', () => {
      it('should decrease remaining days normally for ACTIVE member as time moves', () => {
        const startAt = new Date('2024-01-01T00:00:00Z');
        const endAt = new Date('2025-01-01T00:00:00Z'); // 365 days total

        // Day 0: Start of membership
        jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
        const memberDay0 = {
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: MemberStatus.ACTIVE,
          pausedAt: null,
          resumedAt: null,
        };
        const remainingDay0 = service.calculateRemainingDays(memberDay0);
        expect(remainingDay0).toBeGreaterThanOrEqual(364);
        expect(remainingDay0).toBeLessThanOrEqual(366);

        // Day 30: 30 days elapsed
        jest.setSystemTime(new Date('2024-01-31T00:00:00Z'));
        const memberDay30 = {
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: MemberStatus.ACTIVE,
          pausedAt: null,
          resumedAt: null,
        };
        const remainingDay30 = service.calculateRemainingDays(memberDay30);
        expect(remainingDay30).toBeLessThan(remainingDay0);
        expect(remainingDay30).toBeGreaterThanOrEqual(334);
        expect(remainingDay30).toBeLessThanOrEqual(336);
      });

      it('should keep remaining days constant while PAUSED', () => {
        const startAt = new Date('2024-01-01T00:00:00Z');
        const endAt = new Date('2025-01-01T00:00:00Z');
        const pausedAt = new Date('2024-01-15T10:00:00Z'); // Paused on day 15

        // Day 15: Just paused
        jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));
        const memberDay15 = {
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: MemberStatus.PAUSED,
          pausedAt,
          resumedAt: null,
        };
        const remainingDay15 = service.calculateRemainingDays(memberDay15);

        // Day 20: Still paused (5 days later)
        jest.setSystemTime(new Date('2024-01-20T10:00:00Z'));
        const memberDay20 = {
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: MemberStatus.PAUSED,
          pausedAt,
          resumedAt: null,
        };
        const remainingDay20 = service.calculateRemainingDays(memberDay20);

        // Day 30: Still paused (15 days later)
        jest.setSystemTime(new Date('2024-01-30T10:00:00Z'));
        const memberDay30 = {
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: MemberStatus.PAUSED,
          pausedAt,
          resumedAt: null,
        };
        const remainingDay30 = service.calculateRemainingDays(memberDay30);

        // Remaining days should stay constant while paused
        expect(remainingDay15).toBe(remainingDay20);
        expect(remainingDay20).toBe(remainingDay30);
        // 365 days total - 14 days elapsed before pause = 351 days remaining
        expect(remainingDay15).toBeGreaterThanOrEqual(350);
        expect(remainingDay15).toBeLessThanOrEqual(352);
      });

      it('should use extended membershipEndAt after resume', () => {
        const startAt = new Date('2024-01-01T00:00:00Z');
        const originalEndAt = new Date('2025-01-01T00:00:00Z');
        const pausedAt = new Date('2024-01-15T10:00:00Z');
        const resumedAt = new Date('2024-01-25T10:00:00Z'); // 10-day pause
        const pauseDurationMs = resumedAt.getTime() - pausedAt.getTime();
        const extendedEndAt = new Date(
          originalEndAt.getTime() + pauseDurationMs,
        );

        // After resume: membershipEndAt was extended
        jest.setSystemTime(new Date('2024-01-26T10:00:00Z'));
        const memberAfterResume = {
          membershipStartDate: startAt,
          membershipEndDate: extendedEndAt, // Extended by pause duration
          status: MemberStatus.ACTIVE,
          pausedAt: null, // Cleared after resume
          resumedAt,
        };
        const remainingAfterResume =
          service.calculateRemainingDays(memberAfterResume);

        // Should calculate based on extended end date
        // Extended end: 2025-01-11 (375 days total)
        // Resumed at: 2024-01-25 (24 days elapsed)
        // Remaining: 375 - 24 = 351 days
        expect(remainingAfterResume).toBeGreaterThanOrEqual(350);
        expect(remainingAfterResume).toBeLessThanOrEqual(352);
      });

      it('should return 0 for membershipEndAt in the past', () => {
        const startAt = new Date('2023-01-01T00:00:00Z');
        const endAt = new Date('2023-12-31T00:00:00Z'); // In the past

        jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));
        const member = {
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: MemberStatus.ACTIVE,
          pausedAt: null,
          resumedAt: null,
        };
        const remaining = service.calculateRemainingDays(member);

        // Should return 0 or negative (expired)
        expect(remaining).toBeLessThanOrEqual(0);
      });

      it('should handle long pause durations correctly', () => {
        const startAt = new Date('2024-01-01T00:00:00Z');
        const endAt = new Date('2025-01-01T00:00:00Z');
        const pausedAt = new Date('2024-01-15T10:00:00Z');

        // 90 days paused
        jest.setSystemTime(new Date('2024-04-15T10:00:00Z'));
        const member = {
          membershipStartDate: startAt,
          membershipEndDate: endAt,
          status: MemberStatus.PAUSED,
          pausedAt,
          resumedAt: null,
        };
        const remaining = service.calculateRemainingDays(member);

        // Should still be constant (only 14 days elapsed before pause)
        expect(remaining).toBeGreaterThanOrEqual(350);
        expect(remaining).toBeLessThanOrEqual(352);
      });
    });
  });

  // =====================================================================
  // ARCHIVE MEMBER TESTS
  // =====================================================================

  describe('archive', () => {
    const tenantId = 'tenant-1';
    const memberId = 'member-1';

    it('should archive a member and clear pause timestamps', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.ACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.member.update.mockResolvedValue({
        ...mockMember,
        status: MemberStatus.ARCHIVED,
        pausedAt: null,
        resumedAt: null,
      });

      const result = await service.archive(tenantId, memberId);

      expect(result.status).toBe(MemberStatus.ARCHIVED);
      expect(mockPrismaService.member.update).toHaveBeenCalledWith({
        where: { id: memberId },
        data: {
          status: MemberStatus.ARCHIVED,
          pausedAt: null,
          resumedAt: null,
        },
      });
    });

    it('should return member as-is if already archived', async () => {
      const mockMember = {
        id: memberId,
        tenantId,
        status: MemberStatus.ARCHIVED,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

      const result = await service.archive(tenantId, memberId);

      expect(result.status).toBe(MemberStatus.ARCHIVED);
      expect(mockPrismaService.member.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if member belongs to another tenant', async () => {
      const mockMember = {
        id: memberId,
        tenantId: 'other-tenant',
        status: MemberStatus.ACTIVE,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);

      await expect(service.archive(tenantId, memberId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
