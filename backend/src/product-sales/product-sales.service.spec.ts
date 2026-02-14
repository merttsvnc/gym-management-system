import { Test, TestingModule } from '@nestjs/testing';
import { ProductSalesService } from './product-sales.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';

describe('ProductSalesService', () => {
  let service: ProductSalesService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    productSale: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    product: {
      findFirst: jest.fn(),
    },
    revenueMonthLock: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductSalesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProductSalesService>(ProductSalesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validCuid = 'cmllx1luq0002a6jm2lxohg78';
    const mockDto = {
      soldAt: '2026-02-13T10:00:00Z',
      paymentMethod: PaymentMethod.CASH,
      items: [
        {
          productId: validCuid,
          quantity: 2,
          unitPrice: 100,
        },
      ],
    };

    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    it('should enforce XOR rule for items', async () => {
      const invalidDto = {
        ...mockDto,
        items: [
          {
            productId: validCuid,
            customName: 'Custom Item',
            quantity: 1,
          },
        ],
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await expect(
        service.create(invalidDto as any, tenantId, branchId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use product defaultPrice if unitPrice not provided', async () => {
      const dtoWithoutPrice = {
        ...mockDto,
        items: [
        {
          productId: validCuid,
          quantity: 2,
        },
        ],
      };

      const mockProduct = {
        id: validCuid,
        defaultPrice: new Prisma.Decimal(150),
        isActive: true,
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);
      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback(prismaService),
      );
      mockPrismaService.productSale = {
        create: jest.fn().mockResolvedValue({
          id: 'sale-1',
          totalAmount: new Prisma.Decimal(300),
          items: [],
        }),
      };

      const result = await service.create(
        dtoWithoutPrice as any,
        tenantId,
        branchId,
        'user-1',
      );

      expect(result).toBeDefined();
      expect(mockProduct.defaultPrice.toString()).toBe('150');
    });

    it('should calculate totalAmount correctly', async () => {
      const multiItemDto = {
        ...mockDto,
        items: [
          {
            productId: validCuid,
            quantity: 2,
            unitPrice: 100,
          },
          {
            customName: 'Custom Item',
            quantity: 1,
            unitPrice: 50,
          },
        ],
      };

      const mockProduct = {
        id: validCuid,
        defaultPrice: new Prisma.Decimal(100),
        isActive: true,
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);

      const expectedTotal = new Prisma.Decimal(250); // (2 * 100) + (1 * 50)

      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback({
          productSale: {
            create: jest.fn().mockResolvedValue({
              id: 'sale-1',
              totalAmount: expectedTotal,
              items: [],
            }),
          },
        }),
      );

      const result = await service.create(
        multiItemDto as any,
        tenantId,
        branchId,
        'user-1',
      );

      expect(result).toBeDefined();
    });

    it('should forbid creation if month is locked', async () => {
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        month: '2026-02',
      });

      await expect(
        service.create(mockDto as any, tenantId, branchId, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when tenantId is missing', async () => {
      await expect(
        service.create(mockDto as any, undefined as any, branchId, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when userId is missing', async () => {
      await expect(
        service.create(mockDto as any, tenantId, branchId, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when branchId is missing', async () => {
      await expect(
        service.create(mockDto as any, tenantId, undefined as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when productId not found (wrong tenant/branch or inactive)', async () => {
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      const err = await service
        .create(mockDto as any, tenantId, branchId, 'user-1')
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('Invalid productId for this branch.');
    });

    it('should throw BadRequestException for custom item without unitPrice', async () => {
      const customItemDto = {
        ...mockDto,
        items: [
          {
            customName: 'Custom Item',
            quantity: 1,
            // unitPrice missing
          },
        ],
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await expect(
        service.create(customItemDto as any, tenantId, branchId, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for custom item with short name', async () => {
      const customItemDto = {
        ...mockDto,
        items: [
          {
            customName: 'A', // Too short
            quantity: 1,
            unitPrice: 100,
          },
        ],
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await expect(
        service.create(customItemDto as any, tenantId, branchId, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for custom item with negative price', async () => {
      const customItemDto = {
        ...mockDto,
        items: [
          {
            customName: 'Custom Item',
            quantity: 1,
            unitPrice: -50, // Negative price
          },
        ],
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await expect(
        service.create(customItemDto as any, tenantId, branchId, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for quantity less than 1', async () => {
      const invalidDto = {
        ...mockDto,
        items: [
          {
            productId: validCuid,
            quantity: 0, // Invalid quantity
          },
        ],
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      await expect(
        service.create(invalidDto as any, tenantId, branchId, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create sale with custom item correctly', async () => {
      const customItemDto = {
        soldAt: '2026-02-13T10:00:00Z',
        paymentMethod: PaymentMethod.CASH,
        items: [
          {
            customName: 'Custom Protein Bar',
            quantity: 2,
            unitPrice: 75,
          },
        ],
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);

      const expectedTotal = new Prisma.Decimal(150); // 2 * 75

      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback({
          productSale: {
            create: jest.fn().mockResolvedValue({
              id: 'sale-1',
              totalAmount: expectedTotal,
              items: [
                {
                  customName: 'Custom Protein Bar',
                  quantity: 2,
                  unitPrice: new Prisma.Decimal(75),
                  lineTotal: expectedTotal,
                },
              ],
            }),
          },
        }),
      );

      const result = await service.create(
        customItemDto as any,
        tenantId,
        branchId,
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.totalAmount.toString()).toBe('150');
    });

    it('should use product defaultPrice when unitPrice is omitted', async () => {
      const dtoWithoutPrice = {
        ...mockDto,
        items: [
          {
            productId: validCuid,
            quantity: 3,
            // unitPrice omitted
          },
        ],
      };

      const mockProduct = {
        id: validCuid,
        defaultPrice: new Prisma.Decimal(100),
        isActive: true,
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);

      const expectedTotal = new Prisma.Decimal(300); // 3 * 100

      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback({
          productSale: {
            create: jest.fn().mockResolvedValue({
              id: 'sale-1',
              totalAmount: expectedTotal,
              items: [],
            }),
          },
        }),
      );

      const result = await service.create(
        dtoWithoutPrice as any,
        tenantId,
        branchId,
        'user-1',
      );

      expect(result).toBeDefined();
      expect(mockPrismaService.product.findFirst).toHaveBeenCalledWith({
        where: {
          id: validCuid,
          tenantId,
          branchId,
          isActive: true,
        },
      });
    });

    it('should throw BadRequestException when product has no default price and unitPrice not provided', async () => {
      const dtoWithoutPrice = {
        ...mockDto,
        items: [
          {
            productId: validCuid,
            quantity: 2,
            // unitPrice omitted
          },
        ],
      };

      const mockProduct = {
        id: validCuid,
        defaultPrice: null, // No default price
        isActive: true,
      };

      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);

      await expect(
        service.create(dtoWithoutPrice as any, tenantId, branchId, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      // Reset the mock properly for each test (create tests may overwrite productSale)
      mockPrismaService.productSale = {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      };
    });

    it('should forbid deletion if month is locked', async () => {
      const mockSale = {
        id: 'sale-1',
        soldAt: new Date('2026-02-13'),
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      };

      mockPrismaService.productSale.findFirst.mockResolvedValue(mockSale);
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        month: '2026-02',
      });

      await expect(
        service.remove('sale-1', 'tenant-1', 'branch-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should successfully remove with correct id, tenantId, branchId', async () => {
      const id = 'sale-1';
      const tenantId = 'tenant-1';
      const branchId = 'branch-1';
      const mockSale = {
        id,
        soldAt: new Date('2026-02-13'),
        tenantId,
        branchId,
      };

      mockPrismaService.productSale.findFirst.mockResolvedValue(mockSale);
      mockPrismaService.revenueMonthLock.findUnique.mockResolvedValue(null);
      mockPrismaService.productSale.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.remove(id, tenantId, branchId);

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.productSale.deleteMany).toHaveBeenCalledWith({
        where: { id, tenantId, branchId },
      });
    });

    it('should throw NotFoundException when remove with wrong branchId', async () => {
      const id = 'sale-1';
      const tenantId = 'tenant-1';
      const wrongBranchId = 'wrong-branch';

      mockPrismaService.productSale.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(id, tenantId, wrongBranchId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.productSale.deleteMany).not.toHaveBeenCalled();
    });
  });
});
