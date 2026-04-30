import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipBillingStatusCheck } from '../auth/decorators/skip-billing-status-check.decorator';
import { BillingEntitlementService } from './billing-entitlement.service';
import { PurchaseSyncService } from './purchase-sync.service';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MeEntitlementsController {
  constructor(
    private readonly billingEntitlementService: BillingEntitlementService,
    private readonly purchaseSyncService: PurchaseSyncService,
  ) {}

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

  /**
   * POST /me/purchase-sync
   *
   * Called by mobile immediately after a successful RevenueCat in-app purchase, while the
   * async webhook may not have arrived yet.  Fetches the subscriber's entitlement state
   * directly from the RevenueCat REST API and upserts the RevenueCatEntitlementSnapshot,
   * so that BillingStatusGuard and /auth/me both reflect the active premium access without
   * waiting for webhook delivery.
   *
   * Requires REVENUECAT_V1_API_KEY (V1 Secret Key) in the server environment.
   * Returns 503 when the key is not configured.
   *
   * BillingStatusCheck is skipped: this endpoint must be reachable by tenants that have
   * just purchased but whose snapshot does not exist in the DB yet (pre-webhook).
   */
  @Post('purchase-sync')
  @HttpCode(HttpStatus.OK)
  @SkipBillingStatusCheck()
  async purchaseSync(@CurrentUser('tenantId') tenantId: string) {
    const status = await this.purchaseSyncService.syncPurchase(tenantId);
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
