import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_CONFIG, PlanKey, PlanConfig } from './plan.config';

@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the plan configuration for a tenant
   */
  async getTenantPlan(tenantId: string): Promise<PlanConfig> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planKey: true },
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    return PLAN_CONFIG[tenant.planKey as PlanKey];
  }

  /**
   * Check if a module is enabled for a tenant
   * @internal
   */
  async isModuleEnabled(
    tenantId: string,
    module: keyof PlanConfig,
  ): Promise<boolean> {
    const plan = await this.getTenantPlan(tenantId);
    return Boolean(plan[module]);
  }

  /**
   * Get a limit value for a tenant
   * @internal
   */
  async getLimit(tenantId: string, limit: keyof PlanConfig): Promise<number> {
    const plan = await this.getTenantPlan(tenantId);
    const value = plan[limit];
    if (typeof value !== 'number') {
      throw new Error(`Limit ${limit} is not a number`);
    }
    return value;
  }
}

