import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseBoolPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MembershipPlansService } from './membership-plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanListQueryDto } from './dto/plan-list-query.dto';

@Controller('api/v1/membership-plans')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MembershipPlansController {
  constructor(
    private readonly membershipPlansService: MembershipPlansService,
  ) {}

  /**
   * GET /api/v1/membership-plans
   * List all membership plans for the current tenant with filtering and pagination
   * Query parameters:
   * - scope?: TENANT|BRANCH
   * - branchId?: string
   * - q?: string (name search)
   * - includeArchived?: boolean (default false)
   * - page?: number (default 1)
   * - limit?: number (default 20)
   * Returns: { data, pagination } always (empty results => 200 with empty data + pagination.total=0)
   */
  @Get()
  listPlansForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PlanListQueryDto,
  ) {
    return this.membershipPlansService.listPlansForTenant(tenantId, {
      status: query.status,
      search: query.search,
      q: query.q,
      scope: query.scope,
      branchId: query.branchId,
      includeArchived: query.includeArchived,
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * GET /api/v1/membership-plans/active
   * Get all ACTIVE plans for the current tenant (for dropdown selection)
   * Query parameters:
   * - branchId?: string
   * - includeMemberCount?: boolean (default false)
   * Behavior:
   * - If branchId provided -> TENANT + that branch's BRANCH plans
   * - else -> TENANT plans only
   * - If includeMemberCount=true, include activeMemberCount per plan
   */
  @Get('active')
  async listActivePlansForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('includeMemberCount', new ParseBoolPipe({ optional: true }))
    includeMemberCount?: boolean,
  ) {
    const plans = await this.membershipPlansService.listActivePlansForTenant(
      tenantId,
      branchId,
    );

    if (includeMemberCount) {
      const plansWithCounts = await Promise.all(
        plans.map(async (plan) => {
          const count =
            await this.membershipPlansService.countActiveMembersForPlan(
              plan.id,
            );
          return {
            ...plan,
            activeMemberCount: count,
          };
        }),
      );
      return plansWithCounts;
    }

    return plans;
  }

  /**
   * GET /api/v1/membership-plans/:id
   * Get details of a specific membership plan
   */
  @Get(':id')
  getPlanByIdForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.membershipPlansService.getPlanByIdForTenant(tenantId, id);
  }

  /**
   * POST /api/v1/membership-plans
   * Create a new membership plan for the current tenant
   * Requires ADMIN role
   * Body:
   * - scope (required): TENANT or BRANCH
   * - branchId (required only if scope=BRANCH)
   * - name, durationType, durationValue, price, currency, optional fields
   * - Never allow scopeKey
   * Returns: created plan
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  createPlanForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreatePlanDto,
  ) {
    return this.membershipPlansService.createPlanForTenant(tenantId, {
      scope: dto.scope,
      branchId: dto.branchId,
      name: dto.name,
      description: dto.description,
      durationType: dto.durationType,
      durationValue: dto.durationValue,
      price: dto.price,
      currency: dto.currency,
      maxFreezeDays: dto.maxFreezeDays,
      autoRenew: dto.autoRenew,
      sortOrder: dto.sortOrder,
    });
  }

  /**
   * PATCH /api/v1/membership-plans/:id
   * Update an existing membership plan
   * Requires ADMIN role
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updatePlanForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.membershipPlansService.updatePlanForTenant(tenantId, id, {
      name: dto.name,
      description: dto.description,
      durationType: dto.durationType,
      durationValue: dto.durationValue,
      price: dto.price,
      currency: dto.currency,
      maxFreezeDays: dto.maxFreezeDays,
      autoRenew: dto.autoRenew,
      sortOrder: dto.sortOrder,
      status: dto.status,
    });
  }

  /**
   * POST /api/v1/membership-plans/:id/archive
   * Archive a membership plan (soft delete)
   * Requires ADMIN role
   */
  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async archivePlanForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const { plan, activeMemberCount } =
      await this.membershipPlansService.archivePlanForTenant(tenantId, id);

    return {
      id: plan.id,
      status: plan.status,
      message:
        activeMemberCount > 0
          ? `Plan arşivlendi. Bu plana bağlı ${activeMemberCount} aktif üye bulunmaktadır.`
          : 'Plan başarıyla arşivlendi.',
      activeMemberCount: activeMemberCount > 0 ? activeMemberCount : undefined,
    };
  }

  /**
   * POST /api/v1/membership-plans/:id/restore
   * Restore an archived plan to ACTIVE status
   * Requires ADMIN role
   */
  @Post(':id/restore')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  restorePlanForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.membershipPlansService.restorePlanForTenant(tenantId, id);
  }

  /**
   * DELETE /api/v1/membership-plans/:id
   * Hard delete a membership plan (only allowed if plan has no members)
   * Requires ADMIN role
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlanForTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.membershipPlansService.deletePlanForTenant(tenantId, id);
  }
}
