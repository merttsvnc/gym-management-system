import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { BILLING_ERROR_MESSAGES } from '../common/constants/billing-messages';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the current tenant by tenantId
   * Enforces tenant isolation by requiring tenantId parameter
   */
  async getCurrentTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  /**
   * Update tenant settings
   * Enforces tenant isolation by requiring tenantId parameter
   * Rejects billingStatus updates (only database updates allowed)
   */
  async updateCurrentTenant(tenantId: string, dto: UpdateTenantDto) {
    // Verify tenant exists
    await this.getCurrentTenant(tenantId);

    // Service-level check: reject billingStatus updates
    // DTO validation already excludes billingStatus, but add runtime check for safety
    if ('billingStatus' in dto) {
      throw new ForbiddenException(
        BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN,
      );
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
    });
  }
}
