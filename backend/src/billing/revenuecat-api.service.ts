import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppStore, EntitlementState } from '@prisma/client';
import { APP_VALIDATED_ENV } from '../config/app-env.token';
import type { Env } from '../config/env';

const RC_API_BASE = 'https://api.revenuecat.com/v1';

export interface RcApiEntitlement {
  /** ISO 8601 or null (non-expiring / lifetime). */
  expiresDate: Date | null;
  gracePeriodExpiresDate: Date | null;
  /** RC product identifier linked to this entitlement. */
  productIdentifier: string | null;
  purchaseDate: Date | null;
  originalPurchaseDate: Date | null;
  billingIssuesDetectedAt: Date | null;
  unsubscribeDetectedAt: Date | null;
  store: AppStore;
  periodType: string | null;
  ownershipType: string | null;
  willRenew: boolean | null;
  /** Computed from expiresDate / gracePeriodExpiresDate relative to `now`. */
  isActive: boolean;
  state: EntitlementState;
}

export interface RcApiSubscriberResult {
  appUserId: string;
  entitlement: RcApiEntitlement | null;
}

/**
 * Thin client for the RevenueCat REST API v1.
 * Used by the purchase-sync flow to fetch entitlement state directly from RC when the webhook
 * has not yet arrived (async delivery gap after a mobile purchase).
 *
 * Requires `REVENUECAT_V1_API_KEY` env var (V1 Secret Key from RC dashboard > API Keys).
 * When the key is absent all methods return null and log a warning.
 */
@Injectable()
export class RevenueCatApiService {
  private readonly logger = new Logger(RevenueCatApiService.name);

  constructor(@Inject(APP_VALIDATED_ENV) private readonly env: Env) {}

  get isConfigured(): boolean {
    return Boolean(this.env.REVENUECAT_V1_API_KEY);
  }

  /**
   * Fetch a subscriber's entitlement state from the RC REST API.
   *
   * @param appUserId  The canonical RC app user id, e.g. `tenant:<tenantId>`.
   * @param premiumEntitlementId  The entitlement identifier to look for (e.g. `premium`).
   * @returns Parsed entitlement data, or null when the key is not configured / on API error.
   */
  async fetchSubscriberEntitlement(
    appUserId: string,
    premiumEntitlementId: string,
  ): Promise<RcApiSubscriberResult | null> {
    if (!this.env.REVENUECAT_V1_API_KEY) {
      this.logger.warn(
        'REVENUECAT_V1_API_KEY is not configured; purchase-sync cannot call RC REST API',
      );
      return null;
    }

    const url = `${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.env.REVENUECAT_V1_API_KEY}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      this.logger.error(
        `RC REST API network error: appUserId=${appUserId} error=${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    if (!response.ok) {
      this.logger.error(
        `RC REST API error: status=${response.status} appUserId=${appUserId}`,
      );
      return null;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.logger.error(
        `RC REST API response parse error: appUserId=${appUserId}`,
      );
      return null;
    }

    return this.parseSubscriberResponse(body, appUserId, premiumEntitlementId);
  }

  private parseSubscriberResponse(
    body: unknown,
    appUserId: string,
    premiumEntitlementId: string,
  ): RcApiSubscriberResult | null {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('subscriber' in body) ||
      typeof (body as Record<string, unknown>).subscriber !== 'object'
    ) {
      this.logger.warn(
        `RC REST API unexpected response shape: appUserId=${appUserId}`,
      );
      return null;
    }

    const subscriber = (body as Record<string, unknown>).subscriber as Record<
      string,
      unknown
    >;
    const entitlements =
      typeof subscriber.entitlements === 'object' &&
      subscriber.entitlements !== null
        ? (subscriber.entitlements as Record<string, unknown>)
        : {};

    const rawEnt =
      typeof entitlements[premiumEntitlementId] === 'object' &&
      entitlements[premiumEntitlementId] !== null
        ? (entitlements[premiumEntitlementId] as Record<string, unknown>)
        : null;

    if (!rawEnt) {
      this.logger.log(
        `RC REST API: no entitlement '${premiumEntitlementId}' found for appUserId=${appUserId}`,
      );
      return { appUserId, entitlement: null };
    }

    const now = new Date();
    const expiresDate = this.toDate(rawEnt.expires_date);
    const gracePeriodExpiresDate = this.toDate(
      rawEnt.grace_period_expires_date,
    );
    const productIdentifier = this.toStr(rawEnt.product_identifier);

    // Resolve subscription details if product found
    const subscriptions =
      typeof subscriber.subscriptions === 'object' &&
      subscriber.subscriptions !== null
        ? (subscriber.subscriptions as Record<string, unknown>)
        : {};
    const sub =
      productIdentifier && typeof subscriptions[productIdentifier] === 'object'
        ? (subscriptions[productIdentifier] as Record<string, unknown>)
        : null;

    const billingIssuesDetectedAt = this.toDate(
      sub?.billing_issues_detected_at ?? rawEnt.billing_issues_detected_at,
    );
    const unsubscribeDetectedAt = this.toDate(
      sub?.unsubscribe_detected_at ?? rawEnt.unsubscribe_detected_at,
    );
    const purchaseDate = this.toDate(rawEnt.purchase_date);
    const originalPurchaseDate = this.toDate(
      sub?.original_purchase_date ?? null,
    );
    const store = this.mapStore(this.toStr(sub?.store ?? rawEnt.store));
    const periodType = this.toStr(sub?.period_type ?? rawEnt.period_type);
    const ownershipType = this.toStr(
      sub?.ownership_type ?? rawEnt.ownership_type,
    );
    const willRenew =
      typeof sub?.will_renew === 'boolean' ? sub.will_renew : null;

    const graceActive = Boolean(
      gracePeriodExpiresDate && gracePeriodExpiresDate > now,
    );
    const expiryActive = expiresDate === null || expiresDate > now;
    const isActive = graceActive || expiryActive;

    let state: EntitlementState;
    if (graceActive && !expiryActive) {
      state = EntitlementState.GRACE_PERIOD;
    } else if (isActive) {
      state = EntitlementState.ACTIVE;
    } else {
      state = EntitlementState.INACTIVE;
    }

    const entitlement: RcApiEntitlement = {
      expiresDate,
      gracePeriodExpiresDate,
      productIdentifier,
      purchaseDate,
      originalPurchaseDate,
      billingIssuesDetectedAt,
      unsubscribeDetectedAt,
      store,
      periodType,
      ownershipType,
      willRenew,
      isActive,
      state,
    };

    this.logger.log(
      `RC REST API parsed: appUserId=${appUserId} entitlementId=${premiumEntitlementId} ` +
        `isActive=${isActive} state=${state} expiresDate=${expiresDate?.toISOString() ?? 'null'}`,
    );

    return { appUserId, entitlement };
  }

  private toDate(value: unknown): Date | null {
    if (typeof value === 'string' && value.length > 0) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'number') {
      const d = new Date(value > 1e12 ? value : value * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private toStr(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private mapStore(store: string | null): AppStore {
    if (!store) return AppStore.UNKNOWN;
    const s = store.toUpperCase();
    if (s.includes('APP_STORE') || s.includes('APPLE'))
      return AppStore.APPLE_APP_STORE;
    if (s.includes('PLAY')) return AppStore.GOOGLE_PLAY;
    if (s.includes('STRIPE')) return AppStore.STRIPE;
    return AppStore.UNKNOWN;
  }
}
