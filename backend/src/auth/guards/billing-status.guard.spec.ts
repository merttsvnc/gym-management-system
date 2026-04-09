import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { BillingStatus, EntitlementState } from '@prisma/client';
import { BillingStatusGuard } from './billing-status.guard';
import { BillingEntitlementService } from '../../billing/billing-entitlement.service';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../../common/constants/billing-messages';
import { SKIP_BILLING_STATUS_CHECK_KEY } from '../decorators/skip-billing-status-check.decorator';

describe('BillingStatusGuard', () => {
  let guard: BillingStatusGuard;

  const mockGetPremiumAccess = jest.fn();

  const mockBillingEntitlementService = {
    getPremiumAccessForTenant: mockGetPremiumAccess,
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockJwtService = {
    verify: jest.fn().mockImplementation(() => {
      throw new Error('no token');
    }),
  };

  const baseLegacy = {
    billingStatus: BillingStatus.ACTIVE as BillingStatus | null,
    trialEndsAt: null as string | null,
  };

  const premiumActiveResult = {
    hasPremiumAccess: true,
    tenantSuspended: false,
    source: 'revenuecat' as const,
    reason: 'RevenueCat entitlement is active',
    entitlement: {
      entitlementId: 'premium',
      state: EntitlementState.ACTIVE,
      isActive: true,
      productId: null as string | null,
      expiresAt: null as string | null,
      gracePeriodExpiresAt: null as string | null,
      updatedAt: new Date().toISOString(),
    },
    legacy: baseLegacy,
  };

  const createMockExecutionContext = (
    user: { tenantId?: string } | null,
    method: string = 'GET',
    url: string = '/api/v1/test',
    skipCheck: boolean = false,
  ): ExecutionContext => {
    const request = {
      user,
      method,
      url,
      headers: {} as { authorization?: string },
    };

    mockReflector.getAllAndOverride.mockReturnValue(skipCheck);

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    mockGetPremiumAccess.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingStatusGuard,
        {
          provide: BillingEntitlementService,
          useValue: mockBillingEntitlementService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    guard = module.get<BillingStatusGuard>(BillingStatusGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows all methods when premium access is active', async () => {
    mockGetPremiumAccess.mockResolvedValue(premiumActiveResult);
    const post = createMockExecutionContext(
      { tenantId: 't1' },
      'POST',
      '/api/v1/members',
    );
    await expect(guard.canActivate(post)).resolves.toBe(true);
    expect(mockGetPremiumAccess).toHaveBeenCalledWith('t1');
  });

  it('allows read methods when premium is not active', async () => {
    mockGetPremiumAccess.mockResolvedValue({
      hasPremiumAccess: false,
      tenantSuspended: false,
      source: 'revenuecat',
      reason: 'RevenueCat entitlement is inactive or expired',
      entitlement: {
        entitlementId: 'premium',
        state: EntitlementState.INACTIVE,
        isActive: false,
        productId: null,
        expiresAt: null,
        gracePeriodExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
      legacy: baseLegacy,
    });
    const get = createMockExecutionContext({ tenantId: 't1' }, 'GET', '/api/v1/members');
    await expect(guard.canActivate(get)).resolves.toBe(true);
  });

  it('returns 402 PREMIUM_REQUIRED when source is none and method is a mutation', async () => {
    mockGetPremiumAccess.mockResolvedValue({
      hasPremiumAccess: false,
      tenantSuspended: false,
      source: 'none',
      reason: 'No RevenueCat entitlement snapshot available',
      entitlement: null,
      legacy: { billingStatus: BillingStatus.TRIAL, trialEndsAt: null },
    });
    const post = createMockExecutionContext(
      { tenantId: 't1' },
      'POST',
      '/api/v1/members',
    );
    try {
      await guard.canActivate(post);
      fail('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(ex.getResponse()).toEqual({
        code: 'PREMIUM_REQUIRED',
        message: 'Premium subscription is required for this action.',
        source: 'none',
      });
    }
  });

  it('returns 403 TENANT_BILLING_LOCKED with PREMIUM_MUTATIONS_LOCKED when RevenueCat snapshot exists but premium inactive', async () => {
    mockGetPremiumAccess.mockResolvedValue({
      hasPremiumAccess: false,
      tenantSuspended: false,
      source: 'revenuecat',
      reason: 'RevenueCat entitlement is inactive or expired',
      entitlement: {
        entitlementId: 'premium',
        state: EntitlementState.INACTIVE,
        isActive: false,
        productId: null,
        expiresAt: null,
        gracePeriodExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
      legacy: baseLegacy,
    });
    const post = createMockExecutionContext(
      { tenantId: 't1' },
      'PATCH',
      '/api/v1/members/x',
    );
    try {
      await guard.canActivate(post);
      fail('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(ex.getResponse()).toEqual({
        code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        message: BILLING_ERROR_MESSAGES.PREMIUM_MUTATIONS_LOCKED,
        source: 'revenuecat',
      });
    }
  });

  it('returns 403 with PREMIUM_MUTATIONS_LOCKED when legacy_fallback evaluated but no access', async () => {
    mockGetPremiumAccess.mockResolvedValue({
      hasPremiumAccess: false,
      tenantSuspended: false,
      source: 'legacy_fallback',
      reason: 'Legacy fallback enabled but tenant has no active access',
      entitlement: null,
      legacy: { billingStatus: BillingStatus.PAST_DUE, trialEndsAt: null },
    });
    const del = createMockExecutionContext(
      { tenantId: 't1' },
      'DELETE',
      '/api/v1/members/x',
    );
    try {
      await guard.canActivate(del);
      fail('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(ex.getResponse()).toEqual({
        code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        message: BILLING_ERROR_MESSAGES.PREMIUM_MUTATIONS_LOCKED,
        source: 'legacy_fallback',
      });
    }
  });

  it('skips when user is missing or tenantId is missing', async () => {
    mockGetPremiumAccess.mockResolvedValue(premiumActiveResult);
    await expect(
      guard.canActivate(createMockExecutionContext(null, 'POST')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createMockExecutionContext({ tenantId: undefined }, 'POST'),
      ),
    ).resolves.toBe(true);
    expect(mockGetPremiumAccess).not.toHaveBeenCalled();
  });

  it('skips when SkipBillingStatusCheck is set', async () => {
    const ctx = createMockExecutionContext(
      { tenantId: 't1' },
      'POST',
      '/api/v1/auth/x',
      true,
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockGetPremiumAccess).not.toHaveBeenCalled();
    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
      SKIP_BILLING_STATUS_CHECK_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
  });

  it('returns 403 SUSPENDED_ACCESS when tenant is suspended (including GET)', async () => {
    mockGetPremiumAccess.mockResolvedValue({
      hasPremiumAccess: false,
      tenantSuspended: true,
      source: 'revenuecat',
      reason: 'Tenant is suspended; premium access is not available',
      entitlement: {
        entitlementId: 'premium',
        state: EntitlementState.ACTIVE,
        isActive: true,
        productId: null,
        expiresAt: null,
        gracePeriodExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
      legacy: baseLegacy,
    });
    const get = createMockExecutionContext({ tenantId: 't1' }, 'GET', '/api/v1/members');
    try {
      await guard.canActivate(get);
      fail('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(ex.getResponse()).toEqual({
        code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        message: BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
      });
    }
  });

  it('returns 403 Access denied when entitlement service throws unexpectedly', async () => {
    mockGetPremiumAccess.mockRejectedValue(new Error('db down'));
    const post = createMockExecutionContext(
      { tenantId: 't1' },
      'POST',
      '/api/v1/members',
    );
    try {
      await guard.canActivate(post);
      fail('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(ex.message).toBe('Access denied');
    }
  });
});
