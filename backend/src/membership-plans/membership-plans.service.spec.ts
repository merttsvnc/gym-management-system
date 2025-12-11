/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MembershipPlansService } from './membership-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { DurationType, PlanStatus } from '@prisma/client';

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
  const planId = 'plan-123';
  const mockPlan = {
    id: planId,
    tenantId,
    name: 'Basic Plan',
    description: 'A basic membership plan',
    durationType: DurationType.MONTHS,
    durationValue: 1,
    price: 100,
    currency: 'TRY',
    maxFreezeDays: 15,
    autoRenew: false,
    status: PlanStatus.ACTIVE,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // T118: CRUD operations tests
  describe('createPlanForTenant', () => {
    const createInput = {
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
        data: {
          tenantId,
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
        },
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
        where: { tenantId },
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
          status: PlanStatus.ACTIVE,
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
      const archivedPlan = { ...mockPlan, status: PlanStatus.ARCHIVED };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.member.count.mockResolvedValue(5); // 5 active members
      mockPrismaService.membershipPlan.update.mockResolvedValue(archivedPlan);

      const result = await service.archivePlanForTenant(tenantId, planId);

      expect(result.plan.status).toBe(PlanStatus.ARCHIVED);
      expect(result.activeMemberCount).toBe(5);
      expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
        where: { id: planId },
        data: { status: PlanStatus.ARCHIVED },
      });
    });

    it('should return plan as-is if already archived', async () => {
      const archivedPlan = { ...mockPlan, status: PlanStatus.ARCHIVED };
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
      const archivedPlan = { ...mockPlan, status: PlanStatus.ARCHIVED };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.member.count.mockResolvedValue(10); // 10 active members
      mockPrismaService.membershipPlan.update.mockResolvedValue(archivedPlan);

      const result = await service.archivePlanForTenant(tenantId, planId);

      expect(result.plan.status).toBe(PlanStatus.ARCHIVED);
      expect(result.activeMemberCount).toBe(10); // Count returned for warning
    });
  });

  describe('restorePlanForTenant', () => {
    it('should restore archived plan to active status', async () => {
      const archivedPlan = { ...mockPlan, status: PlanStatus.ARCHIVED };
      const restoredPlan = { ...mockPlan, status: PlanStatus.ACTIVE };
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(
        archivedPlan,
      );
      mockPrismaService.membershipPlan.update.mockResolvedValue(restoredPlan);

      const result = await service.restorePlanForTenant(tenantId, planId);

      expect(result.status).toBe(PlanStatus.ACTIVE);
      expect(prismaService.membershipPlan.update).toHaveBeenCalledWith({
        where: { id: planId },
        data: { status: PlanStatus.ACTIVE },
      });
    });

    it('should return plan as-is if already active', async () => {
      mockPrismaService.membershipPlan.findUnique.mockResolvedValue(mockPlan);

      const result = await service.restorePlanForTenant(tenantId, planId);

      expect(result).toEqual(mockPlan);
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

      await service['checkNameUniqueness'](tenantId, 'Duplicate Plan', null);

      expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ tenantId }),
      });
    });
  });

  // T120: Plan name uniqueness tests
  describe('Plan name uniqueness', () => {
    it('should throw ConflictException for duplicate name in same tenant', async () => {
      const createInput = {
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

      await service['checkNameUniqueness'](tenantId, 'Test Plan', null);

      expect(prismaService.membershipPlan.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          name: {
            equals: 'Test Plan',
            mode: 'insensitive',
          },
        },
      });
    });

    it('should allow same name in different tenants', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';
      const createInput = {
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
          name: 'Min Days Plan',
          durationType: DurationType.DAYS,
          durationValue: 1,
          price: 100,
          currency: 'TRY',
        };
        const createInput2 = {
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
          name: 'Min Months Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'TRY',
        };
        const createInput2 = {
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
});
