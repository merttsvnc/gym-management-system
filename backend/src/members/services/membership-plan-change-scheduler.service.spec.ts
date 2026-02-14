import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { PgAdvisoryLockService } from '../../common/services/pg-advisory-lock.service';
import { MembershipPlanChangeSchedulerService } from './membership-plan-change-scheduler.service';

describe('MembershipPlanChangeSchedulerService', () => {
  let service: MembershipPlanChangeSchedulerService;
  let lockService: PgAdvisoryLockService;

  const mockTryAcquire = jest.fn();
  const mockRelease = jest.fn();
  const mockGenerateCorrelationId = jest.fn();

  const mockMember = {
    id: 'member-1',
    tenantId: 'tenant-1',
    membershipPlanId: 'plan-1',
    membershipStartDate: new Date('2025-01-01'),
    membershipEndDate: new Date('2025-12-31'),
    pendingMembershipPlanId: 'plan-2',
    pendingMembershipStartDate: new Date('2025-02-14'),
    pendingMembershipEndDate: new Date('2026-02-14'),
    pendingMembershipPriceAtPurchase: 100,
    pendingMembershipScheduledByUserId: 'user-1',
    membershipPlan: { id: 'plan-1' },
    pendingMembershipPlan: { id: 'plan-2' },
  };

  const mockPrismaService = {
    member: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLockService = {
    tryAcquire: mockTryAcquire,
    release: mockRelease,
    generateCorrelationId: mockGenerateCorrelationId,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipPlanChangeSchedulerService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PgAdvisoryLockService,
          useValue: mockLockService,
        },
      ],
    }).compile();

    service = module.get<MembershipPlanChangeSchedulerService>(
      MembershipPlanChangeSchedulerService,
    );
    lockService = module.get<PgAdvisoryLockService>(PgAdvisoryLockService);

    jest.clearAllMocks();
    mockGenerateCorrelationId.mockReturnValue('corr-123');
    mockTryAcquire.mockResolvedValue(true);
    mockRelease.mockResolvedValue(undefined);
  });

  describe('applyScheduledMembershipPlanChanges', () => {
    it('should skip member when lock is not acquired', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([mockMember]);
      mockTryAcquire.mockResolvedValue(false);

      await service.applyScheduledMembershipPlanChanges();

      expect(mockTryAcquire).toHaveBeenCalledWith(
        'cron:plan-change:member-1',
        'corr-123',
      );
      expect(mockRelease).not.toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should apply change and release lock when lock is acquired', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([mockMember]);
      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.$transaction.mockImplementation(async (fn) => {
        const tx = {
          member: { update: jest.fn().mockResolvedValue({}) },
          memberPlanChangeHistory: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      await service.applyScheduledMembershipPlanChanges();

      expect(mockTryAcquire).toHaveBeenCalledWith(
        'cron:plan-change:member-1',
        'corr-123',
      );
      expect(mockRelease).toHaveBeenCalledWith(
        'cron:plan-change:member-1',
        'corr-123',
      );
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should release lock in finally when applyPendingChange throws', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([mockMember]);
      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockPrismaService.$transaction.mockRejectedValue(
        new Error('Transaction failed'),
      );

      await service.applyScheduledMembershipPlanChanges();

      expect(mockRelease).toHaveBeenCalledWith(
        'cron:plan-change:member-1',
        'corr-123',
      );
    });
  });
});
