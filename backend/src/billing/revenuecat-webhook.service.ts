import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AppStore, Prisma, RevenueCatWebhookStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, timingSafeEqual } from 'crypto';
import { APP_VALIDATED_ENV } from '../config/app-env.token';
import type { Env } from '../config/env';
import {
  classifyRevenueCatWebhookEventType,
  computeEntitlementStateForSnapshotEvent,
  resolveSnapshotEntitlementId,
} from './revenuecat-webhook-events';
import { shouldApplyWebhookEventByTimestamp } from './revenuecat-snapshot-ordering.util';
import { subscriptionEnvironmentToIsSandbox } from './revenuecat-subscription-snapshot.util';
import {
  entitlementSnapshotAdvisoryLockSql,
  subscriptionSnapshotAdvisoryLockSql,
} from './revenuecat-snapshot-advisory-lock.util';
import { RevenueCatTenantNotFoundError } from './revenuecat-tenant-not-found.error';

export const REVENUECAT_REPLAY_WINDOW_MS = 'REVENUECAT_REPLAY_WINDOW_MS';

interface RevenueCatEventEnvelope {
  api_version?: string;
  event?: Record<string, unknown>;
}

interface ResolvedAppUserContext {
  /** Canonical stored app user id: always `tenant:<tenantId>`. */
  resolvedAppUserId: string;
  tenantId: string;
}

type AppUserResolutionFailureReason = 'invalid_format' | 'tenant_not_found';

interface AppUserResolutionFailure {
  ok: false;
  reason: AppUserResolutionFailureReason;
}

interface AppUserResolutionSuccess {
  ok: true;
  context: ResolvedAppUserContext;
}

type AppUserResolutionResult =
  | AppUserResolutionFailure
  | AppUserResolutionSuccess;

function isTerminalRevenueCatSuccess(status: RevenueCatWebhookStatus): boolean {
  return (
    status === RevenueCatWebhookStatus.PROCESSED_APPLIED ||
    status === RevenueCatWebhookStatus.PROCESSED_NOOP ||
    status === RevenueCatWebhookStatus.PROCESSED
  );
}

/**
 * RevenueCat webhook ingestion.
 *
 * **Webhook row status semantics**
 * - `PROCESSED_APPLIED`: terminal — at least one entitlement/subscription snapshot row was updated for this delivery.
 * - `PROCESSED_NOOP`: terminal — processing completed but no snapshot mutation (e.g. unknown/customer-only type, stale timestamps, missing product id).
 * - `PROCESSED`: legacy DB enum only; migrated to `PROCESSED_APPLIED` and must not be written by new code.
 * - `IGNORED`: retryable — preconditions failed (e.g. tenant missing, replay window); same `eventId`
 *   may be re-evaluated on a later delivery; `RevenueCatWebhookDeliveryAttempt` rows record each try.
 * - `FAILED`: last attempt ended in a transaction error. There is no in-handler retry loop; a **new HTTP delivery**
 *   (RevenueCat retry or ops replay) re-enters `processWebhook`, which may move the row back to `RECEIVED` and try again
 *   if the row is still `FAILED` or `RECEIVED` and the payload fingerprint matches the first-seen value.
 * - `INVALID_PAYLOAD`: terminal — same `eventId` was re-sent with a different payload fingerprint than the first persisted row.
 */
