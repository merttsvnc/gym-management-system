import { Test, TestingModule } from '@nestjs/testing';
import { RevenueReportService } from './revenue-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Tests for Phase 3: Advanced analytics endpoints
 * - getRevenueTrend
 * - getDailyBreakdown
 * - getPaymentMethodBreakdown
 */
describe('RevenueReportService - Phase 3', () => {
  let service: RevenueReportService;
  let prisma: PrismaService;

  const mockTenantId = 'tenant-123';
  const mockBranchId = 'branch-456';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueReportService,
        {
          provide: PrismaService,
          useValue: {
            payment: {
              findMany: jest.fn(),
              aggregate: jest.fn(),
              groupBy: jest.fn(),
            },
            productSale: {
              findMany: jest.fn(),
              aggregate: jest.fn(),
              groupBy: jest.fn(),
            },
            revenueMonthLock: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<RevenueReportService>(RevenueReportService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getRevenueTrend', () => {
    it('should return correct number of months', async () => {
      // Setup mocks
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.revenueMonthLock, 'findMany').mockResolvedValue([]);

      const result = await service.getRevenueTrend(
        mockTenantId,
        mockBranchId,
        6,
      );

      expect(result).toHaveLength(6);
      expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should return months in ASC order', async () => {
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.revenueMonthLock, 'findMany').mockResolvedValue([]);

      const result = await service.getRevenueTrend(
        mockTenantId,
        mockBranchId,
        3,
      );

      expect(result).toHaveLength(3);
      // Verify months are in ascending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].month >= result[i - 1].month).toBe(true);
      }
    });

    it('should correctly aggregate revenue by month', async () => {
      // Mock payments for different months
      const mockPayments = [
        {
          amount: new Prisma.Decimal(100),
          paidOn: new Date('2026-01-15T10:00:00Z'),
        },
        {
          amount: new Prisma.Decimal(200),
          paidOn: new Date('2026-01-20T10:00:00Z'),
        },
        {
          amount: new Prisma.Decimal(150),
          paidOn: new Date('2026-02-10T10:00:00Z'),
        },
      ];

      const mockProductSales = [
        {
          totalAmount: new Prisma.Decimal(50),
          soldAt: new Date('2026-01-16T10:00:00Z'),
        },
        {
          totalAmount: new Prisma.Decimal(75),
          soldAt: new Date('2026-02-11T10:00:00Z'),
        },
      ];

      jest
        .spyOn(prisma.payment, 'findMany')
        .mockResolvedValue(mockPayments as any);
      jest
        .spyOn(prisma.productSale, 'findMany')
        .mockResolvedValue(mockProductSales as any);
      jest.spyOn(prisma.revenueMonthLock, 'findMany').mockResolvedValue([]);

      const result = await service.getRevenueTrend(
        mockTenantId,
        mockBranchId,
        2,
      );

      // Find January and February in results
      const jan = result.find((r) => r.month.endsWith('-01'));
      const feb = result.find((r) => r.month.endsWith('-02'));

      // January: 300 (payments) + 50 (products) = 350
      expect(jan?.membershipRevenue.toNumber()).toBe(300);
      expect(jan?.productRevenue.toNumber()).toBe(50);
      expect(jan?.totalRevenue.toNumber()).toBe(350);

      // February: 150 (payments) + 75 (products) = 225
      expect(feb?.membershipRevenue.toNumber()).toBe(150);
      expect(feb?.productRevenue.toNumber()).toBe(75);
      expect(feb?.totalRevenue.toNumber()).toBe(225);
    });

    it('should correctly set locked status', async () => {
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);

      // Mock one locked month
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      jest
        .spyOn(prisma.revenueMonthLock, 'findMany')
        .mockResolvedValue([{ month: currentMonth } as any]);

      const result = await service.getRevenueTrend(
        mockTenantId,
        mockBranchId,
        2,
      );

      // At least one month should be locked
      const lockedCount = result.filter((r) => r.locked).length;
      expect(lockedCount).toBeGreaterThanOrEqual(1);
    });

    it('should respect max months limit of 24', async () => {
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.revenueMonthLock, 'findMany').mockResolvedValue([]);

      const result = await service.getRevenueTrend(
        mockTenantId,
        mockBranchId,
        24,
      );

      expect(result).toHaveLength(24);
    });
  });

  describe('getDailyBreakdown', () => {
    it('should include all days in the month', async () => {
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);

      // February 2024 has 29 days (leap year)
      const result = await service.getDailyBreakdown(
        mockTenantId,
        mockBranchId,
        '2024-02',
      );

      expect(result).toHaveLength(29);
      expect(result[0].date).toBe('2024-02-01');
      expect(result[28].date).toBe('2024-02-29');
    });

    it('should include zero revenue days', async () => {
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);

      const result = await service.getDailyBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-01',
      );

      expect(result).toHaveLength(31);

      // All days should have zero revenue
      result.forEach((day) => {
        expect(day.membershipRevenue.toNumber()).toBe(0);
        expect(day.productRevenue.toNumber()).toBe(0);
        expect(day.totalRevenue.toNumber()).toBe(0);
      });
    });

    it('should correctly aggregate revenue by day', async () => {
      const mockPayments = [
        {
          amount: new Prisma.Decimal(100),
          paidOn: new Date('2026-02-15T08:00:00Z'),
        },
        {
          amount: new Prisma.Decimal(200),
          paidOn: new Date('2026-02-15T14:00:00Z'),
        },
        {
          amount: new Prisma.Decimal(150),
          paidOn: new Date('2026-02-16T10:00:00Z'),
        },
      ];

      const mockProductSales = [
        {
          totalAmount: new Prisma.Decimal(50),
          soldAt: new Date('2026-02-15T09:00:00Z'),
        },
      ];

      jest
        .spyOn(prisma.payment, 'findMany')
        .mockResolvedValue(mockPayments as any);
      jest
        .spyOn(prisma.productSale, 'findMany')
        .mockResolvedValue(mockProductSales as any);

      const result = await service.getDailyBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-02',
      );

      // Feb 15: 300 (payments) + 50 (products) = 350
      const feb15 = result.find((r) => r.date === '2026-02-15');
      expect(feb15?.membershipRevenue.toNumber()).toBe(300);
      expect(feb15?.productRevenue.toNumber()).toBe(50);
      expect(feb15?.totalRevenue.toNumber()).toBe(350);

      // Feb 16: 150 (payments) + 0 (products) = 150
      const feb16 = result.find((r) => r.date === '2026-02-16');
      expect(feb16?.membershipRevenue.toNumber()).toBe(150);
      expect(feb16?.productRevenue.toNumber()).toBe(0);
      expect(feb16?.totalRevenue.toNumber()).toBe(150);

      // Feb 17: 0 + 0 = 0
      const feb17 = result.find((r) => r.date === '2026-02-17');
      expect(feb17?.membershipRevenue.toNumber()).toBe(0);
      expect(feb17?.productRevenue.toNumber()).toBe(0);
      expect(feb17?.totalRevenue.toNumber()).toBe(0);
    });

    it('should handle 31-day months correctly', async () => {
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);

      const result = await service.getDailyBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-01',
      );

      expect(result).toHaveLength(31);
      expect(result[30].date).toBe('2026-01-31');
    });

    it('should handle 30-day months correctly', async () => {
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'findMany').mockResolvedValue([]);

      const result = await service.getDailyBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-04',
      );

      expect(result).toHaveLength(30);
      expect(result[29].date).toBe('2026-04-30');
    });
  });

  describe('getPaymentMethodBreakdown', () => {
    it('should group membership payments by method', async () => {
      const mockGroupedPayments = [
        {
          paymentMethod: 'CASH',
          _sum: { amount: new Prisma.Decimal(500) },
        },
        {
          paymentMethod: 'CREDIT_CARD',
          _sum: { amount: new Prisma.Decimal(1200) },
        },
      ];

      jest
        .spyOn(prisma.payment, 'groupBy')
        .mockResolvedValue(mockGroupedPayments as any);
      jest.spyOn(prisma.productSale, 'groupBy').mockResolvedValue([]);

      const result = await service.getPaymentMethodBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-02',
      );

      expect(result.membershipByMethod).toHaveLength(2);

      const cash = result.membershipByMethod.find(
        (m) => m.paymentMethod === 'CASH',
      );
      expect(cash?.amount.toNumber()).toBe(500);

      const card = result.membershipByMethod.find(
        (m) => m.paymentMethod === 'CREDIT_CARD',
      );
      expect(card?.amount.toNumber()).toBe(1200);
    });

    it('should group product sales by method', async () => {
      const mockGroupedProducts = [
        {
          paymentMethod: 'CASH',
          _sum: { totalAmount: new Prisma.Decimal(250) },
        },
        {
          paymentMethod: 'BANK_TRANSFER',
          _sum: { totalAmount: new Prisma.Decimal(800) },
        },
      ];

      jest.spyOn(prisma.payment, 'groupBy').mockResolvedValue([]);
      jest
        .spyOn(prisma.productSale, 'groupBy')
        .mockResolvedValue(mockGroupedProducts as any);

      const result = await service.getPaymentMethodBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-02',
      );

      expect(result.productSalesByMethod).toHaveLength(2);

      const cash = result.productSalesByMethod.find(
        (m) => m.paymentMethod === 'CASH',
      );
      expect(cash?.amount.toNumber()).toBe(250);

      const transfer = result.productSalesByMethod.find(
        (m) => m.paymentMethod === 'BANK_TRANSFER',
      );
      expect(transfer?.amount.toNumber()).toBe(800);
    });

    it('should handle empty results', async () => {
      jest.spyOn(prisma.payment, 'groupBy').mockResolvedValue([]);
      jest.spyOn(prisma.productSale, 'groupBy').mockResolvedValue([]);

      const result = await service.getPaymentMethodBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-02',
      );

      expect(result.membershipByMethod).toHaveLength(0);
      expect(result.productSalesByMethod).toHaveLength(0);
    });

    it('should handle null sums correctly', async () => {
      const mockGroupedPayments = [
        {
          paymentMethod: 'CASH',
          _sum: { amount: null },
        },
      ];

      jest
        .spyOn(prisma.payment, 'groupBy')
        .mockResolvedValue(mockGroupedPayments as any);
      jest.spyOn(prisma.productSale, 'groupBy').mockResolvedValue([]);

      const result = await service.getPaymentMethodBreakdown(
        mockTenantId,
        mockBranchId,
        '2026-02',
      );

      expect(result.membershipByMethod).toHaveLength(1);
      expect(result.membershipByMethod[0].amount.toNumber()).toBe(0);
    });
  });
});
