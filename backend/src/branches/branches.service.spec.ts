/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanService } from '../plan/plan.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchListQueryDto } from './dto/branch-list-query.dto';

describe('BranchesService', () => {
  let service: BranchesService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    branch: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockPlanService = {
    getTenantPlan: jest.fn().mockResolvedValue({
      key: 'SINGLE',
      maxBranches: 3,
      hasClasses: false,
      hasPayments: false,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PlanService,
          useValue: mockPlanService,
        },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const tenantId = 'tenant-123';
  const branchId = 'branch-123';
  const mockBranch = {
    id: branchId,
    tenantId,
    name: 'Main Branch',
    address: '123 Main St',
    isDefault: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };

  describe('listBranches', () => {
    it('should return paginated branches for tenant', async () => {
      const query: BranchListQueryDto = { page: 1, limit: 20 };
      const mockBranches = [mockBranch];
      mockPrismaService.branch.findMany.mockResolvedValue(mockBranches);
      mockPrismaService.branch.count.mockResolvedValue(1);

      const result = await service.listBranches(tenantId, query);

      expect(result.data).toEqual(mockBranches);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(prismaService.branch.findMany).toHaveBeenCalledWith({
        where: { tenantId, isActive: true },
        skip: 0,
        take: 20,
        orderBy: { name: 'asc' },
      });
    });

    it('should filter archived branches by default', async () => {
      const query: BranchListQueryDto = {};
      mockPrismaService.branch.findMany.mockResolvedValue([]);
      mockPrismaService.branch.count.mockResolvedValue(0);

      await service.listBranches(tenantId, query);

      expect(prismaService.branch.findMany).toHaveBeenCalledWith({
        where: { tenantId, isActive: true },
        skip: 0,
        take: 20,
        orderBy: { name: 'asc' },
      });
    });

    it('should include archived branches when requested', async () => {
      const query: BranchListQueryDto = { includeArchived: true };
      mockPrismaService.branch.findMany.mockResolvedValue([]);
      mockPrismaService.branch.count.mockResolvedValue(0);

      await service.listBranches(tenantId, query);

      expect(prismaService.branch.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        skip: 0,
        take: 20,
        orderBy: { name: 'asc' },
      });
    });

    it('should enforce tenant isolation', async () => {
      const query: BranchListQueryDto = {};
      mockPrismaService.branch.findMany.mockResolvedValue([]);
      mockPrismaService.branch.count.mockResolvedValue(0);

      await service.listBranches(tenantId, query);

      expect(prismaService.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        }),
      );
    });
  });

  describe('getBranchById', () => {
    it('should return branch when found and belongs to tenant', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);

      const result = await service.getBranchById(tenantId, branchId);

      expect(result).toEqual(mockBranch);
      expect(prismaService.branch.findUnique).toHaveBeenCalledWith({
        where: { id: branchId },
      });
    });

    it('should throw NotFoundException when branch not found', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(null);

      await expect(service.getBranchById(tenantId, branchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when branch belongs to different tenant', async () => {
      const otherTenantBranch = { ...mockBranch, tenantId: 'other-tenant' };
      mockPrismaService.branch.findUnique.mockResolvedValue(otherTenantBranch);

      await expect(service.getBranchById(tenantId, branchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createBranch', () => {
    const createDto: CreateBranchDto = {
      name: 'New Branch',
      address: '456 New St',
    };

    it('should create branch successfully', async () => {
      const newBranch = { ...mockBranch, ...createDto, isDefault: false };
      mockPrismaService.branch.findFirst.mockResolvedValue(null);
      mockPrismaService.branch.count.mockResolvedValue(1);
      mockPrismaService.branch.create.mockResolvedValue(newBranch);

      const result = await service.createBranch(tenantId, createDto);

      expect(result).toEqual(newBranch);
      expect(prismaService.branch.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          ...createDto,
          isDefault: false,
          isActive: true,
        },
      });
    });

    it('should set first branch as default', async () => {
      const newBranch = { ...mockBranch, ...createDto, isDefault: true };
      mockPrismaService.branch.findFirst.mockResolvedValue(null);
      mockPrismaService.branch.count.mockResolvedValue(0);
      mockPrismaService.branch.create.mockResolvedValue(newBranch);

      const result = await service.createBranch(tenantId, createDto);

      expect(prismaService.branch.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          ...createDto,
          isDefault: true,
          isActive: true,
        },
      });
      expect(result.isDefault).toBe(true);
    });

    it('should throw ConflictException for duplicate branch name', async () => {
      mockPrismaService.branch.findFirst.mockResolvedValue(mockBranch);

      await expect(service.createBranch(tenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createBranch(tenantId, createDto)).rejects.toThrow(
        'Branch name already exists for this tenant',
      );
    });

    it('should enforce tenant isolation', async () => {
      mockPrismaService.branch.findFirst.mockResolvedValue(null);
      mockPrismaService.branch.count.mockResolvedValue(0);
      mockPrismaService.branch.create.mockResolvedValue(mockBranch);

      await service.createBranch(tenantId, createDto);

      expect(prismaService.branch.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ tenantId }),
      });
    });
  });

  describe('updateBranch', () => {
    const updateDto: UpdateBranchDto = {
      name: 'Updated Branch Name',
    };

    it('should update branch successfully', async () => {
      const updatedBranch = { ...mockBranch, ...updateDto };
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.branch.findFirst.mockResolvedValue(null);
      mockPrismaService.branch.update.mockResolvedValue(updatedBranch);

      const result = await service.updateBranch(tenantId, branchId, updateDto);

      expect(result).toEqual(updatedBranch);
      expect(prismaService.branch.update).toHaveBeenCalledWith({
        where: { id: branchId },
        data: updateDto,
      });
    });

    it('should throw NotFoundException if branch not found', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.updateBranch(tenantId, branchId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if updating archived branch', async () => {
      const archivedBranch = { ...mockBranch, isActive: false };
      mockPrismaService.branch.findUnique.mockResolvedValue(archivedBranch);

      await expect(
        service.updateBranch(tenantId, branchId, updateDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateBranch(tenantId, branchId, updateDto),
      ).rejects.toThrow('Cannot update archived branch');
    });

    it('should throw ConflictException for duplicate name', async () => {
      const existingBranch = { ...mockBranch, id: 'other-branch-id' };
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.branch.findFirst.mockResolvedValue(existingBranch);

      await expect(
        service.updateBranch(tenantId, branchId, updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow same name (case-insensitive)', async () => {
      const updateDtoSameName: UpdateBranchDto = {
        name: mockBranch.name.toUpperCase(),
      };
      const updatedBranch = { ...mockBranch, ...updateDtoSameName };
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.branch.findFirst.mockResolvedValue(null);
      mockPrismaService.branch.update.mockResolvedValue(updatedBranch);

      const result = await service.updateBranch(
        tenantId,
        branchId,
        updateDtoSameName,
      );

      expect(result).toEqual(updatedBranch);
    });
  });

  describe('archiveBranch', () => {
    it('should archive branch successfully', async () => {
      const nonDefaultBranch = { ...mockBranch, isDefault: false };
      const archivedBranch = {
        ...nonDefaultBranch,
        isActive: false,
        archivedAt: new Date(),
      };
      mockPrismaService.branch.findUnique.mockResolvedValue(nonDefaultBranch);
      mockPrismaService.branch.count.mockResolvedValue(2);
      mockPrismaService.branch.update.mockResolvedValue(archivedBranch);

      const result = await service.archiveBranch(tenantId, branchId);

      expect(result.isActive).toBe(false);
      expect(result.archivedAt).toBeDefined();
      expect(prismaService.branch.update).toHaveBeenCalledWith({
        where: { id: branchId },
        data: {
          isActive: false,
          archivedAt: expect.any(Date),
        },
      });
    });

    it('should throw BadRequestException if branch already archived', async () => {
      const archivedBranch = { ...mockBranch, isActive: false };
      mockPrismaService.branch.findUnique.mockResolvedValue(archivedBranch);

      await expect(service.archiveBranch(tenantId, branchId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.archiveBranch(tenantId, branchId)).rejects.toThrow(
        'Branch is already archived',
      );
    });

    it('should throw BadRequestException if archiving default branch', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);

      await expect(service.archiveBranch(tenantId, branchId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.archiveBranch(tenantId, branchId)).rejects.toThrow(
        'Cannot archive default branch. Set another branch as default first.',
      );
    });

    it('should throw BadRequestException if archiving last active branch', async () => {
      const nonDefaultBranch = { ...mockBranch, isDefault: false };
      mockPrismaService.branch.findUnique.mockResolvedValue(nonDefaultBranch);
      mockPrismaService.branch.count.mockResolvedValue(1);

      await expect(service.archiveBranch(tenantId, branchId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.archiveBranch(tenantId, branchId)).rejects.toThrow(
        'Cannot archive the last active branch',
      );
    });
  });

  describe('restoreBranch', () => {
    it('should restore archived branch successfully', async () => {
      const archivedBranch = {
        ...mockBranch,
        isActive: false,
        archivedAt: new Date(),
      };
      const restoredBranch = {
        ...archivedBranch,
        isActive: true,
        archivedAt: null,
      };
      mockPrismaService.branch.findUnique.mockResolvedValue(archivedBranch);
      mockPrismaService.branch.update.mockResolvedValue(restoredBranch);

      const result = await service.restoreBranch(tenantId, branchId);

      expect(result.isActive).toBe(true);
      expect(result.archivedAt).toBeNull();
      expect(prismaService.branch.update).toHaveBeenCalledWith({
        where: { id: branchId },
        data: {
          isActive: true,
          archivedAt: null,
        },
      });
    });

    it('should throw BadRequestException if branch is not archived', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);

      await expect(service.restoreBranch(tenantId, branchId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.restoreBranch(tenantId, branchId)).rejects.toThrow(
        'Branch is not archived',
      );
    });

    it('should throw ForbiddenException if restoring would exceed plan limit', async () => {
      const archivedBranch = {
        ...mockBranch,
        isActive: false,
        archivedAt: new Date(),
      };
      mockPrismaService.branch.findUnique.mockResolvedValue(archivedBranch);
      mockPlanService.getTenantPlan.mockResolvedValue({
        maxBranches: 3,
      } as any);
      // Mock that tenant already has 3 active branches
      mockPrismaService.branch.count.mockResolvedValue(3);

      await expect(service.restoreBranch(tenantId, branchId)).rejects.toThrow(
        'Plan limitine ulaşıldı. Daha fazla şube için planınızı yükseltmeniz gerekiyor.',
      );
    });
  });

  describe('setDefaultBranch', () => {
    it('should set branch as default successfully', async () => {
      const nonDefaultBranch = { ...mockBranch, isDefault: false };
      const updatedBranch = { ...nonDefaultBranch, isDefault: true };
      mockPrismaService.branch.findUnique.mockResolvedValue(nonDefaultBranch);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          branch: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue(updatedBranch),
          },
        };
        return callback(tx);
      });

      const result = await service.setDefaultBranch(tenantId, branchId);

      expect(result.isDefault).toBe(true);
      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if branch is archived', async () => {
      const archivedBranch = { ...mockBranch, isActive: false };
      mockPrismaService.branch.findUnique.mockResolvedValue(archivedBranch);

      await expect(
        service.setDefaultBranch(tenantId, branchId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setDefaultBranch(tenantId, branchId),
      ).rejects.toThrow('Cannot set archived branch as default');
    });

    it('should return branch if already default (no-op)', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);

      const result = await service.setDefaultBranch(tenantId, branchId);

      expect(result).toEqual(mockBranch);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should use transaction to ensure exactly one default branch', async () => {
      const nonDefaultBranch = { ...mockBranch, isDefault: false };
      const updatedBranch = { ...nonDefaultBranch, isDefault: true };
      mockPrismaService.branch.findUnique.mockResolvedValue(nonDefaultBranch);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          branch: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue(updatedBranch),
          },
        };
        return callback(tx);
      });

      await service.setDefaultBranch(tenantId, branchId);

      expect(prismaService.$transaction).toHaveBeenCalled();
      const transactionCallback =
        mockPrismaService.$transaction.mock.calls[0][0];
      const mockTx = {
        branch: {
          updateMany: jest.fn(),
          update: jest.fn().mockResolvedValue(updatedBranch),
        },
      };
      await transactionCallback(mockTx);

      expect(mockTx.branch.updateMany).toHaveBeenCalledWith({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
      expect(mockTx.branch.update).toHaveBeenCalledWith({
        where: { id: branchId },
        data: { isDefault: true },
      });
    });
  });
});