@Injectable()
export class RevenueCatWebhookService {
  private readonly logger = new Logger(RevenueCatWebhookService.name);
  private static readonly MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REVENUECAT_REPLAY_WINDOW_MS)
    private readonly replayWindowMs: number,
    @Inject(APP_VALIDATED_ENV) private readonly env: Env,
  ) {}

  /** SHA-256 of `JSON.stringify(payload)`; used as an immutable per-`eventId` fingerprint after first persist. */
  private payloadFingerprint(payload: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(payload ?? null))
      .digest('hex');
  }

  verifyWebhookAuthorization(authorizationHeader?: string) {
    const secret = this.env.REVENUECAT_WEBHOOK_SECRET;
    if (!authorizationHeader || !secret) {
      throw new UnauthorizedException(
        'Missing RevenueCat webhook authorization',
      );
    }

    const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
    const expected = Buffer.from(secret, 'utf8');
    const actual = Buffer.from(token, 'utf8');

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException(
        'Invalid RevenueCat webhook authorization',
      );
    }
  }

  async processWebhook(
    payload: unknown,
  ): Promise<{ ok: true; eventId: string }> {
    const body = payload as RevenueCatEventEnvelope;
    const event = (body.event ?? {}) as Record<string, unknown>;
    const eventIdRaw = this.readString(event.id);
    const eventTypeRaw = this.readString(event.type);

    if (!eventIdRaw || !eventTypeRaw) {
      const reason =
        !eventIdRaw && !eventTypeRaw
          ? 'missing_event_id_and_type'
          : !eventIdRaw
            ? 'missing_event_id'
            : 'missing_event_type';
      const eventId = eventIdRaw ?? this.syntheticMalformedEventId(payload);
      const eventTypeForRow = eventTypeRaw ?? '__missing_event_type__';
      await this.persistMalformedWebhook({
        eventId,
        eventTypeForRow,
        envelope: body,
        rawPayload: payload,
        reason,
      });
      return { ok: true, eventId };
    }

    const eventId = eventIdRaw;
    const eventType = eventTypeRaw;
    const incomingPayloadFingerprint = this.payloadFingerprint(payload);

    const existingPeek = await this.prisma.revenueCatWebhookEvent.findUnique({
      where: { eventId },
      select: { id: true, status: true, idempotencyKey: true },
    });

    if (existingPeek?.status === RevenueCatWebhookStatus.INVALID_PAYLOAD) {
      await this.appendDeliveryAttempt({
        webhookEventId: existingPeek.id,
        reason: 'duplicate_delivery_after_invalid_payload',
        payload: payload as Prisma.InputJsonValue,
      });
      return { ok: true, eventId };
    }

    if (existingPeek && isTerminalRevenueCatSuccess(existingPeek.status)) {
      if (
        existingPeek.idempotencyKey &&
        existingPeek.idempotencyKey !== incomingPayloadFingerprint
      ) {
        await this.appendDeliveryAttempt({
          webhookEventId: existingPeek.id,
          reason: 'payload_integrity_mismatch_after_terminal',
          payload: payload as Prisma.InputJsonValue,
        });
        this.logger.warn(
          `eventId=${eventId} duplicate delivery with different payload fingerprint after terminal status=${existingPeek.status}`,
        );
      }
      return { ok: true, eventId };
    }

    const eventTimestamp = this.toDate(
      event.event_timestamp_ms ?? event.event_timestamp,
    );

    if (!eventTimestamp) {
      await this.markEventIgnored(
        eventId,
        payload,
        body,
        eventType,
        'missing_timestamp',
        incomingPayloadFingerprint,
      );
      return { ok: true, eventId };
    }

    const nowMs = Date.now();
    const eventMs = eventTimestamp.getTime();
    const ageMs = nowMs - eventMs;
    if (ageMs > this.replayWindowMs) {
      await this.markEventIgnored(
        eventId,
        payload,
        body,
        eventType,
        'stale_replay',
        incomingPayloadFingerprint,
      );
      return { ok: true, eventId };
    }
    if (eventMs - nowMs > RevenueCatWebhookService.MAX_FUTURE_SKEW_MS) {
      await this.markEventIgnored(
        eventId,
        payload,
        body,
        eventType,
        'future_skew',
        incomingPayloadFingerprint,
      );
      return { ok: true, eventId };
    }

    const appUserId = this.readString(event.app_user_id);
    const originalAppUserId = this.readString(event.original_app_user_id);
    const idempotencyKey = incomingPayloadFingerprint;

    const appUserResolution = await this.resolveCanonicalAppUserContext(
      appUserId,
      originalAppUserId,
    );
    if (!appUserResolution.ok) {
      await this.markEventIgnored(
        eventId,
        payload,
        body,
        eventType,
        appUserResolution.reason,
        incomingPayloadFingerprint,
      );
      // tenant_not_found is transient (signup race); signal RevenueCat to retry.
      // Other ignored reasons (invalid_format) are permanent — 200 OK is correct.
      if (appUserResolution.reason === 'tenant_not_found') {
        throw new RevenueCatTenantNotFoundError(eventId);
      }
      return { ok: true, eventId };
    }

    const appUserContext = appUserResolution.context;
    const tenantId = appUserContext.tenantId;
    const resolvedAppUserId = appUserContext.resolvedAppUserId;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            {
              id: string;
              status: RevenueCatWebhookStatus;
              idempotencyKey: string | null;
            }[]
          >(
            Prisma.sql`SELECT id, status, "idempotencyKey" FROM "RevenueCatWebhookEvent" WHERE "eventId" = ${eventId} FOR UPDATE`,
          );

          let rowId: string;
          let rowStatus: RevenueCatWebhookStatus;
          let storedPayloadFingerprint: string | null;

          if (rows.length === 0) {
            try {
              const created = await tx.revenueCatWebhookEvent.create({
                data: {
                  eventId,
                  apiVersion: this.readString(body.api_version),
                  eventType,
                  appUserId: resolvedAppUserId,
                  originalAppUserId,
                  tenantId,
                  eventTimestamp,
                  idempotencyKey,
                  payload: payload as Prisma.InputJsonValue,
                  status: RevenueCatWebhookStatus.RECEIVED,
                },
                select: { id: true },
              });
              rowId = created.id;
              rowStatus = RevenueCatWebhookStatus.RECEIVED;
              storedPayloadFingerprint = idempotencyKey;
            } catch (createErr) {
              if (
                createErr instanceof Prisma.PrismaClientKnownRequestError &&
                createErr.code === 'P2002'
              ) {
                const again = await tx.$queryRaw<
                  {
                    id: string;
                    status: RevenueCatWebhookStatus;
                    idempotencyKey: string | null;
                  }[]
                >(
                  Prisma.sql`SELECT id, status, "idempotencyKey" FROM "RevenueCatWebhookEvent" WHERE "eventId" = ${eventId} FOR UPDATE`,
                );
                if (!again.length) {
                  throw createErr;
                }
                rowId = again[0].id;
                rowStatus = again[0].status;
                storedPayloadFingerprint = again[0].idempotencyKey;
              } else {
                throw createErr;
              }
            }
          } else {
            rowId = rows[0].id;
            rowStatus = rows[0].status;
            storedPayloadFingerprint = rows[0].idempotencyKey;
          }

          if (isTerminalRevenueCatSuccess(rowStatus)) {
            return;
          }

          if (rowStatus === RevenueCatWebhookStatus.INVALID_PAYLOAD) {
            return;
          }

          if (
            storedPayloadFingerprint &&
            storedPayloadFingerprint !== idempotencyKey
          ) {
            await tx.revenueCatWebhookEvent.update({
              where: { id: rowId },
              data: {
                status: RevenueCatWebhookStatus.INVALID_PAYLOAD,
                errorMessage: 'payload_integrity_mismatch',
                processedAt: new Date(),
              },
            });
            return;
          }

          await tx.revenueCatWebhookEvent.update({
            where: { id: rowId },
            data: {
              apiVersion: this.readString(body.api_version),
              eventType,
              appUserId: resolvedAppUserId,
              originalAppUserId,
              tenantId,
              eventTimestamp,
              ...(storedPayloadFingerprint ? {} : { idempotencyKey }),
              payload: payload as Prisma.InputJsonValue,
              status: RevenueCatWebhookStatus.RECEIVED,
              processedAt: null,
              errorMessage: null,
            },
          });

          const { snapshotApplied } = await this.applyEvent(
            tx,
            body,
            tenantId,
            resolvedAppUserId,
            eventTimestamp,
          );
          await tx.revenueCatWebhookEvent.update({
            where: { id: rowId },
            data: {
              status: snapshotApplied
                ? RevenueCatWebhookStatus.PROCESSED_APPLIED
                : RevenueCatWebhookStatus.PROCESSED_NOOP,
              processedAt: new Date(),
            },
          });
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
    } catch (error) {
      const after = await this.prisma.revenueCatWebhookEvent.findUnique({
        where: { eventId },
        select: { status: true },
      });
      if (after?.status && isTerminalRevenueCatSuccess(after.status)) {
        return { ok: true, eventId };
      }
      if (after?.status === RevenueCatWebhookStatus.INVALID_PAYLOAD) {
        return { ok: true, eventId };
      }

      const msg = error instanceof Error ? error.message : String(error);
      const updated = await this.prisma.revenueCatWebhookEvent.updateMany({
        where: {
          eventId,
          status: {
            in: [
              RevenueCatWebhookStatus.RECEIVED,
              RevenueCatWebhookStatus.FAILED,
            ],
          },
        },
        data: {
          status: RevenueCatWebhookStatus.FAILED,
          errorMessage: msg,
        },
      });

      if (updated.count === 0) {
        try {
          await this.prisma.revenueCatWebhookEvent.create({
            data: {
              eventId,
              apiVersion: this.readString(body.api_version),
              eventType,
              appUserId: resolvedAppUserId,
              originalAppUserId,
              tenantId,
              eventTimestamp,
              idempotencyKey,
              payload: payload as Prisma.InputJsonValue,
              status: RevenueCatWebhookStatus.FAILED,
              errorMessage: msg,
            },
          });
        } catch (createErr) {
          if (
            !(
              createErr instanceof Prisma.PrismaClientKnownRequestError &&
              createErr.code === 'P2002'
            )
          ) {
            throw createErr;
          }
        }
      }

      throw error;
    }

    return { ok: true, eventId };
  }

  private syntheticMalformedEventId(payload: unknown): string {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload ?? {}))
      .digest('hex');
    return `__rc_malformed__:${fingerprint}`;
  }

  private async appendDeliveryAttempt(args: {
    webhookEventId: string;
    reason: string;
    payload: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.revenueCatWebhookDeliveryAttempt.create({
      data: {
        webhookEventId: args.webhookEventId,
        reason: args.reason,
        payload: args.payload,
      },
    });
  }

  private async persistMalformedWebhook(args: {
    eventId: string;
    eventTypeForRow: string;
    envelope: RevenueCatEventEnvelope;
    rawPayload: unknown;
    reason: string;
  }): Promise<void> {
    const appUserId = this.readString(args.envelope.event?.app_user_id);
    const originalAppUserId = this.readString(
      args.envelope.event?.original_app_user_id,
    );
    const canonicalAppUserId =
      this.resolveCanonicalAppUserIdLocally(appUserId, originalAppUserId) ??
      appUserId;
    const eventTimestamp = this.toDate(
      args.envelope.event?.event_timestamp_ms ??
        args.envelope.event?.event_timestamp,
    );
    const idempotencyKey = this.payloadFingerprint(args.rawPayload);

    const existing = await this.prisma.revenueCatWebhookEvent.findUnique({
      where: { eventId: args.eventId },
      select: { id: true, idempotencyKey: true, status: true },
    });
    if (existing) {
      if (
        existing.idempotencyKey &&
        existing.idempotencyKey !== idempotencyKey &&
        existing.status !== RevenueCatWebhookStatus.INVALID_PAYLOAD
      ) {
        if (!isTerminalRevenueCatSuccess(existing.status)) {
          await this.prisma.revenueCatWebhookEvent.update({
            where: { id: existing.id },
            data: {
              status: RevenueCatWebhookStatus.INVALID_PAYLOAD,
              errorMessage: 'payload_integrity_mismatch',
              processedAt: new Date(),
            },
          });
        } else {
          this.logger.warn(
            `eventId=${args.eventId} malformed duplicate with different payload fingerprint after terminal status=${existing.status}`,
          );
        }
      }
      await this.appendDeliveryAttempt({
        webhookEventId: existing.id,
        reason: args.reason,
        payload: args.envelope as Prisma.InputJsonValue,
      });
      return;
    }

    try {
      await this.prisma.revenueCatWebhookEvent.create({
        data: {
          eventId: args.eventId,
          apiVersion: this.readString(args.envelope.api_version),
          eventType: args.eventTypeForRow,
          appUserId: canonicalAppUserId,
          originalAppUserId,
          tenantId: null,
          eventTimestamp,
          idempotencyKey,
          payload: args.envelope as Prisma.InputJsonValue,
          status: RevenueCatWebhookStatus.IGNORED,
          errorMessage: args.reason,
          processedAt: null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.revenueCatWebhookEvent.findUnique({
          where: { eventId: args.eventId },
          select: { id: true },
        });
        if (again) {
          await this.appendDeliveryAttempt({
            webhookEventId: again.id,
            reason: args.reason,
            payload: args.envelope as Prisma.InputJsonValue,
          });
        }
        return;
      }
      throw error;
    }
  }

  private async markEventIgnored(
    eventId: string,
    payload: unknown,
    body: RevenueCatEventEnvelope,
    eventType: string,
    reason:
      | AppUserResolutionFailureReason
      | 'missing_timestamp'
      | 'stale_replay'
      | 'future_skew',
    incomingPayloadFingerprint: string,
  ): Promise<void> {
    const appUserId = this.readString(body.event?.app_user_id);
    const originalAppUserId = this.readString(body.event?.original_app_user_id);
    const canonicalAppUserId =
      this.resolveCanonicalAppUserIdLocally(appUserId, originalAppUserId) ??
      appUserId;
    const eventTimestamp = this.toDate(
      body.event?.event_timestamp_ms ?? body.event?.event_timestamp,
    );
    const existing = await this.prisma.revenueCatWebhookEvent.findUnique({
      where: { eventId },
      select: { id: true, status: true, idempotencyKey: true },
    });
    if (existing && isTerminalRevenueCatSuccess(existing.status)) {
      return;
    }
    if (existing) {
      if (
        existing.idempotencyKey &&
        existing.idempotencyKey !== incomingPayloadFingerprint &&
        existing.status !== RevenueCatWebhookStatus.INVALID_PAYLOAD
      ) {
        await this.prisma.revenueCatWebhookEvent.update({
          where: { id: existing.id },
          data: {
            status: RevenueCatWebhookStatus.INVALID_PAYLOAD,
            errorMessage: 'payload_integrity_mismatch',
            processedAt: new Date(),
          },
        });
        await this.appendDeliveryAttempt({
          webhookEventId: existing.id,
          reason: 'payload_integrity_mismatch',
          payload: body as Prisma.InputJsonValue,
        });
        return;
      }
      if (existing.status === RevenueCatWebhookStatus.IGNORED) {
        await this.prisma.revenueCatWebhookEvent.update({
          where: { id: existing.id },
          data: {
            errorMessage: reason,
            processedAt: null,
          },
        });
      }
      await this.appendDeliveryAttempt({
        webhookEventId: existing.id,
        reason,
        payload: payload as Prisma.InputJsonValue,
      });
      return;
    }
    try {
      await this.prisma.revenueCatWebhookEvent.create({
        data: {
          eventId,
          apiVersion: this.readString(body.api_version),
          eventType,
          appUserId: canonicalAppUserId,
          originalAppUserId,
          tenantId: null,
          eventTimestamp,
          idempotencyKey: incomingPayloadFingerprint,
          payload: payload as Prisma.InputJsonValue,
          status: RevenueCatWebhookStatus.IGNORED,
          errorMessage: reason,
          processedAt: null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.revenueCatWebhookEvent.findUnique({
          where: { eventId },
          select: { id: true, idempotencyKey: true, status: true },
        });
        if (again) {
          if (
            again.idempotencyKey &&
            again.idempotencyKey !== incomingPayloadFingerprint &&
            again.status !== RevenueCatWebhookStatus.INVALID_PAYLOAD
          ) {
            if (!isTerminalRevenueCatSuccess(again.status)) {
              await this.prisma.revenueCatWebhookEvent.update({
                where: { id: again.id },
                data: {
                  status: RevenueCatWebhookStatus.INVALID_PAYLOAD,
                  errorMessage: 'payload_integrity_mismatch',
                  processedAt: new Date(),
                },
              });
            }
          }
          await this.appendDeliveryAttempt({
            webhookEventId: again.id,
            reason,
            payload: payload as Prisma.InputJsonValue,
          });
        }
        return;
      }
      throw error;
    }
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    body: RevenueCatEventEnvelope,
    tenantId: string | null,
    resolvedAppUserId: string,
    eventTimestamp: Date,
  ): Promise<{ snapshotApplied: boolean }> {
    let snapshotApplied = false;
    const event = (body.event ?? {}) as Record<string, unknown>;
    if (!tenantId || !resolvedAppUserId) {
      return { snapshotApplied };
    }

    const entitlementId = this.readString(event.entitlement_id);
    const productId = this.readString(event.product_id);
    const eventType = this.readString(event.type) ?? 'UNKNOWN';
    const snapshotEntitlementId = resolveSnapshotEntitlementId(
      eventType,
      entitlementId,
      this.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID,
    );
    const eventClass = classifyRevenueCatWebhookEventType(eventType);

    if (eventClass === 'unknown') {
      this.logger.warn(
        `Unknown RevenueCat event type; snapshot tables will not be updated: ${eventType}`,
      );
    }

    const store = this.mapStore(this.readString(event.store));
    const eventId = this.readString(event.id);
    const aliases = this.readStringArray(event.aliases);
    const now = new Date();

    await tx.revenueCatCustomer.upsert({
      where: { tenantId_appUserId: { tenantId, appUserId: resolvedAppUserId } },
      create: {
        tenantId,
        userId: null,
        appUserId: resolvedAppUserId,
        originalAppUserId: this.readString(event.original_app_user_id),
        aliases: aliases.length ? aliases : undefined,
      },
      update: {
        originalAppUserId: this.readString(event.original_app_user_id),
        aliases: aliases.length ? aliases : undefined,
      },
    });

    if (eventClass !== 'snapshot') {
      return { snapshotApplied };
    }

    if (snapshotEntitlementId) {
      await tx.$executeRaw(
        entitlementSnapshotAdvisoryLockSql(tenantId, snapshotEntitlementId),
      );
      const entitlementRow = await tx.revenueCatEntitlementSnapshot.findUnique({
        where: {
          tenantId_entitlementId: {
            tenantId,
            entitlementId: snapshotEntitlementId,
          },
        },
        select: { lastAppliedEventAt: true },
      });
      if (
        !shouldApplyWebhookEventByTimestamp({
          storedLastAppliedAt: entitlementRow?.lastAppliedEventAt,
          incomingEventAt: eventTimestamp,
        })
      ) {
        this.logger.warn(
          `Skipping stale entitlement snapshot update tenantId=${tenantId} entitlementId=${snapshotEntitlementId} incoming_event_at=${eventTimestamp.toISOString()} stored_last_applied_at=${entitlementRow?.lastAppliedEventAt?.toISOString() ?? 'null'}`,
        );
      } else {
        const entitlementState = computeEntitlementStateForSnapshotEvent(
          eventType,
          event,
          now,
        );
        await tx.revenueCatEntitlementSnapshot.upsert({
          where: {
            tenantId_entitlementId: {
              tenantId,
              entitlementId: snapshotEntitlementId,
            },
          },
          create: {
            tenantId,
            appUserId: resolvedAppUserId,
            entitlementId: snapshotEntitlementId,
            state: entitlementState.state,
            isActive: entitlementState.isActive,
            productId,
            store,
            periodType: this.readString(event.period_type),
            purchasedAt: this.toDate(
              event.purchased_at_ms ?? event.purchased_at,
            ),
            originalPurchaseDate: this.toDate(
              event.original_purchase_at_ms ?? event.original_purchase_at,
            ),
            expiresAt: this.toDate(
              event.expiration_at_ms ?? event.expiration_at,
            ),
            gracePeriodExpiresAt: this.toDate(
              event.grace_period_expiration_at_ms ??
                event.grace_period_expiration_at,
            ),
            unsubscribedAt: this.toDate(
              event.unsubscribe_detected_at_ms ?? event.unsubscribe_detected_at,
            ),
            billingIssueDetectedAt: this.toDate(
              event.billing_issues_detected_at_ms ??
                event.billing_issues_detected_at,
            ),
            ownershipType: this.readString(event.ownership_type),
            willRenew: this.toBool(event.will_renew),
            trialType: this.readString(event.offer_type),
            raw: body as Prisma.InputJsonValue,
            updatedFromEventId: eventId ?? undefined,
            lastAppliedEventAt: eventTimestamp,
          },
          update: {
            appUserId: resolvedAppUserId,
            state: entitlementState.state,
            isActive: entitlementState.isActive,
            productId,
            store,
            periodType: this.readString(event.period_type),
            purchasedAt: this.toDate(
              event.purchased_at_ms ?? event.purchased_at,
            ),
            originalPurchaseDate: this.toDate(
              event.original_purchase_at_ms ?? event.original_purchase_at,
            ),
            expiresAt: this.toDate(
              event.expiration_at_ms ?? event.expiration_at,
            ),
            gracePeriodExpiresAt: this.toDate(
              event.grace_period_expiration_at_ms ??
                event.grace_period_expiration_at,
            ),
            unsubscribedAt: this.toDate(
              event.unsubscribe_detected_at_ms ?? event.unsubscribe_detected_at,
            ),
            billingIssueDetectedAt: this.toDate(
              event.billing_issues_detected_at_ms ??
                event.billing_issues_detected_at,
            ),
            ownershipType: this.readString(event.ownership_type),
            willRenew: this.toBool(event.will_renew),
            trialType: this.readString(event.offer_type),
            raw: body as Prisma.InputJsonValue,
            updatedFromEventId: eventId ?? undefined,
            lastAppliedEventAt: eventTimestamp,
          },
        });
        snapshotApplied = true;
      }
    }

    if (productId) {
      await tx.$executeRaw(
        subscriptionSnapshotAdvisoryLockSql(
          tenantId,
          resolvedAppUserId,
          productId,
        ),
      );
      const subscriptionRow =
        await tx.revenueCatSubscriptionSnapshot.findUnique({
          where: {
            tenantId_appUserId_productId: {
              tenantId,
              appUserId: resolvedAppUserId,
              productId,
            },
          },
          select: { lastAppliedEventAt: true },
        });
      if (
        !shouldApplyWebhookEventByTimestamp({
          storedLastAppliedAt: subscriptionRow?.lastAppliedEventAt,
          incomingEventAt: eventTimestamp,
        })
      ) {
        this.logger.warn(
          `Skipping stale subscription snapshot update tenantId=${tenantId} productId=${productId} incoming_event_at=${eventTimestamp.toISOString()} stored_last_applied_at=${subscriptionRow?.lastAppliedEventAt?.toISOString() ?? 'null'}`,
        );
      } else {
        const isSandbox = subscriptionEnvironmentToIsSandbox(event.environment);
        const refundedAtForSubscription =
          this.toDate(event.refunded_at_ms ?? event.refunded_at) ??
          (eventType === 'REFUND' ? eventTimestamp : null);
        const willRenewForSubscription =
          eventType === 'REFUND' ? false : this.toBool(event.will_renew);
        await tx.revenueCatSubscriptionSnapshot.upsert({
          where: {
            tenantId_appUserId_productId: {
              tenantId,
              appUserId: resolvedAppUserId,
              productId,
            },
          },
          create: {
            tenantId,
            appUserId: resolvedAppUserId,
            productId,
            entitlementId: entitlementId ?? undefined,
            store,
            originalTransactionId: this.readString(
              event.original_transaction_id,
            ),
            transactionId: this.readString(event.transaction_id),
            isSandbox,
            periodType: this.readString(event.period_type),
            purchaseStatus: eventType,
            purchasedAt: this.toDate(
              event.purchased_at_ms ?? event.purchased_at,
            ),
            originalPurchaseDate: this.toDate(
              event.original_purchase_at_ms ?? event.original_purchase_at,
            ),
            expiresAt: this.toDate(
              event.expiration_at_ms ?? event.expiration_at,
            ),
            gracePeriodExpiresAt: this.toDate(
              event.grace_period_expiration_at_ms ??
                event.grace_period_expiration_at,
            ),
            cancellationDetectedAt: this.toDate(
              event.unsubscribe_detected_at_ms ?? event.unsubscribe_detected_at,
            ),
            billingIssueDetectedAt: this.toDate(
              event.billing_issues_detected_at_ms ??
                event.billing_issues_detected_at,
            ),
            refundedAt: refundedAtForSubscription,
            willRenew: willRenewForSubscription,
            raw: body as Prisma.InputJsonValue,
            updatedFromEventId: eventId ?? undefined,
            lastAppliedEventAt: eventTimestamp,
          },
          update: {
            entitlementId: entitlementId ?? undefined,
            store,
            originalTransactionId: this.readString(
              event.original_transaction_id,
            ),
            transactionId: this.readString(event.transaction_id),
            isSandbox,
            periodType: this.readString(event.period_type),
            purchaseStatus: eventType,
            purchasedAt: this.toDate(
              event.purchased_at_ms ?? event.purchased_at,
            ),
            originalPurchaseDate: this.toDate(
              event.original_purchase_at_ms ?? event.original_purchase_at,
            ),
            expiresAt: this.toDate(
              event.expiration_at_ms ?? event.expiration_at,
            ),
            gracePeriodExpiresAt: this.toDate(
              event.grace_period_expiration_at_ms ??
                event.grace_period_expiration_at,
            ),
            cancellationDetectedAt: this.toDate(
              event.unsubscribe_detected_at_ms ?? event.unsubscribe_detected_at,
            ),
            billingIssueDetectedAt: this.toDate(
              event.billing_issues_detected_at_ms ??
                event.billing_issues_detected_at,
            ),
            refundedAt: refundedAtForSubscription,
            willRenew: willRenewForSubscription,
            raw: body as Prisma.InputJsonValue,
            updatedFromEventId: eventId ?? undefined,
            lastAppliedEventAt: eventTimestamp,
          },
        });
        snapshotApplied = true;
      }
    }

    return { snapshotApplied };
  }

  /**
   * Webhooks must use `tenant:<tenantId>` as the RevenueCat app user id for this product.
   */
  private parseTenantIdFromWebhookAppUserId(
    appUserId: string | null,
    originalAppUserId: string | null,
  ): string | null {
    const candidates = [appUserId, originalAppUserId].filter((v): v is string =>
      Boolean(v),
    );
    for (const candidate of candidates) {
      if (candidate.startsWith('tenant:')) {
        const value = candidate.slice('tenant:'.length).trim();
        if (value.length > 0) {
          return value;
        }
      }
    }
    return null;
  }

  /** Returns canonical id only when already `tenant:` (no DB). */
  private resolveCanonicalAppUserIdLocally(
    appUserId: string | null,
    originalAppUserId: string | null,
  ): string | null {
    const candidates = [appUserId, originalAppUserId].filter((v): v is string =>
      Boolean(v),
    );
    for (const candidate of candidates) {
      if (candidate.startsWith('tenant:')) {
        const value = candidate.slice('tenant:'.length).trim();
        if (value.length > 0) {
          return `tenant:${value}`;
        }
      }
    }
    return null;
  }

  private async resolveCanonicalAppUserContext(
    appUserId: string | null,
    originalAppUserId: string | null,
  ): Promise<AppUserResolutionResult> {
    const tenantId = this.parseTenantIdFromWebhookAppUserId(
      appUserId,
      originalAppUserId,
    );
    if (!tenantId) {
      return { ok: false, reason: 'invalid_format' };
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return { ok: false, reason: 'tenant_not_found' };
    }
    return {
      ok: true,
      context: {
        resolvedAppUserId: `tenant:${tenant.id}`,
        tenantId: tenant.id,
      },
    };
  }

  private mapStore(store: string | null): AppStore {
    if (!store) {
      return AppStore.UNKNOWN;
    }
    const normalized = store.toUpperCase();
    if (normalized.includes('APP_STORE') || normalized.includes('APPLE')) {
      return AppStore.APPLE_APP_STORE;
    }
    if (normalized.includes('PLAY')) {
      return AppStore.GOOGLE_PLAY;
    }
    if (normalized.includes('STRIPE')) {
      return AppStore.STRIPE;
    }
    return AppStore.UNKNOWN;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((v): v is string => typeof v === 'string');
  }

  private toBool(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  private toDate(value: unknown): Date | null {
    if (typeof value === 'number') {
      // RevenueCat can send ms timestamps.
      const fromMillis = new Date(value > 1e12 ? value : value * 1000);
      return Number.isNaN(fromMillis.getTime()) ? null : fromMillis;
    }
    if (typeof value === 'string') {
      const fromString = new Date(value);
      return Number.isNaN(fromString.getTime()) ? null : fromString;
    }
    return null;
  }
}
