import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('ProductsService', () => {
  let service: ProductsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    it('should return products scoped by tenantId and branchId', async () => {
      const tenantId = 'tenant-1';
      const branchId = 'branch-1';
      const mockProducts = [
        {
          id: 'product-1',
          name: 'Protein',
          defaultPrice: new Prisma.Decimal(100),
          tenantId,
          branchId,
          isActive: true,
          category: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.product.findMany.mockResolvedValue(mockProducts);

      const result = await service.findAll({
        tenantId,
        branchId,
        isActive: true,
      });

      expect(result).toEqual(mockProducts);
      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          branchId,
          isActive: true,
        },
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const mockDto = {
      name: 'Protein Powder',
      defaultPrice: 250,
      category: 'Supplements',
    };

    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    it('should create a product successfully', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);
      mockPrismaService.product.create.mockResolvedValue({
        id: 'product-1',
        ...mockDto,
        defaultPrice: new Prisma.Decimal(250),
        tenantId,
        branchId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(mockDto, tenantId, branchId);

      expect(result).toBeDefined();
      expect(result.name).toBe(mockDto.name);
      expect(mockPrismaService.product.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          branchId,
          name: { equals: mockDto.name, mode: 'insensitive' },
        },
      });
    });

    it('should throw ConflictException if product name already exists', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({
        id: 'existing-product',
        name: 'Protein Powder',
      });

      await expect(service.create(mockDto, tenantId, branchId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a product if found', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Protein Powder',
        defaultPrice: new Prisma.Decimal(250),
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        isActive: true,
      };

      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.findOne('product-1', 'tenant-1', 'branch-1');

      expect(result).toEqual(mockProduct);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('nonexistent', 'tenant-1', 'branch-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should enforce name uniqueness when updating', async () => {
      mockPrismaService.product.findFirst
        .mockResolvedValueOnce({ id: 'product-1', name: 'Old Name' }) // findOne check
        .mockResolvedValueOnce({ id: 'product-2', name: 'New Name' }); // duplicate check

      await expect(
        service.update(
          'product-1',
          { name: 'New Name' },
          'tenant-1',
          'branch-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should refuse cross-tenant/branch update (product not found)', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          'product-other-tenant',
          { name: 'New Name' },
          'tenant-1',
          'branch-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should set isActive=false (soft delete)', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Protein',
        defaultPrice: new Prisma.Decimal(100),
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        isActive: true,
        category: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);
      mockPrismaService.product.update.mockResolvedValue({
        ...mockProduct,
        isActive: false,
      });

      await service.remove('product-1', 'tenant-1', 'branch-1');

      expect(mockPrismaService.product.update).toHaveBeenCalledWith({
        where: {
          id_tenantId_branchId: {
            id: 'product-1',
            tenantId: 'tenant-1',
            branchId: 'branch-1',
          },
        },
        data: { isActive: false },
      });
    });
  });
});
