/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    member: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    membershipPlan: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const tenantId = 'tenant-123';
  const branchId = 'branch-123';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  describe('getSummary', () => {
    it('should return summary statistics without branch filter', async () => {
      mockPrismaService.member.count
        .mockResolvedValueOnce(100) // totalMembers
        .mockResolvedValueOnce(80) // activeMembers
        .mockResolvedValueOnce(20) // passiveMembers
        .mockResolvedValueOnce(15); // expiringSoonMembers

      const result = await service.getSummary(tenantId);

      expect(result).toEqual({
        counts: {
          totalMembers: 100,
          activeMembers: 80,
          passiveMembers: 20,
          expiringSoonMembers: 15,
        },
        meta: {
          expiringDays: 7,
        },
      });

      expect(prismaService.member.count).toHaveBeenCalledTimes(4);
    });

    it('should respect branch filter', async () => {
      mockPrismaService.member.count
        .mockResolvedValueOnce(50) // totalMembers
        .mockResolvedValueOnce(40) // activeMembers
        .mockResolvedValueOnce(10) // passiveMembers
        .mockResolvedValueOnce(8); // expiringSoonMembers

      const result = await service.getSummary(tenantId, branchId);

      expect(result).toEqual({
        counts: {
          totalMembers: 50,
          activeMembers: 40,
          passiveMembers: 10,
          expiringSoonMembers: 8,
        },
        meta: {
          expiringDays: 7,
          branchId: branchId,
        },
      });

      // Verify branchId is included in where clause
      const calls = mockPrismaService.member.count.mock.calls;
      expect(calls[0][0].where.branchId).toBe(branchId);
      expect(calls[1][0].where.branchId).toBe(branchId);
      expect(calls[2][0].where.branchId).toBe(branchId);
      expect(calls[3][0].where.branchId).toBe(branchId);
    });

    it('should calculate expiringSoon correctly (within 7 days)', async () => {
      mockPrismaService.member.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(5); // expiringSoonMembers

      const result = await service.getSummary(tenantId);

      expect(result.counts.expiringSoonMembers).toBe(5);

      // Verify expiringSoon query uses correct date range and ACTIVE status
      const expiringSoonCall = mockPrismaService.member.count.mock.calls[3];
      expect(expiringSoonCall[0].where.status).toBe('ACTIVE');
      expect(expiringSoonCall[0].where.membershipEndDate).toBeDefined();
      expect(expiringSoonCall[0].where.membershipEndDate.gte).toBeDefined();
      expect(expiringSoonCall[0].where.membershipEndDate.lte).toBeDefined();
    });

    it('should handle zero members correctly', async () => {
      mockPrismaService.member.count
        .mockResolvedValueOnce(0) // totalMembers
        .mockResolvedValueOnce(0) // activeMembers
        .mockResolvedValueOnce(0) // passiveMembers
        .mockResolvedValueOnce(0); // expiringSoonMembers

      const result = await service.getSummary(tenantId);

      expect(result).toEqual({
        counts: {
          totalMembers: 0,
          activeMembers: 0,
          passiveMembers: 0,
          expiringSoonMembers: 0,
        },
        meta: {
          expiringDays: 7,
        },
      });
    });

    it('should respect expiringDays parameter', async () => {
      mockPrismaService.member.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(10);

      const result = await service.getSummary(tenantId, undefined, 14);

      expect(result.meta.expiringDays).toBe(14);
      expect(result.counts.expiringSoonMembers).toBe(10);
    });

    it('should throw BadRequestException for invalid expiringDays', async () => {
      await expect(
        service.getSummary(tenantId, undefined, 0),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getSummary(tenantId, undefined, 61),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMembershipDistribution', () => {
    it('should return membership distribution without branch filter', async () => {
      const mockDistribution = [
        {
          membershipPlanId: 'plan-1',
          _count: { id: 30 },
        },
        {
          membershipPlanId: 'plan-2',
          _count: { id: 20 },
        },
      ];

      const mockPlans = [
        { id: 'plan-1', name: 'Basic Plan' },
        { id: 'plan-2', name: 'Premium Plan' },
      ];

      mockPrismaService.member.groupBy.mockResolvedValue(mockDistribution);
      mockPrismaService.membershipPlan.findMany.mockResolvedValue(mockPlans);

      const result = await service.getMembershipDistribution(tenantId);

      expect(result).toEqual([
        { planId: 'plan-1', planName: 'Basic Plan', activeMemberCount: 30 },
        { planId: 'plan-2', planName: 'Premium Plan', activeMemberCount: 20 },
      ]);

      expect(prismaService.member.groupBy).toHaveBeenCalledWith({
        by: ['membershipPlanId'],
        where: expect.objectContaining({
          tenantId,
          membershipEndDate: expect.any(Object),
        }),
        _count: { id: true },
      });
    });

    it('should respect branch filter', async () => {
      const mockDistribution = [
        {
          membershipPlanId: 'plan-1',
          _count: { id: 15 },
        },
      ];

      const mockPlans = [{ id: 'plan-1', name: 'Basic Plan' }];

      mockPrismaService.member.groupBy.mockResolvedValue(mockDistribution);
      mockPrismaService.membershipPlan.findMany.mockResolvedValue(mockPlans);

      const result = await service.getMembershipDistribution(
        tenantId,
        branchId,
      );

      expect(result).toEqual([
        { planId: 'plan-1', planName: 'Basic Plan', activeMemberCount: 15 },
      ]);

      const groupByCall = mockPrismaService.member.groupBy.mock.calls[0][0];
      expect(groupByCall.where.branchId).toBe(branchId);
    });

    it('should return empty array when no members exist', async () => {
      mockPrismaService.member.groupBy.mockResolvedValue([]);

      const result = await service.getMembershipDistribution(tenantId);

      expect(result).toEqual([]);
      expect(prismaService.membershipPlan.findMany).not.toHaveBeenCalled();
    });

    it('should filter out plans not found (edge case)', async () => {
      const mockDistribution = [
        {
          membershipPlanId: 'plan-1',
          _count: { id: 10 },
        },
        {
          membershipPlanId: 'plan-missing',
          _count: { id: 5 },
        },
      ];

      const mockPlans = [{ id: 'plan-1', name: 'Basic Plan' }];

      mockPrismaService.member.groupBy.mockResolvedValue(mockDistribution);
      mockPrismaService.membershipPlan.findMany.mockResolvedValue(mockPlans);

      const result = await service.getMembershipDistribution(tenantId);

      // Should only return plan-1, plan-missing should be filtered out
      expect(result).toEqual([
        { planId: 'plan-1', planName: 'Basic Plan', activeMemberCount: 10 },
      ]);
      expect(result.length).toBe(1);
    });

    it('should sort by activeMemberCount descending', async () => {
      const mockDistribution = [
        {
          membershipPlanId: 'plan-2',
          _count: { id: 20 },
        },
        {
          membershipPlanId: 'plan-1',
          _count: { id: 30 },
        },
      ];

      const mockPlans = [
        { id: 'plan-1', name: 'Basic Plan' },
        { id: 'plan-2', name: 'Premium Plan' },
      ];

      mockPrismaService.member.groupBy.mockResolvedValue(mockDistribution);
      mockPrismaService.membershipPlan.findMany.mockResolvedValue(mockPlans);

      const result = await service.getMembershipDistribution(tenantId);

      // Should be sorted by count descending
      expect(result[0].activeMemberCount).toBe(30);
      expect(result[1].activeMemberCount).toBe(20);
    });
  });

  describe('getMonthlyMembers', () => {
    beforeEach(() => {
      // Mock Date.now() to return a fixed date for consistent testing
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return monthly members for default 6 months', async () => {
      const mockMembers = [
        { createdAt: new Date('2024-05-15') },
        { createdAt: new Date('2024-05-20') },
        { createdAt: new Date('2024-06-10') },
      ];

      mockPrismaService.member.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMonthlyMembers(tenantId);

      expect(result).toHaveLength(6);
      expect(result[0].month).toBe('2024-01');
      expect(result[5].month).toBe('2024-06');
      expect(result[4].newMembers).toBe(2); // May has 2 members
      expect(result[5].newMembers).toBe(1); // June has 1 member
    });

    it('should respect branch filter', async () => {
      const mockMembers = [{ createdAt: new Date('2024-06-10') }];

      mockPrismaService.member.findMany.mockResolvedValue(mockMembers);

      await service.getMonthlyMembers(tenantId, branchId, 6);

      const findManyCall = mockPrismaService.member.findMany.mock.calls[0][0];
      expect(findManyCall.where.branchId).toBe(branchId);
    });

    it('should return specified number of months', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyMembers(tenantId, undefined, 12);

      expect(result).toHaveLength(12);
    });

    it('should include months with zero members', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyMembers(tenantId, undefined, 3);

      expect(result).toHaveLength(3);
      expect(result[0].newMembers).toBe(0);
      expect(result[1].newMembers).toBe(0);
      expect(result[2].newMembers).toBe(0);
    });

    it('should throw BadRequestException for months < 1', async () => {
      await expect(
        service.getMonthlyMembers(tenantId, undefined, 0),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for months > 12', async () => {
      await expect(
        service.getMonthlyMembers(tenantId, undefined, 13),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle members from different months correctly', async () => {
      const mockMembers = [
        { createdAt: new Date('2024-04-15') },
        { createdAt: new Date('2024-04-20') },
        { createdAt: new Date('2024-05-10') },
        { createdAt: new Date('2024-06-05') },
        { createdAt: new Date('2024-06-10') },
      ];

      mockPrismaService.member.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMonthlyMembers(tenantId, undefined, 6);

      expect(result.find((r) => r.month === '2024-04')?.newMembers).toBe(2);
      expect(result.find((r) => r.month === '2024-05')?.newMembers).toBe(1);
      expect(result.find((r) => r.month === '2024-06')?.newMembers).toBe(2);
    });

    it('should format months as YYYY-MM', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyMembers(tenantId, undefined, 3);

      expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should include members created on current day (regression test for timezone bug)', async () => {
      // This test ensures that members created "today" are counted correctly
      // Previously, using getTodayStart() as upper bound excluded members created
      // after midnight in UTC when running in non-UTC timezones

      const now = new Date(); // 2024-06-15T10:00:00Z (from fake timers)
      const mockMembers = [
        { createdAt: new Date('2024-06-15T08:00:00Z') }, // Same day, before "now"
        { createdAt: new Date('2024-06-15T09:59:59Z') }, // Same day, just before "now"
      ];

      mockPrismaService.member.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMonthlyMembers(tenantId, undefined, 6);

      // Both members should be counted in June
      const juneData = result.find((r) => r.month === '2024-06');
      expect(juneData?.newMembers).toBe(2);

      // Verify query uses 'now' as upper bound, not start of today
      const findManyCall = mockPrismaService.member.findMany.mock.calls[0][0];
      expect(findManyCall.where.createdAt.lte).toBeInstanceOf(Date);
      // The lte value should be close to now (within a few seconds)
      const lteDate = findManyCall.where.createdAt.lte as Date;
      expect(Math.abs(lteDate.getTime() - now.getTime())).toBeLessThan(1000);
    });
  });
});
