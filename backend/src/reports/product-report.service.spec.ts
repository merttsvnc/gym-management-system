import { Test, TestingModule } from '@nestjs/testing';
import { ProductReportService } from './product-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Tests for Phase 3: Top selling products endpoint
 */
describe('ProductReportService - Phase 3', () => {
  let service: ProductReportService;
  let prisma: PrismaService;

  const mockTenantId = 'tenant-123';
  const mockBranchId = 'branch-456';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductReportService,
        {
          provide: PrismaService,
          useValue: {
            productSaleItem: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ProductReportService>(ProductReportService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getTopSellingProducts', () => {
    it('should group catalog products by productId', async () => {
      const mockLineItems = [
        {
          productId: 'product-1',
          customName: null,
          quantity: 5,
          lineTotal: new Prisma.Decimal(500),
          product: { name: 'Protein Powder' },
        },
        {
          productId: 'product-1',
          customName: null,
          quantity: 3,
          lineTotal: new Prisma.Decimal(300),
          product: { name: 'Protein Powder' },
        },
        {
          productId: 'product-2',
          customName: null,
          quantity: 10,
          lineTotal: new Prisma.Decimal(200),
          product: { name: 'Energy Drink' },
        },
      ];

      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue(mockLineItems as any);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
        10,
      );

      expect(result).toHaveLength(2);

      const proteinPowder = result.find((p) => p.productId === 'product-1');
      expect(proteinPowder?.name).toBe('Protein Powder');
      expect(proteinPowder?.quantity).toBe(8); // 5 + 3
      expect(proteinPowder?.revenue.toNumber()).toBe(800); // 500 + 300

      const energyDrink = result.find((p) => p.productId === 'product-2');
      expect(energyDrink?.name).toBe('Energy Drink');
      expect(energyDrink?.quantity).toBe(10);
      expect(energyDrink?.revenue.toNumber()).toBe(200);
    });

    it('should group custom products by customName', async () => {
      const mockLineItems = [
        {
          productId: null,
          customName: 'Custom Shaker',
          quantity: 2,
          lineTotal: new Prisma.Decimal(100),
          product: null,
        },
        {
          productId: null,
          customName: 'Custom Shaker',
          quantity: 3,
          lineTotal: new Prisma.Decimal(150),
          product: null,
        },
        {
          productId: null,
          customName: 'Custom Towel',
          quantity: 5,
          lineTotal: new Prisma.Decimal(200),
          product: null,
        },
      ];

      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue(mockLineItems as any);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
        10,
      );

      expect(result).toHaveLength(2);

      const shaker = result.find((p) => p.name === 'Custom Shaker');
      expect(shaker?.productId).toBeNull();
      expect(shaker?.quantity).toBe(5); // 2 + 3
      expect(shaker?.revenue.toNumber()).toBe(250); // 100 + 150

      const towel = result.find((p) => p.name === 'Custom Towel');
      expect(towel?.productId).toBeNull();
      expect(towel?.quantity).toBe(5);
      expect(towel?.revenue.toNumber()).toBe(200);
    });

    it('should handle mix of catalog and custom products', async () => {
      const mockLineItems = [
        {
          productId: 'product-1',
          customName: null,
          quantity: 10,
          lineTotal: new Prisma.Decimal(1000),
          product: { name: 'Protein Powder' },
        },
        {
          productId: null,
          customName: 'Custom Shaker',
          quantity: 5,
          lineTotal: new Prisma.Decimal(250),
          product: null,
        },
      ];

      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue(mockLineItems as any);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
        10,
      );

      expect(result).toHaveLength(2);

      // Should have both catalog and custom products
      const catalog = result.find((p) => p.productId !== null);
      const custom = result.find((p) => p.productId === null);

      expect(catalog).toBeDefined();
      expect(custom).toBeDefined();
    });

    it('should sort products by revenue DESC', async () => {
      const mockLineItems = [
        {
          productId: 'product-1',
          customName: null,
          quantity: 5,
          lineTotal: new Prisma.Decimal(200), // Low revenue
          product: { name: 'Energy Drink' },
        },
        {
          productId: 'product-2',
          customName: null,
          quantity: 10,
          lineTotal: new Prisma.Decimal(1500), // High revenue
          product: { name: 'Protein Powder' },
        },
        {
          productId: 'product-3',
          customName: null,
          quantity: 8,
          lineTotal: new Prisma.Decimal(800), // Medium revenue
          product: { name: 'BCAA' },
        },
      ];

      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue(mockLineItems as any);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
        10,
      );

      expect(result).toHaveLength(3);

      // Verify order: Protein Powder (1500) > BCAA (800) > Energy Drink (200)
      expect(result[0].name).toBe('Protein Powder');
      expect(result[0].revenue.toNumber()).toBe(1500);

      expect(result[1].name).toBe('BCAA');
      expect(result[1].revenue.toNumber()).toBe(800);

      expect(result[2].name).toBe('Energy Drink');
      expect(result[2].revenue.toNumber()).toBe(200);
    });

    it('should respect limit parameter', async () => {
      const mockLineItems = Array.from({ length: 20 }, (_, i) => ({
        productId: `product-${i}`,
        customName: null,
        quantity: i + 1,
        lineTotal: new Prisma.Decimal((i + 1) * 100),
        product: { name: `Product ${i}` },
      }));

      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue(mockLineItems as any);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
        5, // Limit to 5
      );

      expect(result).toHaveLength(5);
    });

    it('should handle empty results', async () => {
      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue([]);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
        10,
      );

      expect(result).toHaveLength(0);
    });

    it('should use default limit of 10', async () => {
      const mockLineItems = Array.from({ length: 15 }, (_, i) => ({
        productId: `product-${i}`,
        customName: null,
        quantity: i + 1,
        lineTotal: new Prisma.Decimal((i + 1) * 100),
        product: { name: `Product ${i}` },
      }));

      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue(mockLineItems as any);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
      );

      expect(result).toHaveLength(10); // Default limit
    });

    it('should handle products with missing names gracefully', async () => {
      const mockLineItems = [
        {
          productId: 'product-1',
          customName: null,
          quantity: 5,
          lineTotal: new Prisma.Decimal(500),
          product: null, // Missing product data
        },
        {
          productId: null,
          customName: null, // Missing custom name
          quantity: 3,
          lineTotal: new Prisma.Decimal(300),
          product: null,
        },
      ];

      jest.spyOn(prisma.productSaleItem, 'findMany').mockResolvedValue(mockLineItems as any);

      const result = await service.getTopSellingProducts(
        mockTenantId,
        mockBranchId,
        '2026-02',
        10,
      );

      expect(result).toHaveLength(2);

      // Should have fallback names
      expect(result[0].name).toBe('Unknown Product');
      expect(result[1].name).toBe('Unknown Custom Product');
    });
  });
});
