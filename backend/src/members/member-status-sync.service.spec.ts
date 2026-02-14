import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PgAdvisoryLockService } from '../common/services/pg-advisory-lock.service';
import { MemberStatusSyncService } from './member-status-sync.service';

describe('MemberStatusSyncService', () => {
  let service: MemberStatusSyncService;

  const mockExecuteWithLock = jest.fn();

  const mockPrismaService = {
    tenant: { findMany: jest.fn() },
    member: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockLockService = {
    executeWithLock: mockExecuteWithLock,
    generateCorrelationId: jest.fn().mockReturnValue('corr-456'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberStatusSyncService,
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

    service = module.get<MemberStatusSyncService>(MemberStatusSyncService);

    jest.clearAllMocks();
    mockExecuteWithLock.mockResolvedValue({ acquired: true });
    mockPrismaService.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }]);
    mockPrismaService.member.findMany.mockResolvedValue([]);
    mockPrismaService.member.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('handleCron (via syncExpiredMemberStatuses)', () => {
    it('should return early when lock is not acquired', async () => {
      mockExecuteWithLock.mockResolvedValue({ acquired: false });

      await service.handleCron();

      expect(mockExecuteWithLock).toHaveBeenCalledWith(
        'cron:status-sync:global',
        'corr-456',
        expect.any(Function),
      );
      expect(mockPrismaService.tenant.findMany).not.toHaveBeenCalled();
    });

    it('should run sync when lock is acquired', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([
        { id: 'member-1' },
      ]);
      mockPrismaService.member.updateMany.mockResolvedValue({ count: 5 });
      mockExecuteWithLock.mockImplementation(async (_lockName, _corrId, work) => {
        const tx = {
          tenant: mockPrismaService.tenant,
          member: mockPrismaService.member,
        };
        const result = await work(tx);
        return { acquired: true, result };
      });

      await service.handleCron();

      expect(mockExecuteWithLock).toHaveBeenCalledWith(
        'cron:status-sync:global',
        'corr-456',
        expect.any(Function),
      );
      expect(mockPrismaService.tenant.findMany).toHaveBeenCalled();
    });

    it('should rethrow when sync throws', async () => {
      mockExecuteWithLock.mockImplementation(async (_lockName, _corrId, work) => {
        const tx = {
          tenant: { findMany: jest.fn().mockRejectedValue(new Error('DB error')) },
          member: mockPrismaService.member,
        };
        await work(tx);
        return { acquired: true };
      });

      await expect(service.handleCron()).rejects.toThrow('DB error');
    });
  });
});
