import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PgAdvisoryLockService } from '../../common/services/pg-advisory-lock.service';
import { MembershipPlanChangeSchedulerService } from './membership-plan-change-scheduler.service';

describe('MembershipPlanChangeSchedulerService', () => {
  let service: MembershipPlanChangeSchedulerService;
  let lockService: PgAdvisoryLockService;

  const mockExecuteWithLock = jest.fn();
  const mockGenerateCorrelationId = jest.fn();
  const mockConfigService = {
    get: jest.fn((key: string) => (key === 'CRON_ENABLED' ? 'true' : undefined)),
  };

  const mockMember = {
    id: 'member-1',
    tenantId: 'tenant-1',
    membershipPlanId: 'plan-1',
    membershipStartDate: new Date('2025-01-01'),
    membershipEndDate: new Date('2025-12-31'),
    pendingMembershipPlanId: 'plan-2',
    pendingMembershipStartDate: new Date('2025-02-14'),
    pendingMembershipEndDate: new Date('2026-02-14'),
    pendingMembershipPriceAtPurchase: { toNumber: () => 100 },
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
    executeWithLock: mockExecuteWithLock,
    generateCorrelationId: mockGenerateCorrelationId,
  };

  beforeEach(async () => {
    mockConfigService.get.mockImplementation((key: string) =>
      key === 'CRON_ENABLED' ? 'true' : undefined,
    );
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
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MembershipPlanChangeSchedulerService>(
      MembershipPlanChangeSchedulerService,
    );
    lockService = module.get<PgAdvisoryLockService>(PgAdvisoryLockService);

    jest.clearAllMocks();
    mockGenerateCorrelationId.mockReturnValue('corr-123');
    mockExecuteWithLock.mockResolvedValue({ acquired: true });
  });

  describe('applyScheduledMembershipPlanChanges', () => {
    it('should return early when CRON_ENABLED=false', async () => {
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'CRON_ENABLED' ? 'false' : undefined,
      );

      await service.applyScheduledMembershipPlanChanges();

      expect(mockPrismaService.member.findMany).not.toHaveBeenCalled();
      expect(mockExecuteWithLock).not.toHaveBeenCalled();
    });

    it('should skip member when lock is not acquired', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([mockMember]);
      mockExecuteWithLock.mockResolvedValue({ acquired: false });

      await service.applyScheduledMembershipPlanChanges();

      expect(mockExecuteWithLock).toHaveBeenCalledWith(
        'cron:plan-change:member-1',
        'corr-123',
        expect.any(Function),
      );
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should apply change when lock is acquired', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([mockMember]);
      mockPrismaService.member.findUnique.mockResolvedValue(mockMember);
      mockExecuteWithLock.mockImplementation(async (_lockName, _corrId, work) => {
        const tx = {
          member: {
            findUnique: jest.fn().mockResolvedValue(mockMember),
            update: jest.fn().mockResolvedValue({}),
          },
          memberPlanChangeHistory: { create: jest.fn().mockResolvedValue({}) },
        };
        await work(tx);
        return { acquired: true };
      });

      await service.applyScheduledMembershipPlanChanges();

      expect(mockExecuteWithLock).toHaveBeenCalledWith(
        'cron:plan-change:member-1',
        'corr-123',
        expect.any(Function),
      );
      expect(mockExecuteWithLock).toHaveBeenCalled();
    });

    it('should count error when applyPendingChange throws', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([mockMember]);
      mockExecuteWithLock.mockImplementation(async (_lockName, _corrId, work) => {
        const tx = {
          member: {
            findUnique: jest.fn().mockResolvedValue(mockMember),
            update: jest.fn().mockRejectedValue(new Error('Transaction failed')),
          },
          memberPlanChangeHistory: { create: jest.fn().mockResolvedValue({}) },
        };
        await work(tx);
        return { acquired: true };
      });

      await service.applyScheduledMembershipPlanChanges();

      expect(mockExecuteWithLock).toHaveBeenCalled();
    });
  });
});
