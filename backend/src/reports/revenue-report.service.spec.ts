import { Test, TestingModule } from '@nestjs/testing';
import { RevenueReportService } from './revenue-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('RevenueReportService', () => {
  let service: RevenueReportService;

  // Mock PrismaService
  const mockPrismaService = {
    payment: {
      aggregate: jest.fn(),
    },
    productSale: {
      aggregate: jest.fn(),
    },
    revenueMonthLock: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueReportService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RevenueReportService>(RevenueReportService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMonthlyRevenue', () => {
    const tenantId = 'tenant-123';
    const branchId = 'branch-456';
    const month = '2026-02';

    it('should compute correct month range in UTC', async () => {
      // Mock empty results
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await service.getMonthlyRevenue(tenantId, branchId, month);

      // Verify date range for membership revenue query
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const paymentWhere =
        mockPrismaService.payment.aggregate.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const startDate = paymentWhere.paidOn.gte;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const endDate = paymentWhere.paidOn.lt;

      // Start: 2026-02-01 00:00:00.000Z
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      expect(startDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      // End: 2026-03-01 00:00:00.000Z (first day of next month)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      expect(endDate.toISOString()).toBe('2026-03-01T00:00:00.000Z');

      // Verify date range for product sales query
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const productSaleWhere =
        mockPrismaService.productSale.aggregate.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      expect(productSaleWhere.soldAt.gte.toISOString()).toBe(
        '2026-02-01T00:00:00.000Z',
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      expect(productSaleWhere.soldAt.lt.toISOString()).toBe(
        '2026-03-01T00:00:00.000Z',
      );
    });

    it('should sum membership revenue correctly', async () => {
      // Mock membership payments totaling 125000.00
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('125000.00') },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const result = await service.getMonthlyRevenue(tenantId, branchId, month);

      expect(result.membershipRevenue.toFixed(2)).toBe('125000.00');
      expect(result.productRevenue.toFixed(2)).toBe('0.00');
      expect(result.totalRevenue.toFixed(2)).toBe('125000.00');

      // Verify query includes correct filters
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const paymentWhere =
        mockPrismaService.payment.aggregate.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentWhere.tenantId).toBe(tenantId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentWhere.branchId).toBe(branchId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentWhere.isCorrected).toBe(false); // Exclude corrected payments
    });

    it('should sum product sales revenue correctly', async () => {
      // Mock product sales totaling 18250.50
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: new Prisma.Decimal('18250.50') },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const result = await service.getMonthlyRevenue(tenantId, branchId, month);

      expect(result.membershipRevenue.toFixed(2)).toBe('0.00');
      expect(result.productRevenue.toFixed(2)).toBe('18250.50');
      expect(result.totalRevenue.toFixed(2)).toBe('18250.50');

      // Verify query includes correct filters
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const productSaleWhere =
        mockPrismaService.productSale.aggregate.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(productSaleWhere.tenantId).toBe(tenantId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(productSaleWhere.branchId).toBe(branchId);
    });

    it('should calculate total revenue as sum of membership + product revenue', async () => {
      // Mock both revenue sources
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('125000.00') },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: new Prisma.Decimal('18250.00') },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const result = await service.getMonthlyRevenue(tenantId, branchId, month);

      expect(result.membershipRevenue.toFixed(2)).toBe('125000.00');
      expect(result.productRevenue.toFixed(2)).toBe('18250.00');
      // Total: 125000 + 18250 = 143250
      expect(result.totalRevenue.toFixed(2)).toBe('143250.00');
      expect(result.locked).toBe(false);
    });

    it('should return locked=true when RevenueMonthLock exists', async () => {
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('100.00') },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: new Prisma.Decimal('50.00') },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue({
        id: 'lock-123',
        tenantId,
        branchId,
        month,
        lockedAt: new Date(),
        lockedByUserId: 'user-123',
        createdAt: new Date(),
      });

      const result = await service.getMonthlyRevenue(tenantId, branchId, month);

      expect(result.locked).toBe(true);

      // Verify lock query
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const lockWhere =
        mockPrismaService.revenueMonthLock.findUnique.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(lockWhere.tenantId_branchId_month).toEqual({
        tenantId,
        branchId,
        month,
      });
    });

    it('should return locked=false when RevenueMonthLock does not exist', async () => {
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const result = await service.getMonthlyRevenue(tenantId, branchId, month);

      expect(result.locked).toBe(false);
    });

    it('should return 0.00 for all revenue when no data exists', async () => {
      // Mock null aggregate results (no payments or sales)
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const result = await service.getMonthlyRevenue(tenantId, branchId, month);

      expect(result.membershipRevenue.toFixed(2)).toBe('0.00');
      expect(result.productRevenue.toFixed(2)).toBe('0.00');
      expect(result.totalRevenue.toFixed(2)).toBe('0.00');
      expect(result.locked).toBe(false);
    });

    it('should handle December month correctly (next month = January of next year)', async () => {
      const decemberMonth = '2026-12';

      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await service.getMonthlyRevenue(tenantId, branchId, decemberMonth);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const paymentWhere =
        mockPrismaService.payment.aggregate.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const startDate = paymentWhere.paidOn.gte;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const endDate = paymentWhere.paidOn.lt;

      // Start: 2026-12-01 00:00:00.000Z
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      expect(startDate.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      // End: 2027-01-01 00:00:00.000Z (January of next year)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      expect(endDate.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('should use tenant+branch scope for all queries', async () => {
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await service.getMonthlyRevenue(tenantId, branchId, month);

      // Verify Payment query scope
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const paymentWhere =
        mockPrismaService.payment.aggregate.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentWhere.tenantId).toBe(tenantId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentWhere.branchId).toBe(branchId);

      // Verify ProductSale query scope
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const productSaleWhere =
        mockPrismaService.productSale.aggregate.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(productSaleWhere.tenantId).toBe(tenantId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(productSaleWhere.branchId).toBe(branchId);

      // Verify RevenueMonthLock query scope
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const lockWhere =
        mockPrismaService.revenueMonthLock.findUnique.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(lockWhere.tenantId_branchId_month.tenantId).toBe(tenantId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(lockWhere.tenantId_branchId_month.branchId).toBe(branchId);
    });

    it('should handle large revenue amounts with Decimal precision', async () => {
      // Test with large amounts that might cause floating point errors
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('999999.99') },
      });
      mockPrismaService.productSale.aggregate.mockResolvedValue({
        _sum: { totalAmount: new Prisma.Decimal('888888.88') },
      });
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const result = await service.getMonthlyRevenue(tenantId, branchId, month);

      expect(result.membershipRevenue.toFixed(2)).toBe('999999.99');
      expect(result.productRevenue.toFixed(2)).toBe('888888.88');
      // Total: 999999.99 + 888888.88 = 1888888.87
      expect(result.totalRevenue.toFixed(2)).toBe('1888888.87');
    });
  });
});
