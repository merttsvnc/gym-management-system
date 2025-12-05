import { Controller, Get, Patch, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('api/v1/tenants')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * GET /api/v1/tenants/current
   * Returns the current tenant information based on authenticated user's tenantId
   */
  @Get('current')
  getCurrentTenant(@CurrentUser('tenantId') tenantId: string) {
    return this.tenantsService.getCurrentTenant(tenantId);
  }

  /**
   * PATCH /api/v1/tenants/current
   * Updates tenant settings (name, defaultCurrency)
   * Requires ADMIN role (TODO: add role check when roles are fully wired)
   */
  @Patch('current')
  @HttpCode(HttpStatus.OK)
  updateCurrentTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateCurrentTenant(tenantId, dto);
  }
}

