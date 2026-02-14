import { Test, TestingModule } from '@nestjs/testing';
import { RevenueReportService } from './revenue-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Integration test for RevenueReportService SQL queries
 *
 * This test validates that raw SQL queries use correct camelCase column names
 * matching the Prisma schema (without @map directives).
 *
 * Required for regression testing after fixing:
 * - ProductSale: soldAt, totalAmount, tenantId, branchId
 * - Payment: paidOn, amount, tenantId, branchId, isCorrected
 */
describe('RevenueReportService SQL Integration', () => {
  let service: RevenueReportService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RevenueReportService, PrismaService],
    }).compile();

    service = module.get<RevenueReportService>(RevenueReportService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getDailyBreakdown - SQL column names', () => {
    it('should execute raw SQL query without column name errors', async () => {
      // This test validates that SQL uses correct camelCase identifiers
      // We don't need actual data - just verify the query doesn't throw Prisma error 42703
      const tenantId = 'test-tenant-nonexistent';
      const branchId = 'test-branch-nonexistent';
      const month = '2026-02';

      // If SQL has wrong column names, this will throw:
      // PrismaClientKnownRequestError: column "sold_at" does not exist (code 42703)
      // With correct column names ("soldAt"), query succeeds (returns empty array)
      const result = await service.getDailyBreakdown(tenantId, branchId, month);

      // Should return 28 days for February 2026 (non-leap year)
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(28);

      // Each day should have zero revenue for nonexistent tenant
      result.forEach((day) => {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('membershipRevenue');
        expect(day).toHaveProperty('productRevenue');
        expect(day).toHaveProperty('totalRevenue');
        expect(day.membershipRevenue).toEqual(new Prisma.Decimal(0));
        expect(day.productRevenue).toEqual(new Prisma.Decimal(0));
        expect(day.totalRevenue).toEqual(new Prisma.Decimal(0));
      });
    });

    it('should return correct daily breakdown with test data', async () => {
      // Create test tenant, branch, and sale data
      const testTenantId = `test-tenant-${Date.now()}`;
      const testBranchId = `test-branch-${Date.now()}`;

      // Create test tenant
      const tenant = await prisma.tenant.create({
        data: {
          id: testTenantId,
          name: 'Test Tenant SQL Fix',
          slug: `test-tenant-sql-${Date.now()}`,
          billingStatus: 'ACTIVE',
        },
      });

      // Create test branch
      const branch = await prisma.branch.create({
        data: {
          id: testBranchId,
          tenantId: tenant.id,
          name: 'Test Branch',
          address: 'Test Address',
        },
      });

      try {
        // Create product sale with soldAt, totalAmount
        const soldAt = new Date('2026-02-15T10:30:00Z');
        await prisma.productSale.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            soldAt: soldAt,
            totalAmount: new Prisma.Decimal('150.50'),
            paymentMethod: 'CREDIT_CARD',
          },
        });

        // Create payment with paidOn
        const paidOn = new Date('2026-02-15T00:00:00Z'); // Start of day UTC
        await prisma.payment.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            memberId: 'dummy-member-id', // Won't validate FK in test
            amount: new Prisma.Decimal('200.00'),
            paidOn: paidOn,
            paymentMethod: 'CASH',
            createdBy: 'test-user',
          },
        });

        // Query daily breakdown for February 2026
        const result = await service.getDailyBreakdown(
          tenant.id,
          branch.id,
          '2026-02',
        );

        expect(result.length).toBe(28);

        // Find the day with revenue (2026-02-15 in Europe/Istanbul timezone)
        // UTC 10:30:00Z in Istanbul is 13:30:00 (same day)
        const dayWithRevenue = result.find((d) => d.date === '2026-02-15');
        expect(dayWithRevenue).toBeDefined();
        expect(dayWithRevenue!.productRevenue.toFixed(2)).toBe('150.50');
        expect(dayWithRevenue!.membershipRevenue.toFixed(2)).toBe('200.00');
        expect(dayWithRevenue!.totalRevenue.toFixed(2)).toBe('350.50');
      } finally {
        // Cleanup: Delete test data
        await prisma.productSale.deleteMany({
          where: { tenantId: tenant.id },
        });
        await prisma.payment.deleteMany({ where: { tenantId: tenant.id } });
        await prisma.branch.delete({ where: { id: branch.id } });
        await prisma.tenant.delete({ where: { id: tenant.id } });
      }
    });
  });
});
