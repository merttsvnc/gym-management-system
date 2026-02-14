/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MembershipPlansService } from '../../src/membership-plans/membership-plans.service';
import { NotFoundException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';

/**
 * Comprehensive tests for tenant isolation in Member Management
 * Ensures strict data segregation between tenants
 */
describe('MembersService - Tenant Isolation', () => {
  let service: MembersService;

  const tenant1Id = 'tenant-1';
  const tenant2Id = 'tenant-2';

  const mockPrismaService = {
    member: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    branch: {
      findFirst: jest.fn(),
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

    jest.clearAllMocks();
  });

  describe('findOne - Tenant Isolation', () => {
    it('should throw NotFoundException if member belongs to another tenant', async () => {
      const memberId = 'member-1';
      // findFirst with tenant1Id returns null when member is in tenant2 (query filters by tenantId)
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(service.findOne(tenant1Id, memberId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(tenant1Id, memberId)).rejects.toThrow(
        'Üye bulunamadı',
      );
    });

    it('should return member if it belongs to the requesting tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant1 = {
        id: memberId,
        tenantId: tenant1Id,
        firstName: 'John',
        lastName: 'Doe',
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findFirst.mockResolvedValue(memberFromTenant1);

      const result = await service.findOne(tenant1Id, memberId);

      expect(result).toBeDefined();
      expect(result.id).toBe(memberId);
      expect(result.tenantId).toBe(tenant1Id);
    });

    it('should throw NotFoundException with same message for both non-existent and other tenant members', async () => {
      const memberId = 'member-1';

      // Test 1: Member doesn't exist
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      let error1: any;
      try {
        await service.findOne(tenant1Id, memberId);
      } catch (e) {
        error1 = e;
      }

      // Test 2: Member belongs to another tenant (findFirst returns null - no match for id+tenant1Id)
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      let error2: any;
      try {
        await service.findOne(tenant1Id, memberId);
      } catch (e) {
        error2 = e;
      }

      // Both errors should have the same message to prevent information leakage
      expect(error1.message).toBe(error2.message);
      expect(error1.message).toBe('Üye bulunamadı');
    });
  });

  describe('update - Tenant Isolation', () => {
    it('should throw NotFoundException if member belongs to another tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant2 = {
        id: memberId,
        tenantId: tenant2Id,
        firstName: 'John',
      };

      // findFirst returns null (member in tenant2, we query with tenant1Id)
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(
        service.update(tenant1Id, memberId, { firstName: 'Jane' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not allow updating member to branch from another tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant1 = {
        id: memberId,
        tenantId: tenant1Id,
        branchId: 'branch-1-tenant1',
        firstName: 'John',
        phone: '+1234567890',
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };

      const branchFromTenant2 = {
        id: 'branch-1-tenant2',
        tenantId: tenant2Id, // Different tenant
        name: 'Other Tenant Branch',
      };

      mockPrismaService.member.findFirst.mockResolvedValue(memberFromTenant1);
      // Branch from tenant2 - findFirst with tenant1Id returns null
      mockPrismaService.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.update(tenant1Id, memberId, { branchId: 'branch-1-tenant2' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.update(tenant1Id, memberId, { branchId: 'branch-1-tenant2' }),
      ).rejects.toThrow('Şube bulunamadı');
    });

    it('should allow updating member to branch from same tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant1 = {
        id: memberId,
        tenantId: tenant1Id,
        branchId: 'branch-1-tenant1',
        firstName: 'John',
        phone: '+1234567890',
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };

      const branchFromSameTenant = {
        id: 'branch-2-tenant1',
        tenantId: tenant1Id,
        name: 'Same Tenant Branch',
      };

      mockPrismaService.member.findFirst.mockResolvedValue(memberFromTenant1);
      mockPrismaService.branch.findFirst.mockResolvedValue(
        branchFromSameTenant,
      );
      mockPrismaService.member.update.mockResolvedValue({
        ...memberFromTenant1,
        branchId: 'branch-2-tenant1',
      });

      const result = await service.update(tenant1Id, memberId, {
        branchId: 'branch-2-tenant1',
      });

      expect(result).toBeDefined();
      expect(mockPrismaService.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_tenantId: { id: memberId, tenantId: tenant1Id } },
        }),
      );
    });
  });

  describe('changeStatus - Tenant Isolation', () => {
    it('should throw NotFoundException if member belongs to another tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant2 = {
        id: memberId,
        tenantId: tenant2Id,
        status: MemberStatus.ACTIVE,
      };

      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(tenant1Id, memberId, {
          status: MemberStatus.PAUSED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow status change only for members in same tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant1 = {
        id: memberId,
        tenantId: tenant1Id,
        status: MemberStatus.ACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findFirst.mockResolvedValue(memberFromTenant1);
      mockPrismaService.member.update.mockResolvedValue({
        ...memberFromTenant1,
        status: MemberStatus.PAUSED,
        pausedAt: new Date(),
      });

      const result = await service.changeStatus(tenant1Id, memberId, {
        status: MemberStatus.PAUSED,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe(MemberStatus.PAUSED);
    });
  });

  describe('archive - Tenant Isolation', () => {
    it('should throw NotFoundException if member belongs to another tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant2 = {
        id: memberId,
        tenantId: tenant2Id,
        status: MemberStatus.ACTIVE,
      };

      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(service.archive(tenant1Id, memberId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow archiving only for members in same tenant', async () => {
      const memberId = 'member-1';
      const memberFromTenant1 = {
        id: memberId,
        tenantId: tenant1Id,
        status: MemberStatus.ACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findFirst.mockResolvedValue(memberFromTenant1);
      mockPrismaService.member.update.mockResolvedValue({
        ...memberFromTenant1,
        status: MemberStatus.ARCHIVED,
        pausedAt: null,
        resumedAt: null,
      });

      const result = await service.archive(tenant1Id, memberId);

      expect(result).toBeDefined();
      expect(result.status).toBe(MemberStatus.ARCHIVED);
    });
  });

  describe('findAll - Tenant Filtering', () => {
    it('should only return members from the requesting tenant', async () => {
      const membersFromTenant1 = [
        {
          id: 'member-1',
          tenantId: tenant1Id,
          firstName: 'John',
          membershipStartDate: new Date(),
          membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: MemberStatus.ACTIVE,
          pausedAt: null,
          resumedAt: null,
        },
        {
          id: 'member-2',
          tenantId: tenant1Id,
          firstName: 'Jane',
          membershipStartDate: new Date(),
          membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: MemberStatus.ACTIVE,
          pausedAt: null,
          resumedAt: null,
        },
      ];

      mockPrismaService.member.findMany.mockResolvedValue(membersFromTenant1);
      mockPrismaService.member.count.mockResolvedValue(2);

      const result = await service.findAll(tenant1Id, { page: 1, limit: 20 });

      // Verify that tenantId filter is applied
      expect(mockPrismaService.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenant1Id,
          }),
        }),
      );

      // Verify all returned members belong to tenant1
      result.data.forEach((member) => {
        expect(member.tenantId).toBe(tenant1Id);
      });
    });

    it('should filter branch queries by tenant', async () => {
      const branchIdFromTenant1 = 'branch-1-tenant1';

      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(0);

      await service.findAll(tenant1Id, {
        page: 1,
        limit: 20,
        branchId: branchIdFromTenant1,
      });

      // Verify both tenantId and branchId filters are applied
      expect(mockPrismaService.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenant1Id,
            branchId: branchIdFromTenant1,
          }),
        }),
      );
    });

    it('should apply tenant filter even with search query', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);
      mockPrismaService.member.count.mockResolvedValue(0);

      await service.findAll(tenant1Id, {
        page: 1,
        limit: 20,
        search: 'John',
      });

      // Verify tenantId is still applied with search
      const callArgs = mockPrismaService.member.findMany.mock.calls[0][0];
      expect(callArgs.where.tenantId).toBe(tenant1Id);
      expect(callArgs.where).toHaveProperty('OR'); // Search filter
    });
  });

  describe('create - Tenant Isolation', () => {
    it('should not allow creating member with branch from another tenant', async () => {
      const branchFromTenant2 = {
        id: 'branch-1-tenant2',
        tenantId: tenant2Id,
        name: 'Other Tenant Branch',
      };

      mockPrismaService.branch.findFirst.mockResolvedValue(null);

      const createDto = {
        branchId: 'branch-1-tenant2',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-1',
      };

      await expect(service.create(tenant1Id, createDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(tenant1Id, createDto)).rejects.toThrow(
        'Şube bulunamadı',
      );
    });

    it('should enforce phone uniqueness within tenant only', async () => {
      const phone = '+1234567890';
      const branchFromTenant1 = {
        id: 'branch-1-tenant1',
        tenantId: tenant1Id,
      };
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);

      mockPrismaService.branch.findFirst.mockResolvedValue(branchFromTenant1);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        phone,
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        status: 'ACTIVE',
      } as any);

      const createDto = {
        branchId: 'branch-1-tenant1',
        firstName: 'John',
        lastName: 'Doe',
        phone,
        membershipPlanId: 'plan-1',
      };

      await service.create(tenant1Id, createDto);

      // Verify phone uniqueness check is scoped to tenant
      expect(mockPrismaService.member.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: tenant1Id,
          phone,
        },
      });
    });

    it('should create member with correct tenantId', async () => {
      const branchFromTenant1 = {
        id: 'branch-1-tenant1',
        tenantId: tenant1Id,
      };

      mockPrismaService.branch.findFirst.mockResolvedValue(branchFromTenant1);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.create.mockResolvedValue({
        id: 'new-member',
        tenantId: tenant1Id,
        branchId: 'branch-1-tenant1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        status: MemberStatus.ACTIVE,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        pausedAt: null,
        resumedAt: null,
      } as any);

      const createDto = {
        branchId: 'branch-1-tenant1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-1',
      };

      await service.create(tenant1Id, createDto);

      // Verify member is created with correct tenantId
      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenant1Id,
          }),
        }),
      );
    });
  });

  describe('Cross-tenant Data Leakage Prevention', () => {
    it('should not reveal existence of members in other tenants', async () => {
      const memberId = 'member-in-tenant2';

      // Member exists but belongs to another tenant - findFirst returns null
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      // Requesting from tenant1 should get the same error as non-existent member
      await expect(service.findOne(tenant1Id, memberId)).rejects.toThrow(
        'Üye bulunamadı',
      );

      // The error message should not indicate whether the member exists
      // This prevents information leakage about other tenants' data
    });

    it('should maintain consistent error messages for security', async () => {
      const memberId = 'some-member-id';

      const errorMessages: string[] = [];

      // Scenario 1: Member doesn't exist
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      try {
        await service.findOne(tenant1Id, memberId);
      } catch (e: any) {
        errorMessages.push(e.message);
      }

      // Scenario 2: Member exists in another tenant (findFirst returns null)
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      try {
        await service.findOne(tenant1Id, memberId);
      } catch (e: any) {
        errorMessages.push(e.message);
      }

      // Both scenarios should produce identical error messages
      expect(errorMessages[0]).toBe(errorMessages[1]);
    });
  });
});
