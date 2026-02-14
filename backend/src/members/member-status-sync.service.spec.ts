import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PgAdvisoryLockService } from '../common/services/pg-advisory-lock.service';
import { MemberStatusSyncService } from './member-status-sync.service';

describe('MemberStatusSyncService', () => {
  let service: MemberStatusSyncService;

  const mockTryAcquire = jest.fn();
  const mockRelease = jest.fn();

  const mockPrismaService = {
    tenant: { findMany: jest.fn() },
    member: { findMany: jest.fn(), updateMany: jest.fn() },
  };

  const mockLockService = {
    tryAcquire: mockTryAcquire,
    release: mockRelease,
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
    mockTryAcquire.mockResolvedValue(true);
    mockRelease.mockResolvedValue(undefined);
    mockPrismaService.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }]);
    mockPrismaService.member.findMany.mockResolvedValue([]);
    mockPrismaService.member.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('handleCron (via syncExpiredMemberStatuses)', () => {
    it('should return early when lock is not acquired', async () => {
      mockTryAcquire.mockResolvedValue(false);

      await service.handleCron();

      expect(mockTryAcquire).toHaveBeenCalledWith(
        'cron:status-sync:global',
        'corr-456',
      );
      expect(mockRelease).not.toHaveBeenCalled();
      expect(mockPrismaService.tenant.findMany).not.toHaveBeenCalled();
    });

    it('should run sync and release lock when lock is acquired', async () => {
      mockPrismaService.member.findMany.mockResolvedValue([
        { id: 'member-1' },
      ]);
      mockPrismaService.member.updateMany.mockResolvedValue({ count: 5 });

      await service.handleCron();

      expect(mockTryAcquire).toHaveBeenCalledWith(
        'cron:status-sync:global',
        'corr-456',
      );
      expect(mockRelease).toHaveBeenCalledWith(
        'cron:status-sync:global',
        'corr-456',
      );
      expect(mockPrismaService.tenant.findMany).toHaveBeenCalled();
    });

    it('should release lock in finally when sync throws', async () => {
      mockPrismaService.tenant.findMany.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(service.handleCron()).rejects.toThrow('DB error');

      expect(mockRelease).toHaveBeenCalledWith(
        'cron:status-sync:global',
        'corr-456',
      );
    });
  });
});
