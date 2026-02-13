import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanService } from '../plan/plan.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchListQueryDto } from './dto/branch-list-query.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
  ) {}

  /**
   * List branches for a tenant with pagination
   * Enforces tenant isolation by requiring tenantId parameter
   */
  async listBranches(tenantId: string, query: BranchListQueryDto) {
    const { page = 1, limit = 20, includeArchived = false } = query;

    const where = {
      tenantId,
      ...(includeArchived ? {} : { isActive: true }),
    };

    const [data, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a branch by ID
   * Enforces tenant isolation - throws NotFoundException if branch doesn't belong to tenant
   */
  async getBranchById(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.tenantId !== tenantId) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  /**
   * Create a new branch for a tenant
   * Business rules:
   * - First branch for a tenant automatically becomes default
   * - Branch names must be unique within tenant (case-insensitive)
   * - Enforces plan limit for maxBranches
   */
  async createBranch(tenantId: string, dto: CreateBranchDto) {
    // Check plan limit before creating branch (only count active branches)
    const plan = await this.planService.getTenantPlan(tenantId);
    const currentCount = await this.prisma.branch.count({
      where: { tenantId, isActive: true },
    });

    if (currentCount >= plan.maxBranches) {
      throw new ForbiddenException(
        `Plan limit reached: max ${plan.maxBranches} branches allowed.`,
      );
    }

    // Check if branch name already exists for this tenant (case-insensitive)
    const existingBranch = await this.prisma.branch.findFirst({
      where: {
        tenantId,
        name: {
          equals: dto.name,
          mode: 'insensitive',
        },
      },
    });

    if (existingBranch) {
      throw new ConflictException('Branch name already exists for this tenant');
    }

    // Check if this is the first branch for the tenant
    const branchCount = await this.prisma.branch.count({
      where: { tenantId },
    });

    const isDefault = branchCount === 0;

    return this.prisma.branch.create({
      data: {
        tenantId,
        name: dto.name,
        address: dto.address,
        isDefault,
        isActive: true,
      },
    });
  }

  /**
   * Update an existing branch
   * Business rules:
   * - Branch names must be unique within tenant (case-insensitive)
   * - Cannot update archived branches
   */
  async updateBranch(tenantId: string, branchId: string, dto: UpdateBranchDto) {
    const branch = await this.getBranchById(tenantId, branchId);

    if (!branch.isActive) {
      throw new BadRequestException('Cannot update archived branch');
    }

    // If name is being updated, check for uniqueness
    if (dto.name && dto.name.toLowerCase() !== branch.name.toLowerCase()) {
      const existingBranch = await this.prisma.branch.findFirst({
        where: {
          tenantId,
          name: {
            equals: dto.name,
            mode: 'insensitive',
          },
          id: {
            not: branchId,
          },
        },
      });

      if (existingBranch) {
        throw new ConflictException(
          'Branch name already exists for this tenant',
        );
      }
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: dto,
    });
  }

  /**
   * Archive (soft-delete) a branch
   * Business rules:
   * - Cannot archive the default branch (must set another branch as default first)
   * - Cannot archive the last active branch
   */
  async archiveBranch(tenantId: string, branchId: string) {
    const branch = await this.getBranchById(tenantId, branchId);

    if (!branch.isActive) {
      throw new BadRequestException('Branch is already archived');
    }

    if (branch.isDefault) {
      throw new BadRequestException(
        'Cannot archive default branch. Set another branch as default first.',
      );
    }

    // Count active branches for this tenant
    const activeCount = await this.prisma.branch.count({
      where: {
        tenantId,
        isActive: true,
      },
    });

    if (activeCount <= 1) {
      throw new BadRequestException('Cannot archive the last active branch');
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });
  }

  /**
   * Restore an archived branch
   * Business rules:
   * - Can only restore branches that are archived
   * - Enforces plan limit for maxBranches (cannot exceed active branch limit)
   */
  async restoreBranch(tenantId: string, branchId: string) {
    const branch = await this.getBranchById(tenantId, branchId);

    if (branch.isActive) {
      throw new BadRequestException('Branch is not archived');
    }

    // Check plan limit before restoring branch (only count active branches)
    const plan = await this.planService.getTenantPlan(tenantId);
    const currentCount = await this.prisma.branch.count({
      where: { tenantId, isActive: true },
    });

    if (currentCount >= plan.maxBranches) {
      throw new ForbiddenException(
        'Plan limitine ulaşıldı. Daha fazla şube için planınızı yükseltmeniz gerekiyor.',
      );
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        isActive: true,
        archivedAt: null,
      },
    });
  }

  /**
   * Get the default branch for a tenant
   * Throws NotFoundException if no default branch exists
   */
  async getDefaultBranch(tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        tenantId,
        isDefault: true,
        isActive: true,
      },
    });

    if (!branch) {
      throw new NotFoundException('No default branch found for this tenant');
    }

    return branch;
  }

  /**
   * Set a branch as the default branch for a tenant
   * Business rules:
   * - Exactly one branch per tenant must be default
   * - Cannot set archived branch as default
   * - Uses transaction to ensure atomicity
   */
  async setDefaultBranch(tenantId: string, branchId: string) {
    const branch = await this.getBranchById(tenantId, branchId);

    if (!branch.isActive) {
      throw new BadRequestException('Cannot set archived branch as default');
    }

    if (branch.isDefault) {
      // Already default, no-op
      return branch;
    }

    // Use transaction to ensure exactly one default branch
    return this.prisma.$transaction(async (tx) => {
      // Unset current default
      await tx.branch.updateMany({
        where: {
          tenantId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });

      // Set new default
      return tx.branch.update({
        where: { id: branchId },
        data: {
          isDefault: true,
        },
      });
    });
  }
}
