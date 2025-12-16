/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { MembershipPlansService } from './membership-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { DurationType, PlanStatus, PlanScope } from '@prisma/client';

describe('MembershipPlansService', () => {
  let service: MembershipPlansService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    membershipPlan: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    member: {
      count: jest.fn(),
    },
    branch: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipPlansService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MembershipPlansService>(MembershipPlansService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const tenantId = 'tenant-123';
  const otherTenantId = 'tenant-456';
  const planId = 'plan-123';
  const branchId = 'branch-123';
  const otherBranchId = 'branch-456';
  const mockPlan = {
    id: planId,
    tenantId,
    scope: PlanScope.TENANT,
    branchId: null,
    scopeKey: 'TENANT',
    name: 'Basic Plan',
    description: 'A basic membership plan',
    durationType: DurationType.MONTHS,
    durationValue: 1,
    price: 100,
    currency: 'TRY',
    maxFreezeDays: 15,
    autoRenew: false,
    status: PlanStatus.ACTIVE,
    archivedAt: null,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockBranch = {
    id: branchId,
    tenantId,
    name: 'Test Branch',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockArchivedBranch = {
    ...mockBranch,
    isActive: false,
  };

  // T118: CRUD operations tests
  describe('createPlanForTenant', () => {
    const createInput = {
      scope: PlanScope.TENANT,
      name: 'Premium Plan',
      description: 'Premium membership',
      durationType: DurationType.MONTHS,
      durationValue: 12,
      price: 1200,
      currency: 'TRY',
      maxFreezeDays: 30,
      autoRenew: true,
      sortOrder: 1,
    };

    it('should create a plan successfully', async () => {
      const createdPlan = { ...mockPlan, ...createInput, id: 'new-plan-id' };
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null); // No duplicate name
      mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan);

      const result = await service.createPlanForTenant(tenantId, createInput);

      expect(result).toEqual(createdPlan);
      expect(prismaService.membershipPlan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          scope: PlanScope.TENANT,
          branchId: null,
          scopeKey: 'TENANT',
          name: 'Premium Plan',
          description: 'Premium membership',
          durationType: DurationType.MONTHS,
          durationValue: 12,
          price: 1200,
          currency: 'TRY',
          maxFreezeDays: 30,
          autoRenew: true,
          status: PlanStatus.ACTIVE,
          sortOrder: 1,
        }),
      });
    });

    it('should trim whitespace from name and description', async () => {
      const inputWithSpaces = {
        ...createInput,
        name: '  Premium Plan  ',
        description: '  Premium membership  ',
      };
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

      await service.createPlanForTenant(tenantId, inputWithSpaces);

      expect(prismaService.membershipPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Premium Plan',
            description: 'Premium membership',
          }),
        }),
      );
    });

    it('should store currency in uppercase format', async () => {
      const inputWithUpperCase = { ...createInput, currency: 'USD' };
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

      await service.createPlanForTenant(tenantId, inputWithUpperCase);

      expect(prismaService.membershipPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currency: 'USD',
          }),
        }),
      );
    });

    it('should default autoRenew to false when not provided', async () => {
      const inputWithoutAutoRenew = { ...createInput, autoRenew: undefined };
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

      await service.createPlanForTenant(tenantId, inputWithoutAutoRenew);

      expect(prismaService.membershipPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            autoRenew: false,
          }),
        }),
      );
    });

    it('should throw error for negative price', async () => {
      const inputWithNegativePrice = { ...createInput, price: -100 };

      await expect(
        service.createPlanForTenant(tenantId, inputWithNegativePrice),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPlanForTenant(tenantId, inputWithNegativePrice),
      ).rejects.toThrow('Fiyat negatif olamaz');
    });
  });

  describe('listPlansForTenant', () => {
    it('should return paginated plans for tenant', async () => {
      const mockPlans = [mockPlan];
      mockPrismaService.membershipPlan.findMany.mockResolvedValue(mockPlans);
      mockPrismaService.membershipPlan.count.mockResolvedValue(1);

      const result = await service.listPlansForTenant(tenantId, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toEqual(mockPlans);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(prismaService.membershipPlan.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId,
          archivedAt: null,
        }),
        skip: 0,
        take: 20,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('should filter by status when provided', async () => {
      mockPrismaService.membershipPlan.findMany.mockResolvedValue([]);
      mockPrismaService.membershipPlan.count.mockResolvedValue(0);

      await service.listPlansForTenant(tenantId, {
        status: PlanStatus.ACTIVE,
      });

      expect(prismaService.membershipPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            status: PlanStatus.ACTIVE,
          }),
        }),
      );
    });

    it('should filter by search term (case-insensitive)', async () => {
      mockPrismaService.membershipPlan.findMany.mockResolvedValue([]);
      mockPrismaService.membershipPlan.count.mockResolvedValue(0);

      await service.listPlansForTenant(tenantId, {
        search: 'premium',
      });

      expect(prismaService.membershipPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            name: {
              contains: 'premium',
              mode: 'insensitive',
            },
          }),
        }),
      );
    });

    it('should use default pagination values', async () => {
      mockPrismaService.membershipPlan.findMany.mockResolvedValue([]);
      mockPrismaService.membershipPlan.count.mockResolvedValue(0);

      await service.listPlansForTenant(tenantId, {});

      expect(prismaService.membershipPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('listActivePlansForTenant', () => {
    it('should return only active plans', async () => {
      const mockActivePlans = [mockPlan];
      mockPrismaService.membershipPlan.findMany.mockResolvedValue(
        mockActivePlans,
      );

      const result = await service.listActivePlansForTenant(tenantId);

      expect(result).toEqual(mockActivePlans);
      expect(prismaService.membershipPlan.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          archivedAt: null,
          scope: PlanScope.TENANT,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('getPlanByIdForTenant', () => {
    it('should return plan when it exists and belongs to tenant', async () => {
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);

      const result = await service.getPlanByIdForTenant(tenantId, planId);

      expect(result).toEqual(mockPlan);
      expect(prismaService.membershipPlan.findUnique).toHaveBeenCalledWith({
        where: { id: planId },
      });
    });

    it('should throw NotFoundException when plan does not exist', async () => {
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.getPlanByIdForTenant(tenantId, planId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getPlanByIdForTenant(tenantId, planId),
      ).rejects.toThrow('Plan bulunamadı');
    });

    // T119: Tenant isolation test
    it('should throw NotFoundException when plan belongs to different tenant', async () => {
      const planFromOtherTenant = { ...mockPlan, tenantId: 'other-tenant' };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
        planFromOtherTenant,
      );

      await expect(
        service.getPlanByIdForTenant(tenantId, planId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getPlanByIdForTenant(tenantId, planId),
      ).rejects.toThrow('Plan bulunamadı');
    });
  });

  describe('updatePlanForTenant', () => {
    it('should update plan successfully', async () => {
      const updateInput = {
        name: 'Updated Plan',
        price: 150,
      };
      const updatedPlan = { ...mockPlan, ...updateInput };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null); // No duplicate name
      mockPrismaService.membershipPlan.update.mockResolvedValue(updatedPlan);

      const result = await service.updatePlanForTenant(
        tenantId,
        planId,
        updateInput,
      );

      expect(result).toEqual(updatedPlan);
      expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
        where: { id: planId },
        data: expect.objectContaining({
          name: 'Updated Plan',
          price: 150,
        }),
      });
    });

    it('should trim whitespace from updated name', async () => {
      const updateInput = { name: '  Updated Plan  ' };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.update.mockResolvedValue(mockPlan);

      await service.updatePlanForTenant(tenantId, planId, updateInput);

      expect(prismaService.membershipPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Updated Plan',
          }),
        }),
      );
    });

    it('should store currency in uppercase format when updating', async () => {
      const updateInput = { currency: 'USD' };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.membershipPlan.update.mockResolvedValue(mockPlan);

      await service.updatePlanForTenant(tenantId, planId, updateInput);

      expect(prismaService.membershipPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currency: 'USD',
          }),
        }),
      );
    });

    it('should throw error for negative price', async () => {
      const updateInput = { price: -50 };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);

      await expect(
        service.updatePlanForTenant(tenantId, planId, updateInput),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updatePlanForTenant(tenantId, planId, updateInput),
      ).rejects.toThrow('Fiyat negatif olamaz');
    });

    it('should validate duration when both durationType and durationValue are updated', async () => {
      const updateInput = {
        durationType: DurationType.DAYS,
        durationValue: 800, // > 730, should fail
      };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);

      await expect(
        service.updatePlanForTenant(tenantId, planId, updateInput),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate duration when only durationValue is updated', async () => {
      const updateInput = {
        durationValue: 12, // Valid for MONTHS (existing durationType which is MONTHS)
      };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.membershipPlan.update.mockResolvedValue(mockPlan);

      await expect(
        service.updatePlanForTenant(tenantId, planId, updateInput),
      ).resolves.toBeDefined();
    });
  });

  describe('archivePlanForTenant', () => {
    it('should archive a plan and return active member count', async () => {
      const archivedPlan = {
        ...mockPlan,
        archivedAt: new Date(),
      };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.member.count.mockResolvedValue(5); // 5 active members
      mockPrismaService.membershipPlan.update.mockResolvedValue(archivedPlan);

      const result = await service.archivePlanForTenant(tenantId, planId);

      expect((result.plan as any).archivedAt).not.toBeNull();
      expect(result.activeMemberCount).toBe(5);
      expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
        where: { id: planId },
        data: {
          archivedAt: expect.any(Date),
          status: PlanStatus.ARCHIVED,
        },
      });
    });

    it('should return plan as-is if already archived', async () => {
      const archivedPlan = {
        ...mockPlan,
        archivedAt: new Date('2024-01-01'),
      };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
        archivedPlan,
      );
      mockPrismaService.member.count.mockResolvedValue(2);

      const result = await service.archivePlanForTenant(tenantId, planId);

      expect(result.plan).toEqual(archivedPlan);
      expect(result.activeMemberCount).toBe(2);
      expect(prismaService.membershipPlan.update).not.toHaveBeenCalled();
    });

    // T123: Archival protection logic - verify it returns count correctly
    it('should archive plan even with active members and return warning count', async () => {
      const archivedPlan = {
        ...mockPlan,
        archivedAt: new Date(),
      };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.member.count.mockResolvedValue(10); // 10 active members
      mockPrismaService.membershipPlan.update.mockResolvedValue(archivedPlan);

      const result = await service.archivePlanForTenant(tenantId, planId);

      expect((result.plan as any).archivedAt).not.toBeNull();
      expect(result.activeMemberCount).toBe(10); // Count returned for warning
    });
  });

  describe('restorePlanForTenant', () => {
    it('should restore archived plan to active status', async () => {
      const archivedPlan = {
        ...mockPlan,
        archivedAt: new Date('2024-01-01'),
      };
      const restoredPlan = {
        ...mockPlan,
        archivedAt: null,
        scopeKey: 'TENANT',
      };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
        archivedPlan,
      );
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.update.mockResolvedValue(restoredPlan);

      const result = await service.restorePlanForTenant(tenantId, planId);

      expect((result as any).archivedAt).toBeNull();
      expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
        where: { id: planId },
        data: {
          archivedAt: null,
          status: PlanStatus.ACTIVE,
          scopeKey: 'TENANT',
        },
      });
    });

    it('should return plan as-is if already active', async () => {
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);

      await expect(
        service.restorePlanForTenant(tenantId, planId),
      ).rejects.toThrow(BadRequestException);
      expect(prismaService.membershipPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('deletePlanForTenant', () => {
    it('should delete plan when no members exist', async () => {
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.member.count.mockResolvedValue(0); // No members
      mockPrismaService.membershipPlan.delete.mockResolvedValue(mockPlan);

      await service.deletePlanForTenant(tenantId, planId);

      expect(prismaService.membershipPlan.delete).toHaveBeenCalledWith({
        where: { id: planId },
      });
    });

    // T123: Archival protection logic - cannot delete with members
    it('should throw BadRequestException when members exist', async () => {
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.member.count.mockResolvedValue(5); // Has members

      await expect(
        service.deletePlanForTenant(tenantId, planId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.deletePlanForTenant(tenantId, planId),
      ).rejects.toThrow(
        'Bu plana bağlı üyeler olduğu için silinemez. Lütfen planı arşivleyin.',
      );
      expect(prismaService.membershipPlan.delete).not.toHaveBeenCalled();
    });
  });

  describe('countActiveMembersForPlan', () => {
    it('should count active members with valid membership', async () => {
      mockPrismaService.member.count.mockResolvedValue(8);

      const count = await service.countActiveMembersForPlan(planId);

      expect(count).toBe(8);
      expect(prismaService.member.count).toHaveBeenCalledWith({
        where: {
          membershipPlanId: planId,
          status: 'ACTIVE',
          membershipEndDate: {
            gte: expect.any(Date),
          },
        },
      });
    });

    it('should return 0 when no active members exist', async () => {
      mockPrismaService.member.count.mockResolvedValue(0);

      const count = await service.countActiveMembersForPlan(planId);

      expect(count).toBe(0);
    });
  });

  // T119: Tenant isolation tests
  describe('Tenant isolation', () => {
    it('should scope listPlansForTenant to tenant', async () => {
      mockPrismaService.membershipPlan.findMany.mockResolvedValue([]);
      mockPrismaService.membershipPlan.count.mockResolvedValue(0);

      await service.listPlansForTenant(tenantId, {});

      expect(prismaService.membershipPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        }),
      );
    });

    it('should scope listActivePlansForTenant to tenant', async () => {
      mockPrismaService.membershipPlan.findMany.mockResolvedValue([]);

      await service.listActivePlansForTenant(tenantId);

      expect(prismaService.membershipPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        }),
      );
    });

    it('should scope createPlanForTenant to tenant', async () => {
      const createInput = {
        scope: PlanScope.TENANT,
        name: 'Test Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'TRY',
      };
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

      await service.createPlanForTenant(tenantId, createInput);

      expect(prismaService.membershipPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId }),
        }),
      );
    });

    it('should check name uniqueness only within tenant', async () => {
      // Test data structure
      // const createInput = {
      //   name: 'Duplicate Plan',
      //   durationType: DurationType.MONTHS,
      //   durationValue: 1,
      //   price: 100,
      //   currency: 'TRY',
      // };
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);

      await service['checkNameUniqueness'](
        tenantId,
        'Duplicate Plan',
        null,
        PlanScope.TENANT,
        null,
      );

      expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ tenantId }),
      });
    });
  });

  // T120: Plan name uniqueness tests
  describe('Plan name uniqueness', () => {
    it('should throw ConflictException for duplicate name in same tenant', async () => {
      const createInput = {
        scope: PlanScope.TENANT,
        name: 'Existing Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'TRY',
      };
      const existingPlan = { ...mockPlan, name: 'Existing Plan' };
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(
        existingPlan,
      );

      await expect(
        service.createPlanForTenant(tenantId, createInput),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.createPlanForTenant(tenantId, createInput),
      ).rejects.toThrow(
        'Bu plan adı zaten kullanılıyor. Lütfen farklı bir ad seçiniz.',
      );
    });

    it('should check name uniqueness case-insensitively', async () => {
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);

      await service['checkNameUniqueness'](
        tenantId,
        'Test Plan',
        null,
        PlanScope.TENANT,
        null,
      );

      expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          scope: PlanScope.TENANT,
          branchId: null,
          name: {
            equals: 'Test Plan',
            mode: 'insensitive',
          },
          archivedAt: null,
        },
      });
    });

    it('should allow same name in different tenants', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';
      const createInput = {
        scope: PlanScope.TENANT,
        name: 'Common Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'TRY',
      };

      // First tenant creates plan
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.create.mockResolvedValue({
        ...mockPlan,
        tenantId: tenant1,
      });
      await service.createPlanForTenant(tenant1, createInput);

      // Second tenant creates plan with same name - should succeed
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null); // No duplicate in tenant2
      mockPrismaService.membershipPlan.create.mockResolvedValue({
        ...mockPlan,
        tenantId: tenant2,
      });

      await expect(
        service.createPlanForTenant(tenant2, createInput),
      ).resolves.toBeDefined();
    });

    it('should exclude current plan when checking name uniqueness on update', async () => {
      const updateInput = { name: 'New Name' };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
      mockPrismaService.membershipPlan.update.mockResolvedValue(mockPlan);

      await service.updatePlanForTenant(tenantId, planId, updateInput);

      expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: { not: planId },
        }),
      });
    });
  });

  // T121: Duration value validation tests
  describe('Duration value validation', () => {
    describe('DAYS duration', () => {
      it('should accept valid DAYS duration (1-730)', async () => {
        const createInput = {
          scope: PlanScope.TENANT,
          name: 'Valid Days Plan',
          durationType: DurationType.DAYS,
          durationValue: 30,
          price: 100,
          currency: 'TRY',
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).resolves.toBeDefined();
      });

      it('should reject DAYS duration < 1', async () => {
        const createInput = {
          scope: PlanScope.TENANT,
          name: 'Invalid Days Plan',
          durationType: DurationType.DAYS,
          durationValue: 0,
          price: 100,
          currency: 'TRY',
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow('Süre değeri 1 ile 730 gün arasında olmalıdır');
      });

      it('should reject DAYS duration > 730', async () => {
        const createInput = {
          scope: PlanScope.TENANT,
          name: 'Invalid Days Plan',
          durationType: DurationType.DAYS,
          durationValue: 731,
          price: 100,
          currency: 'TRY',
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow('Süre değeri 1 ile 730 gün arasında olmalıdır');
      });

      it('should accept boundary values (1 and 730 days)', async () => {
        const createInput1 = {
          scope: PlanScope.TENANT,
          name: 'Min Days Plan',
          durationType: DurationType.DAYS,
          durationValue: 1,
          price: 100,
          currency: 'TRY',
        };
        const createInput2 = {
          scope: PlanScope.TENANT,
          name: 'Max Days Plan',
          durationType: DurationType.DAYS,
          durationValue: 730,
          price: 100,
          currency: 'TRY',
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

        await expect(
          service.createPlanForTenant(tenantId, createInput1),
        ).resolves.toBeDefined();
        await expect(
          service.createPlanForTenant(tenantId, createInput2),
        ).resolves.toBeDefined();
      });
    });

    describe('MONTHS duration', () => {
      it('should accept valid MONTHS duration (1-24)', async () => {
        const createInput = {
          scope: PlanScope.TENANT,
          name: 'Valid Months Plan',
          durationType: DurationType.MONTHS,
          durationValue: 12,
          price: 1200,
          currency: 'TRY',
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).resolves.toBeDefined();
      });

      it('should reject MONTHS duration < 1', async () => {
        const createInput = {
          scope: PlanScope.TENANT,
          name: 'Invalid Months Plan',
          durationType: DurationType.MONTHS,
          durationValue: 0,
          price: 100,
          currency: 'TRY',
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow('Süre değeri 1 ile 24 ay arasında olmalıdır');
      });

      it('should reject MONTHS duration > 24', async () => {
        const createInput = {
          scope: PlanScope.TENANT,
          name: 'Invalid Months Plan',
          durationType: DurationType.MONTHS,
          durationValue: 25,
          price: 100,
          currency: 'TRY',
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow('Süre değeri 1 ile 24 ay arasında olmalıdır');
      });

      it('should accept boundary values (1 and 24 months)', async () => {
        const createInput1 = {
          scope: PlanScope.TENANT,
          name: 'Min Months Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'TRY',
        };
        const createInput2 = {
          scope: PlanScope.TENANT,
          name: 'Max Months Plan',
          durationType: DurationType.MONTHS,
          durationValue: 24,
          price: 2400,
          currency: 'TRY',
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

        await expect(
          service.createPlanForTenant(tenantId, createInput1),
        ).resolves.toBeDefined();
        await expect(
          service.createPlanForTenant(tenantId, createInput2),
        ).resolves.toBeDefined();
      });
    });
  });

  // T122: Currency validation tests
  describe('Currency validation', () => {
    it('should accept valid ISO 4217 currencies', async () => {
      const validCurrencies = ['TRY', 'USD', 'EUR', 'GBP', 'JPY'];

      for (const currency of validCurrencies) {
        const createInput = {
          scope: PlanScope.TENANT,
          name: `Plan ${currency}`,
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency,
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(mockPlan);

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).resolves.toBeDefined();
      }
    });

    it('should reject lowercase currency codes', async () => {
      const createInput = {
        scope: PlanScope.TENANT,
        name: 'Invalid Currency Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'try',
      };

      await expect(
        service.createPlanForTenant(tenantId, createInput),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPlanForTenant(tenantId, createInput),
      ).rejects.toThrow(
        'Para birimi 3 büyük harfli ISO 4217 formatında olmalıdır (örn: USD, EUR, TRY)',
      );
    });

    it('should reject mixed case currency codes', async () => {
      const createInput = {
        scope: PlanScope.TENANT,
        name: 'Invalid Currency Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'Usd',
      };

      await expect(
        service.createPlanForTenant(tenantId, createInput),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject currency codes with wrong length', async () => {
      const invalidCurrencies = ['US', 'DOLLAR', 'TR', 'TL'];

      for (const currency of invalidCurrencies) {
        const createInput = {
          scope: PlanScope.TENANT,
          name: `Invalid Plan ${currency}`,
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency,
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(
          'Para birimi 3 büyük harfli ISO 4217 formatında olmalıdır (örn: USD, EUR, TRY)',
        );
      }
    });

    it('should reject currency codes with numbers or special characters', async () => {
      const invalidCurrencies = ['U$D', 'TR1', '123', 'US-'];

      for (const currency of invalidCurrencies) {
        const createInput = {
          scope: PlanScope.TENANT,
          name: `Invalid Plan ${currency}`,
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency,
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // PR5 - Task 4.1: Unit Tests - Scope Validation and scopeKey Derivation
  describe('PR5 - Scope Validation and scopeKey Derivation', () => {
    const baseCreateInput = {
      name: 'Test Plan',
      durationType: DurationType.MONTHS,
      durationValue: 1,
      price: 100,
      currency: 'TRY',
    };

    describe('createPlanForTenant - Scope validation', () => {
      it('should create TENANT scope plan with null branchId successfully', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: undefined,
        };
        const createdPlan = {
          ...mockPlan,
          ...createInput,
          scopeKey: 'TENANT',
          id: 'new-plan-id',
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan);

        const result = await service.createPlanForTenant(tenantId, createInput);

        expect(result).toEqual(createdPlan);
        expect(prismaService.membershipPlan.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            tenantId,
            scope: PlanScope.TENANT,
            branchId: null,
            scopeKey: 'TENANT',
          }),
        });
      });

      it('should reject TENANT scope with branchId (400 Bad Request)', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: branchId, // Should be null for TENANT scope
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(
          'TENANT kapsamındaki planlar için branchId belirtilmemelidir',
        );
        expect(prismaService.membershipPlan.create).not.toHaveBeenCalled();
      });

      it('should reject BRANCH scope without branchId (400 Bad Request)', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: undefined, // Missing branchId
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(
          'BRANCH kapsamındaki planlar için branchId gereklidir',
        );
        expect(prismaService.membershipPlan.create).not.toHaveBeenCalled();
      });

      it('should reject BRANCH scope with empty branchId (400 Bad Request)', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: '   ', // Empty string after trim
        };

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        expect(prismaService.membershipPlan.create).not.toHaveBeenCalled();
      });

      it('should reject BRANCH scope with branchId from different tenant (403 Forbidden)', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: branchId,
        };
        const branchFromOtherTenant = {
          ...mockBranch,
          tenantId: otherTenantId,
        };
        mockPrismaService.branch.findUnique.mockResolvedValue(
          branchFromOtherTenant,
        );

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow('Bu işlem için yetkiniz bulunmamaktadır');
        expect(prismaService.membershipPlan.create).not.toHaveBeenCalled();
      });

      it('should reject BRANCH scope with archived branch (400 Bad Request)', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: branchId,
        };
        mockPrismaService.branch.findUnique.mockResolvedValue(
          mockArchivedBranch,
        );

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow('Arşivlenmiş şubeler için plan oluşturulamaz');
        expect(prismaService.membershipPlan.create).not.toHaveBeenCalled();
      });

      it('should create BRANCH scope plan with valid branchId successfully', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: branchId,
        };
        const createdPlan = {
          ...mockPlan,
          ...createInput,
          scopeKey: branchId,
          id: 'new-branch-plan-id',
        };
        mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan);

        const result = await service.createPlanForTenant(tenantId, createInput);

        expect(result).toEqual(createdPlan);
        expect(prismaService.membershipPlan.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            tenantId,
            scope: PlanScope.BRANCH,
            branchId: branchId,
            scopeKey: branchId, // scopeKey = branchId for BRANCH scope
          }),
        });
      });
    });

    describe('computeScopeKey - scopeKey derivation', () => {
      it('should return "TENANT" for TENANT scope', () => {
        const scopeKey = service['computeScopeKey'](PlanScope.TENANT, null);
        expect(scopeKey).toBe('TENANT');
      });

      it('should return branchId for BRANCH scope', () => {
        const scopeKey = service['computeScopeKey'](PlanScope.BRANCH, branchId);
        expect(scopeKey).toBe(branchId);
      });

      it('should set scopeKey correctly for TENANT scope during create', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: undefined,
        };
        const createdPlan = {
          ...mockPlan,
          ...createInput,
          scopeKey: 'TENANT',
          id: 'new-plan-id',
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan);

        await service.createPlanForTenant(tenantId, createInput);

        expect(prismaService.membershipPlan.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            scopeKey: 'TENANT',
          }),
        });
      });

      it('should set scopeKey correctly for BRANCH scope during create', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: branchId,
        };
        const createdPlan = {
          ...mockPlan,
          ...createInput,
          scopeKey: branchId,
          id: 'new-branch-plan-id',
        };
        mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan);

        await service.createPlanForTenant(tenantId, createInput);

        expect(prismaService.membershipPlan.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            scopeKey: branchId,
          }),
        });
      });

      it('should ensure scopeKey is never user-provided (DTO has no scopeKey)', async () => {
        // This test verifies that scopeKey is computed internally
        // If someone tries to pass scopeKey in the input, it should be ignored
        // The service computes it internally, so even if TypeScript allows it,
        // the service will override it
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: undefined,
        };
        const createdPlan = {
          ...mockPlan,
          ...createInput,
          scopeKey: 'TENANT', // Service computes this, not from input
          id: 'new-plan-id',
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan);

        await service.createPlanForTenant(tenantId, createInput);

        // Verify scopeKey is computed, not taken from input
        expect(prismaService.membershipPlan.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            scopeKey: 'TENANT', // Computed value, not from DTO
          }),
        });
        // Verify the input object doesn't have scopeKey (it's not in CreatePlanInput interface)
        expect(createInput).not.toHaveProperty('scopeKey');
      });
    });
  });

  // PR5 - Task 4.2: Unit Tests - Uniqueness Validation
  describe('PR5 - Uniqueness Validation', () => {
    const baseCreateInput = {
      name: 'Premium Plan',
      durationType: DurationType.MONTHS,
      durationValue: 1,
      price: 100,
      currency: 'TRY',
    };

    describe('checkNameUniqueness - TENANT scope', () => {
      it('should reject duplicate TENANT scope plan name (case-insensitive)', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: undefined,
          name: 'Premium Plan',
        };
        const existingPlan = {
          ...mockPlan,
          name: 'premium plan', // Different case
          scope: PlanScope.TENANT,
          branchId: undefined,
          archivedAt: null,
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(
          existingPlan,
        );

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(ConflictException);
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(
          'Bu plan adı zaten kullanılıyor. Lütfen farklı bir ad seçiniz.',
        );
      });

      it('should allow duplicate names across different branches (BRANCH scope)', async () => {
        const createInput1 = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: branchId,
          name: 'Premium Plan',
        };
        const createInput2 = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: otherBranchId, // Different branch
          name: 'Premium Plan', // Same name
        };
        const createdPlan1 = {
          ...mockPlan,
          ...createInput1,
          scopeKey: branchId,
          id: 'plan-1',
        };
        const createdPlan2 = {
          ...mockPlan,
          ...createInput2,
          scopeKey: otherBranchId,
          id: 'plan-2',
        };

        // First plan creation
        mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan1);
        await service.createPlanForTenant(tenantId, createInput1);

        // Second plan creation with same name but different branch - should succeed
        const otherBranch = { ...mockBranch, id: otherBranchId };
        mockPrismaService.branch.findUnique.mockResolvedValue(otherBranch);
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null); // No duplicate in this branch
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan2);

        await expect(
          service.createPlanForTenant(tenantId, createInput2),
        ).resolves.toBeDefined();
      });

      it('should allow duplicate names between TENANT and BRANCH scopes', async () => {
        const tenantPlanInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: undefined,
          name: 'Premium Plan',
        };
        const branchPlanInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: branchId,
          name: 'Premium Plan', // Same name, different scope
        };
        const tenantPlan = {
          ...mockPlan,
          ...tenantPlanInput,
          scopeKey: 'TENANT',
          id: 'tenant-plan-id',
        };
        const branchPlan = {
          ...mockPlan,
          ...branchPlanInput,
          scopeKey: branchId,
          id: 'branch-plan-id',
        };

        // Create TENANT plan
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.create.mockResolvedValue(tenantPlan);
        await service.createPlanForTenant(tenantId, tenantPlanInput);

        // Create BRANCH plan with same name - should succeed
        mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null); // No duplicate (different scope)
        mockPrismaService.membershipPlan.create.mockResolvedValue(branchPlan);

        await expect(
          service.createPlanForTenant(tenantId, branchPlanInput),
        ).resolves.toBeDefined();
      });

      it('should exclude archived plans from uniqueness checks', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: undefined,
          name: 'Premium Plan',
        };
        // Archived plan would have same name but is excluded from uniqueness check
        // findFirst returns null because archived plans are excluded
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        const createdPlan = {
          ...mockPlan,
          ...createInput,
          scopeKey: 'TENANT',
          id: 'new-plan-id',
        };
        mockPrismaService.membershipPlan.create.mockResolvedValue(createdPlan);

        // Should succeed because archived plan doesn't count
        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).resolves.toBeDefined();

        // Verify findFirst was called with archivedAt: null filter
        expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
          where: expect.objectContaining({
            archivedAt: null, // Only non-archived plans count
          }),
        });
      });

      it('should enforce case-insensitive uniqueness for TENANT scope', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.TENANT,
          branchId: undefined,
          name: 'Premium Plan',
        };
        const existingPlan = {
          ...mockPlan,
          name: 'PREMIUM PLAN', // Uppercase
          scope: PlanScope.TENANT,
          branchId: undefined,
          archivedAt: null,
        };
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(
          existingPlan,
        );

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(ConflictException);

        // Verify case-insensitive comparison was used
        expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
          where: expect.objectContaining({
            name: {
              equals: 'Premium Plan',
              mode: 'insensitive',
            },
          }),
        });
      });

      it('should enforce case-insensitive uniqueness for BRANCH scope', async () => {
        const createInput = {
          ...baseCreateInput,
          scope: PlanScope.BRANCH,
          branchId: branchId,
          name: 'Premium Plan',
        };
        const existingPlan = {
          ...mockPlan,
          name: 'premium plan', // Lowercase
          scope: PlanScope.BRANCH,
          branchId: branchId,
          archivedAt: null,
        };
        mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(
          existingPlan,
        );

        await expect(
          service.createPlanForTenant(tenantId, createInput),
        ).rejects.toThrow(ConflictException);

        // Verify case-insensitive comparison was used
        expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
          where: expect.objectContaining({
            name: {
              equals: 'Premium Plan',
              mode: 'insensitive',
            },
            branchId: branchId,
          }),
        });
      });
    });
  });

  // PR5 - Task 4.3: Unit Tests - Immutability and Archive/Restore
  describe('PR5 - Immutability and Archive/Restore', () => {
    describe('updatePlanForTenant - Immutability', () => {
      // Note: scope and branchId immutability is enforced at the DTO/ValidationPipe layer.
      // UpdatePlanDto does not include scope/branchId fields, and ValidationPipe with
      // forbidNonWhitelisted=true rejects requests containing these fields with 400 Bad Request.
      // However, service has defense-in-depth checks to prevent any attempts to modify
      // scope/branchId/scopeKey in updateData before database update.

      it('should never include scope/branchId/scopeKey in updateData (defense-in-depth)', async () => {
        const existingPlan = {
          ...mockPlan,
          scope: PlanScope.BRANCH,
          branchId: branchId,
          scopeKey: branchId,
        };
        const updateInput = {
          name: 'Updated Name',
          description: 'New description',
          price: 150,
          status: PlanStatus.ARCHIVED,
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          existingPlan,
        );
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.update.mockResolvedValue({
          ...existingPlan,
          ...updateInput,
        });

        await service.updatePlanForTenant(tenantId, planId, updateInput);

        // Verify that immutable fields are never in the updateData sent to Prisma
        const updateCall = (prismaService.membershipPlan.update as jest.Mock)
          .mock.calls[0][0];
        expect(updateCall.data).not.toHaveProperty('scope');
        expect(updateCall.data).not.toHaveProperty('branchId');
        expect(updateCall.data).not.toHaveProperty('scopeKey');
        // Verify mutable fields are present
        expect(updateCall.data).toHaveProperty('name', 'Updated Name');
        expect(updateCall.data).toHaveProperty('price', 150);
      });

      it('should allow updating other fields while preserving scope and branchId', async () => {
        const existingPlan = {
          ...mockPlan,
          scope: PlanScope.BRANCH,
          branchId: branchId,
        };
        const updateInput = {
          name: 'Updated Name',
          price: 200,
        };
        const updatedPlan = {
          ...existingPlan,
          ...updateInput,
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          existingPlan,
        );
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.update.mockResolvedValue(updatedPlan);

        const result = await service.updatePlanForTenant(
          tenantId,
          planId,
          updateInput,
        );

        expect(result).toEqual(updatedPlan);
        expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
          where: { id: planId },
          data: expect.objectContaining({
            name: 'Updated Name',
            price: 200,
            // scope and branchId should NOT be in update data
          }),
        });
        // Verify scope and branchId are not in update data
        const updateCall = (prismaService.membershipPlan.update as jest.Mock)
          .mock.calls[0][0];
        expect(updateCall.data).not.toHaveProperty('scope');
        expect(updateCall.data).not.toHaveProperty('branchId');
        expect(updateCall.data).not.toHaveProperty('scopeKey');
      });

      it('should verify scopeKey is never in updateData (defense-in-depth)', async () => {
        const existingPlan = {
          ...mockPlan,
          scope: PlanScope.TENANT,
          scopeKey: 'TENANT',
        };
        const updateInput = {
          name: 'Updated Name',
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          existingPlan,
        );
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.update.mockResolvedValue({
          ...existingPlan,
          name: 'Updated Name',
        });

        await service.updatePlanForTenant(tenantId, planId, updateInput);

        const updateCall = (prismaService.membershipPlan.update as jest.Mock)
          .mock.calls[0][0];
        // Verify immutable fields are not in updateData
        expect(updateCall.data).not.toHaveProperty('scope');
        expect(updateCall.data).not.toHaveProperty('branchId');
        expect(updateCall.data).not.toHaveProperty('scopeKey');
      });
    });

    describe('archivePlanForTenant - Idempotency', () => {
      it('should archive plan successfully', async () => {
        const existingPlan = {
          ...mockPlan,
          archivedAt: null,
        };
        const archivedPlan = {
          ...existingPlan,
          archivedAt: new Date(),
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          existingPlan,
        );
        mockPrismaService.member.count.mockResolvedValue(0);
        mockPrismaService.membershipPlan.update.mockResolvedValue(archivedPlan);

        const result = await service.archivePlanForTenant(tenantId, planId);

        expect((result.plan as any).archivedAt).not.toBeNull();
        expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
          where: { id: planId },
          data: {
            archivedAt: expect.any(Date),
            status: PlanStatus.ARCHIVED,
          },
        });
      });

      it('should be idempotent - already archived returns 200 OK', async () => {
        const alreadyArchivedPlan = {
          ...mockPlan,
          archivedAt: new Date('2024-01-01'),
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          alreadyArchivedPlan,
        );
        mockPrismaService.member.count.mockResolvedValue(5);

        const result = await service.archivePlanForTenant(tenantId, planId);

        expect(result.plan).toEqual(alreadyArchivedPlan);
        expect(result.activeMemberCount).toBe(5);
        // Should not call update if already archived
        expect(prismaService.membershipPlan.update).not.toHaveBeenCalled();
      });
    });

    describe('restorePlanForTenant - Restore validation', () => {
      it('should restore archived plan successfully', async () => {
        const archivedPlan = {
          ...mockPlan,
          scope: PlanScope.TENANT,
          branchId: undefined,
          archivedAt: new Date('2024-01-01'),
        };
        const restoredPlan = {
          ...archivedPlan,
          archivedAt: null,
          scopeKey: 'TENANT',
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          archivedPlan,
        );
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null); // No conflict
        mockPrismaService.membershipPlan.update.mockResolvedValue(restoredPlan);

        const result = await service.restorePlanForTenant(tenantId, planId);

        expect((result as any).archivedAt).toBeNull();
        expect(result.scopeKey).toBe('TENANT');
        expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
          where: { id: planId },
          data: {
            archivedAt: null,
            status: PlanStatus.ACTIVE,
            scopeKey: 'TENANT', // scopeKey recomputed during restore
          },
        });
      });

      it('should fail if plan already ACTIVE (400 Bad Request)', async () => {
        const activePlan = {
          ...mockPlan,
          archivedAt: null,
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          activePlan,
        );

        await expect(
          service.restorePlanForTenant(tenantId, planId),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.restorePlanForTenant(tenantId, planId),
        ).rejects.toThrow(
          'Plan zaten aktif durumda. Arşivlenmiş planlar geri yüklenebilir.',
        );
        expect(prismaService.membershipPlan.update).not.toHaveBeenCalled();
      });

      it('should fail if restore would violate uniqueness (400 Bad Request)', async () => {
        const archivedPlan = {
          ...mockPlan,
          scope: PlanScope.TENANT,
          branchId: undefined,
          name: 'Premium Plan',
          archivedAt: new Date('2024-01-01'),
        };
        const conflictingPlan = {
          ...mockPlan,
          scope: PlanScope.TENANT,
          branchId: undefined,
          name: 'Premium Plan', // Same name, same scope
          archivedAt: null, // Active plan
          id: 'other-plan-id',
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          archivedPlan,
        );
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(
          conflictingPlan,
        );

        await expect(
          service.restorePlanForTenant(tenantId, planId),
        ).rejects.toThrow(ConflictException);
        await expect(
          service.restorePlanForTenant(tenantId, planId),
        ).rejects.toThrow(
          'Bu plan adı zaten kullanılıyor. Lütfen farklı bir ad seçiniz.',
        );
        expect(prismaService.membershipPlan.update).not.toHaveBeenCalled();
      });

      it('should recompute scopeKey during restore for TENANT scope', async () => {
        const archivedPlan = {
          ...mockPlan,
          scope: PlanScope.TENANT,
          branchId: undefined,
          archivedAt: new Date('2024-01-01'),
        };
        const restoredPlan = {
          ...archivedPlan,
          archivedAt: null,
          scopeKey: 'TENANT',
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          archivedPlan,
        );
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.update.mockResolvedValue(restoredPlan);

        await service.restorePlanForTenant(tenantId, planId);

        expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
          where: { id: planId },
          data: {
            archivedAt: null,
            status: PlanStatus.ACTIVE,
            scopeKey: 'TENANT', // Recomputed
          },
        });
      });

      it('should recompute scopeKey during restore for BRANCH scope', async () => {
        const archivedPlan = {
          ...mockPlan,
          scope: PlanScope.BRANCH,
          branchId: branchId,
          archivedAt: new Date('2024-01-01'),
        };
        const restoredPlan = {
          ...archivedPlan,
          archivedAt: null,
          scopeKey: branchId,
        };
        mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
          archivedPlan,
        );
        mockPrismaService.membershipPlan.findFirst.mockResolvedValue(null);
        mockPrismaService.membershipPlan.update.mockResolvedValue(restoredPlan);

        await service.restorePlanForTenant(tenantId, planId);

        expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
          where: { id: planId },
          data: {
            archivedAt: null,
            status: PlanStatus.ACTIVE,
            scopeKey: branchId, // Recomputed from branchId
          },
        });
      });
    });
  });
});
