import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { PgAdvisoryLockService } from './pg-advisory-lock.service';

describe('PgAdvisoryLockService', () => {
  let service: PgAdvisoryLockService;
  let prisma: PrismaService;

  const mockQueryRaw = jest.fn();
  const mockTransaction = jest.fn();

  const mockPrismaService = {
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PgAdvisoryLockService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PgAdvisoryLockService>(PgAdvisoryLockService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('generateCorrelationId', () => {
    it('should generate unique correlation IDs with job name prefix', () => {
      const id1 = service.generateCorrelationId('plan-change-scheduler');
      const id2 = service.generateCorrelationId('plan-change-scheduler');

      expect(id1).toMatch(/^plan-change-scheduler-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^plan-change-scheduler-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('tryAcquire', () => {
    it('should return true when lock is acquired', async () => {
      mockQueryRaw.mockResolvedValue([{ acquired: true }]);

      const result = await service.tryAcquire(
        'cron:plan-change:member-123',
        'corr-1',
      );

      expect(result).toBe(true);
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return false when lock is not acquired (held by another session)', async () => {
      mockQueryRaw.mockResolvedValue([{ acquired: false }]);

      const result = await service.tryAcquire(
        'cron:plan-change:member-123',
        'corr-1',
      );

      expect(result).toBe(false);
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return false and not throw when query throws', async () => {
      mockQueryRaw.mockRejectedValue(new Error('Connection failed'));

      const result = await service.tryAcquire(
        'cron:plan-change:member-123',
        'corr-1',
      );

      expect(result).toBe(false);
    });
  });

  describe('release', () => {
    it('should call pg_advisory_unlock without throwing', async () => {
      mockQueryRaw.mockResolvedValue([{ pg_advisory_unlock: true }]);

      await expect(
        service.release('cron:plan-change:member-123', 'corr-1'),
      ).resolves.not.toThrow();

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should not throw when release returns false (lock not held)', async () => {
      mockQueryRaw.mockResolvedValue([{ pg_advisory_unlock: false }]);

      await expect(
        service.release('cron:plan-change:member-123', 'corr-1'),
      ).resolves.not.toThrow();
    });

    it('should not throw when release query throws (best-effort)', async () => {
      mockQueryRaw.mockRejectedValue(new Error('Connection lost'));

      await expect(
        service.release('cron:plan-change:member-123', 'corr-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('executeWithLock', () => {
    it('should run work on same session and return result when lock acquired', async () => {
      mockTransaction.mockImplementation(async (fn) => {
        const mockTx = {
          $queryRaw: jest
            .fn()
            .mockResolvedValueOnce([{ acquired: true }])
            .mockResolvedValueOnce([{ pg_advisory_unlock: true }]),
        };
        return fn(mockTx);
      });

      const result = await service.executeWithLock(
        'cron:test:lock',
        'corr-1',
        async (tx) => {
          expect(tx).toBeDefined();
          return 'work-result';
        },
      );

      expect(result).toEqual({ acquired: true, result: 'work-result' });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should return acquired: false when lock not acquired', async () => {
      mockTransaction.mockImplementation(async (fn) => {
        const mockTx = {
          $queryRaw: jest.fn().mockResolvedValueOnce([{ acquired: false }]),
        };
        return fn(mockTx);
      });

      const workFn = jest.fn();
      const result = await service.executeWithLock(
        'cron:test:lock',
        'corr-1',
        workFn,
      );

      expect(result).toEqual({ acquired: false });
      expect(workFn).not.toHaveBeenCalled();
    });

    it('should rethrow when work throws', async () => {
      mockTransaction.mockImplementation(async (fn) => {
        const mockTx = {
          $queryRaw: jest
            .fn()
            .mockResolvedValueOnce([{ acquired: true }])
            .mockResolvedValueOnce([{ pg_advisory_unlock: true }]),
        };
        return fn(mockTx);
      });

      await expect(
        service.executeWithLock('cron:test:lock', 'corr-1', async () => {
          throw new Error('Work failed');
        }),
      ).rejects.toThrow('Work failed');
    });
  });
});
