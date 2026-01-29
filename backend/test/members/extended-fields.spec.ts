/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MembershipPlansService } from '../../src/membership-plans/membership-plans.service';
import { MaritalStatus, BloodType } from '@prisma/client';

/**
 * Tests for extended member profile fields
 * Covers address, district, nationalId, maritalStatus, occupation, industry,
 * bloodType, emergencyContactName, emergencyContactPhone
 */
describe('MembersService - Extended Fields', () => {
  let service: MembersService;

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

  const mockMembershipPlansService = {
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
          useValue: mockMembershipPlansService,
        },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);

    jest.clearAllMocks();
  });

  describe('Create member with extended fields', () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    beforeEach(() => {
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: branchId,
        tenantId,
      });
      mockPrismaService.member.findFirst.mockResolvedValue(null);
    });

    it('should create member with all extended fields', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-1',
        address: '123 Main St, Apt 4B',
        district: 'Downtown',
        nationalId: '12345678901',
        maritalStatus: MaritalStatus.MARRIED,
        occupation: 'Software Engineer',
        industry: 'Technology',
        bloodType: BloodType.A_POS,
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+1987654321',
      };

      const mockCreatedMember = {
        id: 'member-1',
        ...createDto,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.create.mockResolvedValue(mockCreatedMember);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: '123 Main St, Apt 4B',
          district: 'Downtown',
          nationalId: '12345678901',
          maritalStatus: MaritalStatus.MARRIED,
          occupation: 'Software Engineer',
          industry: 'Technology',
          bloodType: BloodType.A_POS,
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '+1987654321',
        }),
      });
    });

    it('should trim extended string fields', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-1',
        address: '  123 Main St  ',
        district: '  Downtown  ',
        nationalId: '  12345678901  ',
        occupation: '  Engineer  ',
        industry: '  Tech  ',
        emergencyContactName: '  Jane Doe  ',
        emergencyContactPhone: '  +1987654321  ',
      };

      const mockCreatedMember = {
        id: 'member-1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.create.mockResolvedValue(mockCreatedMember);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: '123 Main St',
          district: 'Downtown',
          nationalId: '12345678901',
          occupation: 'Engineer',
          industry: 'Tech',
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '+1987654321',
        }),
      });
    });

    it('should create member without extended fields (backward compatibility)', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-1',
      };

      const mockCreatedMember = {
        id: 'member-1',
        ...createDto,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.create.mockResolvedValue(mockCreatedMember);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
          address: null,
          district: null,
          nationalId: null,
          maritalStatus: undefined,
          occupation: null,
          industry: null,
          bloodType: undefined,
          emergencyContactName: null,
          emergencyContactPhone: null,
        }),
      });
    });
  });

  describe('Update member with extended fields', () => {
    const tenantId = 'tenant-1';
    const memberId = 'member-1';

    const existingMember = {
      id: memberId,
      tenantId,
      branchId: 'branch-1',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      email: null,
      gender: null,
      dateOfBirth: null,
      photoUrl: null,
      membershipPlanId: 'plan-1',
      membershipStartDate: new Date('2024-01-01'),
      membershipEndDate: new Date('2025-01-01'),
      membershipPriceAtPurchase: null,
      status: 'ACTIVE',
      pausedAt: null,
      resumedAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      address: null,
      district: null,
      nationalId: null,
      maritalStatus: null,
      occupation: null,
      industry: null,
      bloodType: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    };

    beforeEach(() => {
      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);
    });

    it('should update extended fields', async () => {
      const updateDto = {
        address: '456 New St',
        district: 'Uptown',
        nationalId: '98765432109',
        maritalStatus: MaritalStatus.SINGLE,
        occupation: 'Designer',
        industry: 'Creative',
        bloodType: BloodType.B_POS,
        emergencyContactName: 'Bob Smith',
        emergencyContactPhone: '+1555555555',
      };

      const updatedMember = {
        ...existingMember,
        ...updateDto,
      };

      mockPrismaService.member.update.mockResolvedValue(updatedMember);

      await service.update(tenantId, memberId, updateDto);

      expect(mockPrismaService.member.update).toHaveBeenCalledWith({
        where: { id: memberId },
        data: expect.objectContaining({
          address: '456 New St',
          district: 'Uptown',
          nationalId: '98765432109',
          maritalStatus: MaritalStatus.SINGLE,
          occupation: 'Designer',
          industry: 'Creative',
          bloodType: BloodType.B_POS,
          emergencyContactName: 'Bob Smith',
          emergencyContactPhone: '+1555555555',
        }),
      });
    });

    it('should clear extended fields when set to empty string', async () => {
      const updateDto = {
        address: '',
        district: '',
        occupation: '',
      };

      mockPrismaService.member.update.mockResolvedValue({
        ...existingMember,
        address: null,
        district: null,
        occupation: null,
      });

      await service.update(tenantId, memberId, updateDto);

      expect(mockPrismaService.member.update).toHaveBeenCalledWith({
        where: { id: memberId },
        data: expect.objectContaining({
          address: null,
          district: null,
          occupation: null,
        }),
      });
    });
  });
});
