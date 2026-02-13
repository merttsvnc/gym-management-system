import { Test, TestingModule } from '@nestjs/testing';
import { RevenueMonthLockService } from './revenue-month-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('RevenueMonthLockService', () => {
  let service: RevenueMonthLockService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    revenueMonthLock: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueMonthLockService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RevenueMonthLockService>(RevenueMonthLockService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a month lock successfully', async () => {
      const month = '2026-02';
      const tenantId = 'tenant-1';
      const branchId = 'branch-1';
      const userId = 'user-1';

      mockPrismaService.revenueMonthLock.upsert.mockResolvedValue({
        id: 'lock-1',
        tenantId,
        branchId,
        month,
        lockedByUserId: userId,
        createdAt: new Date(),
        lockedAt: new Date(),
      });

      const result = await service.create(month, tenantId, branchId, userId);

      expect(result).toBeDefined();
      expect(result.month).toBe(month);
    });

    it('should reject invalid month format', async () => {
      const invalidMonth = '2026-2'; // Missing leading zero

      await expect(
        service.create(invalidMonth, 'tenant-1', 'branch-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should accept valid month format', async () => {
      const validMonth = '2026-02';

      mockPrismaService.revenueMonthLock.upsert.mockResolvedValue({
        id: 'lock-1',
        month: validMonth,
      });

      const result = await service.create(
        validMonth,
        'tenant-1',
        'branch-1',
        'user-1',
      );

      expect(result).toBeDefined();
    });
  });

  describe('checkMonth', () => {
    it('should return locked: true if month is locked', async () => {
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        month: '2026-02',
      });

      const result = await service.checkMonth(
        'tenant-1',
        'branch-1',
        '2026-02',
      );

      expect(result.locked).toBe(true);
    });

    it('should return locked: false if month is not locked', async () => {
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const result = await service.checkMonth(
        'tenant-1',
        'branch-1',
        '2026-02',
      );

      expect(result.locked).toBe(false);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if lock does not exist', async () => {
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('tenant-1', 'branch-1', '2026-02'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete lock successfully if it exists', async () => {
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        month: '2026-02',
      });
      mockPrismaService.revenueMonthLock.delete.mockResolvedValue({
        id: 'lock-1',
      });

      const result = await service.remove('tenant-1', 'branch-1', '2026-02');

      expect(result.success).toBe(true);
    });
  });
});
