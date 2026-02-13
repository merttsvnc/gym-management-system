import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchListQueryDto } from './dto/branch-list-query.dto';

@Controller('branches')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  /**
   * GET /api/v1/branches
   * Lists branches for the current tenant with pagination
   */
  @Get()
  listBranches(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: BranchListQueryDto,
  ) {
    return this.branchesService.listBranches(tenantId, query);
  }

  /**
   * GET /api/v1/branches/:id
   * Gets a single branch by ID
   * Returns 403 if branch belongs to different tenant
   */
  @Get(':id')
  getBranchById(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') branchId: string,
  ) {
    return this.branchesService.getBranchById(tenantId, branchId);
  }

  /**
   * POST /api/v1/branches
   * Creates a new branch for the current tenant
   * Requires ADMIN role
   * Returns 201 Created
   * Enforces plan limits (e.g., maxBranches)
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  createBranch(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    // user.tenantId is used to scope the branch creation to the tenant
    // Plan limits are enforced in BranchesService.createBranch()
    return this.branchesService.createBranch(user.tenantId, dto);
  }

  // Example future usage:
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN')
  // async create(@CurrentUser() user: AuthUser) {
  //   const plan = await this.planService.getTenantPlan(user.tenantId);
  //   // Use plan.hasClasses, plan.maxBranches, etc.
  // }

  /**
   * PATCH /api/v1/branches/:id
   * Updates an existing branch
   * Requires ADMIN role (TODO: add role check when roles are fully wired)
   */
  @Patch(':id')
  updateBranch(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.updateBranch(tenantId, branchId, dto);
  }

  /**
   * POST /api/v1/branches/:id/archive
   * Archives (soft-deletes) a branch
   * Requires ADMIN role (TODO: add role check when roles are fully wired)
   * Cannot archive default branch or last active branch
   */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archiveBranch(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') branchId: string,
  ) {
    return this.branchesService.archiveBranch(tenantId, branchId);
  }

  /**
   * POST /api/v1/branches/:id/restore
   * Restores an archived branch
   * Requires ADMIN role (TODO: add role check when roles are fully wired)
   */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restoreBranch(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') branchId: string,
  ) {
    return this.branchesService.restoreBranch(tenantId, branchId);
  }

  /**
   * POST /api/v1/branches/:id/set-default
   * Sets a branch as the default branch for the tenant
   * Requires ADMIN role (TODO: add role check when roles are fully wired)
   * Automatically unsets previous default branch
   */
  @Post(':id/set-default')
  @HttpCode(HttpStatus.OK)
  setDefaultBranch(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') branchId: string,
  ) {
    return this.branchesService.setDefaultBranch(tenantId, branchId);
  }
}
