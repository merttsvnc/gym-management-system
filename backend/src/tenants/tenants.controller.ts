import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
// Note: Guards will be implemented in Phase 3
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { TenantGuard } from '../auth/guards/tenant.guard';
// import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('api/v1/tenants')
// @UseGuards(JwtAuthGuard, TenantGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  getCurrentTenant(/* @CurrentUser('tenantId') tenantId: string */) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.tenantsService.getCurrentTenant(tenantId);
  }

  @Patch('current')
  updateCurrentTenant(
    /* @CurrentUser('tenantId') tenantId: string, */
    @Body() dto: UpdateTenantDto,
  ) {
    // Placeholder: tenantId will come from JWT token in Phase 3
    const tenantId = 'placeholder-tenant-id';
    return this.tenantsService.updateCurrentTenant(tenantId, dto);
  }
}

