import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

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
   */
  async updateCurrentTenant(tenantId: string, dto: UpdateTenantDto) {
    // Verify tenant exists
    await this.getCurrentTenant(tenantId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
    });
  }
}

