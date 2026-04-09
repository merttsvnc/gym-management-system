import { Inject, Injectable } from '@nestjs/common';
import { BillingStatus, EntitlementState } from '@prisma/client';
import { APP_VALIDATED_ENV } from '../config/app-env.token';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { premiumAccessFromEntitlementSnapshot } from './entitlement-premium.util';

type PremiumSource = 'revenuecat' | 'legacy_fallback' | 'none';

export interface PremiumAccessResult {
  hasPremiumAccess: boolean;
  /** True when tenant.billingStatus is SUSPENDED (premium must be denied regardless of RevenueCat). */
  tenantSuspended: boolean;
  source: PremiumSource;
  reason: string;
  entitlement: {
    entitlementId: string;
    state: EntitlementState | 'UNKNOWN';
    isActive: boolean;
    productId: string | null;
    expiresAt: string | null;
    gracePeriodExpiresAt: string | null;
    updatedAt: string | null;
  } | null;
  legacy: {
    billingStatus: BillingStatus | null;
    trialEndsAt: string | null;
  };
}

@Injectable()
export class BillingEntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_VALIDATED_ENV) private readonly env: Env,
  ) {}

  private get premiumEntitlementId(): string {
    return this.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID;
  }

  private get legacyFallbackEnabled(): boolean {
    return this.env.BILLING_LEGACY_FALLBACK_ENABLED === 'true';
  }

  async getPremiumAccessForTenant(tenantId: string): Promise<PremiumAccessResult> {
    const [entitlement, tenant] = await Promise.all([
      this.prisma.revenueCatEntitlementSnapshot.findUnique({
        where: {
          tenantId_entitlementId: {
            tenantId,
            entitlementId: this.premiumEntitlementId,
          },
        },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { billingStatus: true, trialEndsAt: true },
      }),
    ]);

    const now = new Date();
    const tenantSuspended = tenant?.billingStatus === BillingStatus.SUSPENDED;

    if (entitlement) {
      const activeFromSnapshot = premiumAccessFromEntitlementSnapshot({
        isActive: entitlement.isActive,
        expiresAt: entitlement.expiresAt,
        gracePeriodExpiresAt: entitlement.gracePeriodExpiresAt,
        now,
      });
      const hasPremiumAccess = activeFromSnapshot && !tenantSuspended;

      return {
        hasPremiumAccess,
        tenantSuspended,
        source: 'revenuecat',
        reason: tenantSuspended
          ? 'Tenant is suspended; premium access is not available'
          : activeFromSnapshot
            ? 'RevenueCat entitlement is active'
            : 'RevenueCat entitlement is inactive or expired',
        entitlement: {
          entitlementId: entitlement.entitlementId,
          state: entitlement.state,
          isActive: entitlement.isActive,
          productId: entitlement.productId ?? null,
          expiresAt: entitlement.expiresAt?.toISOString() ?? null,
          gracePeriodExpiresAt:
            entitlement.gracePeriodExpiresAt?.toISOString() ?? null,
          updatedAt: entitlement.updatedAt.toISOString(),
        },
        legacy: {
          billingStatus: tenant?.billingStatus ?? null,
          trialEndsAt: tenant?.trialEndsAt?.toISOString() ?? null,
        },
      };
    }

    if (this.legacyFallbackEnabled && tenant) {
      const trialActive =
        tenant.billingStatus === BillingStatus.TRIAL &&
        tenant.trialEndsAt !== null &&
        tenant.trialEndsAt > now;
      const legacyActive = tenant.billingStatus === BillingStatus.ACTIVE;
      const hasAccess =
        !tenantSuspended && (trialActive || legacyActive);

      return {
        hasPremiumAccess: hasAccess,
        tenantSuspended,
        source: 'legacy_fallback',
        reason: tenantSuspended
          ? 'Tenant is suspended; premium access is not available'
          : hasAccess
            ? 'Legacy fallback enabled and tenant is active'
            : 'Legacy fallback enabled but tenant has no active access',
        entitlement: null,
        legacy: {
          billingStatus: tenant.billingStatus,
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
        },
      };
    }

    return {
      hasPremiumAccess: false,
      tenantSuspended,
      source: 'none',
      reason: tenantSuspended
        ? 'Tenant is suspended; premium access is not available'
        : 'No RevenueCat entitlement snapshot available',
      entitlement: null,
      legacy: {
        billingStatus: tenant?.billingStatus ?? null,
        trialEndsAt: tenant?.trialEndsAt?.toISOString() ?? null,
      },
    };
  }
}
