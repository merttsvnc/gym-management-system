import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_VALIDATED_ENV } from '../config/app-env.token';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  BillingEntitlementService,
  PremiumAccessResult,
} from './billing-entitlement.service';
import { RevenueCatApiService } from './revenuecat-api.service';

/**
 * Syncs a tenant's RevenueCat premium entitlement directly from the RC REST API.
 *
 * This is used by the mobile post-purchase polling flow to handle the window between
 * a successful in-app purchase and RevenueCat webhook delivery (typically seconds to
 * minutes). Calling `syncPurchase` upserts the RevenueCatEntitlementSnapshot so that
 * BillingStatusGuard and /auth/me both see the active entitlement immediately.
 *
 * Security: the `tenantId` is always taken from the validated JWT; callers must NOT
 * pass a user-supplied tenantId.
 */
@Injectable()
export class PurchaseSyncService {
  private readonly logger = new Logger(PurchaseSyncService.name);

  constructor(
    private readonly rcApi: RevenueCatApiService,
    private readonly prisma: PrismaService,
    private readonly billingEntitlementService: BillingEntitlementService,
    @Inject(APP_VALIDATED_ENV) private readonly env: Env,
  ) {}

  /**
   * Fetch the latest entitlement state from RevenueCat and upsert the snapshot row,
   * then return the recalculated premium access result.
   *
   * @throws ServiceUnavailableException when REVENUECAT_V1_API_KEY is not set.
   */
  async syncPurchase(tenantId: string): Promise<PremiumAccessResult> {
    if (!this.rcApi.isConfigured) {
      throw new ServiceUnavailableException(
        'Purchase sync is not available: REVENUECAT_V1_API_KEY is not configured',
      );
    }

    const premiumEntitlementId = this.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID;
    const appUserId = `tenant:${tenantId}`;

    this.logger.log(
      `purchase-sync start: tenantId=${tenantId} appUserId=${appUserId} entitlementId=${premiumEntitlementId}`,
    );

    const result = await this.rcApi.fetchSubscriberEntitlement(
      appUserId,
      premiumEntitlementId,
    );

    if (!result) {
      this.logger.warn(
        `purchase-sync RC API returned null: tenantId=${tenantId} — returning current DB state`,
      );
      return this.billingEntitlementService.getPremiumAccessForTenant(tenantId);
    }

    const { entitlement } = result;

    if (!entitlement) {
      this.logger.log(
        `purchase-sync no entitlement in RC response: tenantId=${tenantId}`,
      );
      return this.billingEntitlementService.getPremiumAccessForTenant(tenantId);
    }

    await this.prisma.revenueCatEntitlementSnapshot.upsert({
      where: {
        tenantId_entitlementId: {
          tenantId,
          entitlementId: premiumEntitlementId,
        },
      },
      create: {
        tenantId,
        appUserId,
        entitlementId: premiumEntitlementId,
        state: entitlement.state,
        isActive: entitlement.isActive,
        productId: entitlement.productIdentifier,
        store: entitlement.store,
        periodType: entitlement.periodType,
        purchasedAt: entitlement.purchaseDate,
        originalPurchaseDate: entitlement.originalPurchaseDate,
        expiresAt: entitlement.expiresDate,
        gracePeriodExpiresAt: entitlement.gracePeriodExpiresDate,
        billingIssueDetectedAt: entitlement.billingIssuesDetectedAt,
        unsubscribedAt: entitlement.unsubscribeDetectedAt,
        ownershipType: entitlement.ownershipType,
        willRenew: entitlement.willRenew,
        updatedFromEventId: 'purchase-sync',
        lastAppliedEventAt: new Date(),
        raw: Prisma.JsonNull,
      },
      update: {
        state: entitlement.state,
        isActive: entitlement.isActive,
        productId: entitlement.productIdentifier,
        store: entitlement.store,
        periodType: entitlement.periodType,
        purchasedAt: entitlement.purchaseDate,
        originalPurchaseDate: entitlement.originalPurchaseDate,
        expiresAt: entitlement.expiresDate,
        gracePeriodExpiresAt: entitlement.gracePeriodExpiresDate,
        billingIssueDetectedAt: entitlement.billingIssuesDetectedAt,
        unsubscribedAt: entitlement.unsubscribeDetectedAt,
        ownershipType: entitlement.ownershipType,
        willRenew: entitlement.willRenew,
        updatedFromEventId: 'purchase-sync',
        // NOTE: lastAppliedEventAt is intentionally NOT updated here.
        // The webhook uses lastAppliedEventAt for ordering. A sync upsert coming from
        // the REST API does not have an event timestamp, so we must not overwrite it;
        // otherwise a webhook with an older timestamp could be skipped when it arrives.
      },
    });

    this.logger.log(
      `purchase-sync snapshot upserted: tenantId=${tenantId} isActive=${entitlement.isActive} state=${entitlement.state} expiresAt=${entitlement.expiresDate?.toISOString() ?? 'null'}`,
    );

    return this.billingEntitlementService.getPremiumAccessForTenant(tenantId);
  }
}
