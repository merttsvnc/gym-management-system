import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchListQueryDto } from './dto/branch-list-query.dto';
// Note: Guards will be implemented in Phase 3
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { TenantGuard } from '../auth/guards/tenant.guard';
// import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('api/v1/branches')
// @UseGuards(JwtAuthGuard, TenantGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  listBranches(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Query() query: BranchListQueryDto,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.branchesService.listBranches(tenantId, query);
  }

  @Get(':id')
  getBranchById(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Param('id') branchId: string,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.branchesService.getBranchById(tenantId, branchId);
  }

  @Post()
  createBranch(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Body() dto: CreateBranchDto,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.branchesService.createBranch(tenantId, dto);
  }

  @Patch(':id')
  updateBranch(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Param('id') branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.branchesService.updateBranch(tenantId, branchId, dto);
  }

  @Post(':id/archive')
  archiveBranch(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Param('id') branchId: string,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.branchesService.archiveBranch(tenantId, branchId);
  }

  @Post(':id/restore')
  restoreBranch(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Param('id') branchId: string,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.branchesService.restoreBranch(tenantId, branchId);
  }

  @Post(':id/set-default')
  setDefaultBranch(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Param('id') branchId: string,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.branchesService.setDefaultBranch(tenantId, branchId);
  }
}

