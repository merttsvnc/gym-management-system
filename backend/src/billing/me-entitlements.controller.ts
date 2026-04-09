import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BillingEntitlementService } from './billing-entitlement.service';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MeEntitlementsController {
  constructor(private readonly billingEntitlementService: BillingEntitlementService) {}

  @Get('entitlements')
  async getEntitlements(@CurrentUser('tenantId') tenantId: string) {
    const status =
      await this.billingEntitlementService.getPremiumAccessForTenant(tenantId);
    return this.buildCanonicalResponse(status);
  }

  @Get('subscription-status')
  async getSubscriptionStatus(@CurrentUser('tenantId') tenantId: string) {
    const status =
      await this.billingEntitlementService.getPremiumAccessForTenant(tenantId);
    return this.buildCanonicalResponse(status);
  }

  private buildCanonicalResponse(status: {
    hasPremiumAccess: boolean;
    tenantSuspended: boolean;
    source: 'revenuecat' | 'legacy_fallback' | 'none';
    reason: string;
    entitlement: {
      entitlementId: string;
      state: string;
      isActive: boolean;
      productId: string | null;
      expiresAt: string | null;
      gracePeriodExpiresAt: string | null;
      updatedAt: string | null;
    } | null;
    legacy: { billingStatus: string | null; trialEndsAt: string | null };
  }) {
    return {
      hasPremiumAccess: status.hasPremiumAccess,
      tenantSuspended: status.tenantSuspended,
      source: status.source,
      reason: status.reason,
      premium: status.entitlement,
      legacy: status.legacy,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
