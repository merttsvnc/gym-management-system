import { Test, TestingModule } from '@nestjs/testing';
import {
  AppStore,
  BillingStatus,
  EntitlementState,
  type RevenueCatEntitlementSnapshot,
} from '@prisma/client';
import { APP_VALIDATED_ENV } from '../config/app-env.token';
import { validateEnv } from '../config/env';
import { BillingEntitlementService } from './billing-entitlement.service';
import { PrismaService } from '../prisma/prisma.service';

function snapshot(
  overrides: Partial<RevenueCatEntitlementSnapshot>,
): RevenueCatEntitlementSnapshot {
  const now = new Date();
  return {
    id: 'snap-1',
    tenantId: 'tenant-1',
    appUserId: 'tenant:tenant-1',
    entitlementId: 'premium',
    state: EntitlementState.ACTIVE,
    isActive: true,
    productId: 'prod',
    store: AppStore.UNKNOWN,
    periodType: null,
    purchasedAt: null,
    originalPurchaseDate: null,
    expiresAt: null,
    gracePeriodExpiresAt: null,
    unsubscribedAt: null,
    billingIssueDetectedAt: null,
    ownershipType: null,
    willRenew: null,
    trialType: null,
    raw: null,
    updatedFromEventId: null,
    lastAppliedEventAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('BillingEntitlementService', () => {
  let service: BillingEntitlementService;
  const findEntitlement = jest.fn();
  const findTenant = jest.fn();

  beforeEach(async () => {
    findEntitlement.mockReset();
    findTenant.mockReset();
    process.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID = 'premium';
    delete process.env.BILLING_LEGACY_FALLBACK_ENABLED;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingEntitlementService,
        { provide: APP_VALIDATED_ENV, useFactory: () => validateEnv() },
        {
          provide: PrismaService,
          useValue: {
            revenueCatEntitlementSnapshot: { findUnique: findEntitlement },
            tenant: { findUnique: findTenant },
          },
        },
      ],
    }).compile();

    service = module.get(BillingEntitlementService);
  });

  it('grants premium when isActive and expiresAt is null (lifetime / non-expiring)', async () => {
    findEntitlement.mockResolvedValue(
      snapshot({ expiresAt: null, isActive: true }),
    );
    findTenant.mockResolvedValue({
      billingStatus: BillingStatus.ACTIVE,
      trialEndsAt: null,
    });

    const r = await service.getPremiumAccessForTenant('tenant-1');
    expect(r.hasPremiumAccess).toBe(true);
    expect(r.tenantSuspended).toBe(false);
    expect(r.source).toBe('revenuecat');
  });

  it('grants premium when RevenueCat snapshot is active even if tenant billingStatus is PAST_DUE', async () => {
    findEntitlement.mockResolvedValue(
      snapshot({ expiresAt: null, isActive: true }),
    );
    findTenant.mockResolvedValue({
      billingStatus: BillingStatus.PAST_DUE,
      trialEndsAt: null,
    });

    const r = await service.getPremiumAccessForTenant('tenant-1');
    expect(r.hasPremiumAccess).toBe(true);
    expect(r.source).toBe('revenuecat');
  });

  it('denies premium when suspended even if RevenueCat snapshot is active', async () => {
    findEntitlement.mockResolvedValue(
      snapshot({ expiresAt: null, isActive: true }),
    );
    findTenant.mockResolvedValue({
      billingStatus: BillingStatus.SUSPENDED,
      trialEndsAt: null,
    });

    const r = await service.getPremiumAccessForTenant('tenant-1');
    expect(r.hasPremiumAccess).toBe(false);
    expect(r.tenantSuspended).toBe(true);
    expect(r.source).toBe('revenuecat');
  });

  it('denies premium when isActive false even if expiresAt is null', async () => {
    findEntitlement.mockResolvedValue(
      snapshot({ expiresAt: null, isActive: false }),
    );
    findTenant.mockResolvedValue({
      billingStatus: BillingStatus.ACTIVE,
      trialEndsAt: null,
    });

    const r = await service.getPremiumAccessForTenant('tenant-1');
    expect(r.hasPremiumAccess).toBe(false);
    expect(r.tenantSuspended).toBe(false);
  });

  it('denies premium when only a refund snapshot exists (REFUNDED / inactive)', async () => {
    findEntitlement.mockResolvedValue(
      snapshot({
        state: EntitlementState.REFUNDED,
        isActive: false,
        expiresAt: null,
      }),
    );
    findTenant.mockResolvedValue({
      billingStatus: BillingStatus.ACTIVE,
      trialEndsAt: null,
    });

    const r = await service.getPremiumAccessForTenant('tenant-1');
    expect(r.hasPremiumAccess).toBe(false);
    expect(r.source).toBe('revenuecat');
    expect(r.entitlement?.state).toBe(EntitlementState.REFUNDED);
  });

  // --- Legacy fallback path tests ---

  describe('legacy fallback path', () => {
    beforeEach(() => {
      // No RevenueCat entitlement snapshot in these tests
      findEntitlement.mockResolvedValue(null);
    });

    it('legacy enabled + ACTIVE => premium true', async () => {
      process.env.BILLING_LEGACY_FALLBACK_ENABLED = 'true';
      const module = await Test.createTestingModule({
        providers: [
          BillingEntitlementService,
          { provide: APP_VALIDATED_ENV, useFactory: () => validateEnv() },
          {
            provide: PrismaService,
            useValue: {
              revenueCatEntitlementSnapshot: { findUnique: findEntitlement },
              tenant: { findUnique: findTenant },
            },
          },
        ],
      }).compile();
      const svc = module.get(BillingEntitlementService);

      findTenant.mockResolvedValue({
        billingStatus: BillingStatus.ACTIVE,
        trialEndsAt: null,
      });

      const r = await svc.getPremiumAccessForTenant('tenant-1');
      expect(r.hasPremiumAccess).toBe(true);
      expect(r.source).toBe('legacy_fallback');
    });

    it('legacy enabled + TRIAL + future trialEndsAt => premium true', async () => {
      process.env.BILLING_LEGACY_FALLBACK_ENABLED = 'true';
      const module = await Test.createTestingModule({
        providers: [
          BillingEntitlementService,
          { provide: APP_VALIDATED_ENV, useFactory: () => validateEnv() },
          {
            provide: PrismaService,
            useValue: {
              revenueCatEntitlementSnapshot: { findUnique: findEntitlement },
              tenant: { findUnique: findTenant },
            },
          },
        ],
      }).compile();
      const svc = module.get(BillingEntitlementService);

      findTenant.mockResolvedValue({
        billingStatus: BillingStatus.TRIAL,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const r = await svc.getPremiumAccessForTenant('tenant-1');
      expect(r.hasPremiumAccess).toBe(true);
      expect(r.source).toBe('legacy_fallback');
    });

    it('legacy enabled + TRIAL + expired trialEndsAt => premium false', async () => {
      process.env.BILLING_LEGACY_FALLBACK_ENABLED = 'true';
      const module = await Test.createTestingModule({
        providers: [
          BillingEntitlementService,
          { provide: APP_VALIDATED_ENV, useFactory: () => validateEnv() },
          {
            provide: PrismaService,
            useValue: {
              revenueCatEntitlementSnapshot: { findUnique: findEntitlement },
              tenant: { findUnique: findTenant },
            },
          },
        ],
      }).compile();
      const svc = module.get(BillingEntitlementService);

      findTenant.mockResolvedValue({
        billingStatus: BillingStatus.TRIAL,
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      const r = await svc.getPremiumAccessForTenant('tenant-1');
      expect(r.hasPremiumAccess).toBe(false);
      expect(r.source).toBe('legacy_fallback');
    });

    it('legacy enabled + PAST_DUE => premium false', async () => {
      process.env.BILLING_LEGACY_FALLBACK_ENABLED = 'true';
      const module = await Test.createTestingModule({
        providers: [
          BillingEntitlementService,
          { provide: APP_VALIDATED_ENV, useFactory: () => validateEnv() },
          {
            provide: PrismaService,
            useValue: {
              revenueCatEntitlementSnapshot: { findUnique: findEntitlement },
              tenant: { findUnique: findTenant },
            },
          },
        ],
      }).compile();
      const svc = module.get(BillingEntitlementService);

      findTenant.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
        trialEndsAt: null,
      });

      const r = await svc.getPremiumAccessForTenant('tenant-1');
      expect(r.hasPremiumAccess).toBe(false);
      expect(r.source).toBe('legacy_fallback');
    });

    it('legacy disabled + no snapshot => source none, premium false', async () => {
      // BILLING_LEGACY_FALLBACK_ENABLED is not set (deleted in beforeEach)
      findTenant.mockResolvedValue({
        billingStatus: BillingStatus.ACTIVE,
        trialEndsAt: null,
      });

      const r = await service.getPremiumAccessForTenant('tenant-1');
      expect(r.hasPremiumAccess).toBe(false);
      expect(r.source).toBe('none');
    });
  });
});
