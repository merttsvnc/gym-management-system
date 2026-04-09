import { RevenueCatWebhookStatus } from '@prisma/client';
import { validateEnv } from '../config/env';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';

function buildSnapshotPayload(args: {
  eventId: string;
  tenantId: string;
  eventTimestampMs: number;
  premiumEntitlementId: string;
}) {
  return {
    api_version: '1.0',
    event: {
      id: args.eventId,
      type: 'INITIAL_PURCHASE',
      app_user_id: `tenant:${args.tenantId}`,
      event_timestamp_ms: args.eventTimestampMs,
      product_id: 'prod_webhook_retry_test',
      entitlement_id: args.premiumEntitlementId,
      store: 'APP_STORE',
      environment: 'SANDBOX',
    },
  };
}

describe('RevenueCatWebhookService', () => {
  const replayWindowMs = 60 * 60 * 1000;
  let env: ReturnType<typeof validateEnv>;
  let service: RevenueCatWebhookService;

  const findUniqueWebhookEvent = jest.fn();
  const createWebhookEvent = jest.fn();
  const updateWebhookEvent = jest.fn();
  const updateManyWebhookEvent = jest.fn();
  const createDeliveryAttempt = jest.fn();
  const findUniqueTenant = jest.fn();
  const $transaction = jest.fn();

  const queryRaw = jest.fn();
  const revenueCatCustomerUpsert = jest.fn();
  const executeRaw = jest.fn();
  const findUniqueEntitlementSnapshot = jest.fn();
  const upsertEntitlementSnapshot = jest.fn();
  const findUniqueSubscriptionSnapshot = jest.fn();
  const upsertSubscriptionSnapshot = jest.fn();

  function mockTx() {
    return {
      $queryRaw: queryRaw,
      revenueCatWebhookEvent: {
        create: createWebhookEvent,
        update: updateWebhookEvent,
      },
      revenueCatCustomer: { upsert: revenueCatCustomerUpsert },
      $executeRaw: executeRaw,
      revenueCatEntitlementSnapshot: {
        findUnique: findUniqueEntitlementSnapshot,
        upsert: upsertEntitlementSnapshot,
      },
      revenueCatSubscriptionSnapshot: {
        findUnique: findUniqueSubscriptionSnapshot,
        upsert: upsertSubscriptionSnapshot,
      },
    };
  }

  const prismaMock = {
    revenueCatWebhookEvent: {
      findUnique: findUniqueWebhookEvent,
      create: createWebhookEvent,
      update: updateWebhookEvent,
      updateMany: updateManyWebhookEvent,
    },
    revenueCatWebhookDeliveryAttempt: {
      create: createDeliveryAttempt,
    },
    tenant: { findUnique: findUniqueTenant },
    $transaction,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    env = validateEnv();
    service = new RevenueCatWebhookService(
      prismaMock as unknown as import('../prisma/prisma.service').PrismaService,
      replayWindowMs,
      env,
    );
    $transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn(mockTx());
    });
  });

  describe('IGNORED retry and idempotency', () => {
    it('tenant_not_found → IGNORED → tenant exists → same eventId → PROCESSED (single apply)', async () => {
      const tenantId = 't-wh-1';
      const eventId = 'ev-wh-1';
      const ts = Date.now();
      const payload = buildSnapshotPayload({
        eventId,
        tenantId,
        eventTimestampMs: ts,
        premiumEntitlementId: env.REVENUECAT_PREMIUM_ENTITLEMENT_ID,
      });

      findUniqueWebhookEvent
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      findUniqueTenant.mockResolvedValueOnce(null);

      await service.processWebhook(payload);

      expect(createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId,
            status: RevenueCatWebhookStatus.IGNORED,
            errorMessage: 'tenant_not_found',
            processedAt: null,
          }),
        }),
      );
      expect($transaction).not.toHaveBeenCalled();

      findUniqueWebhookEvent.mockReset();
      findUniqueTenant.mockReset();
      createWebhookEvent.mockReset();
      queryRaw.mockReset();
      updateWebhookEvent.mockReset();
      revenueCatCustomerUpsert.mockReset();
      executeRaw.mockReset();
      findUniqueEntitlementSnapshot.mockReset();
      upsertEntitlementSnapshot.mockReset();
      findUniqueSubscriptionSnapshot.mockReset();
      upsertSubscriptionSnapshot.mockReset();

      findUniqueWebhookEvent.mockResolvedValue({
        id: 'row-1',
        status: RevenueCatWebhookStatus.IGNORED,
      });
      findUniqueTenant.mockResolvedValue({ id: tenantId });

      queryRaw.mockResolvedValue([{ id: 'row-1', status: RevenueCatWebhookStatus.IGNORED }]);
      findUniqueEntitlementSnapshot.mockResolvedValue({ lastAppliedEventAt: null });
      findUniqueSubscriptionSnapshot.mockResolvedValue({ lastAppliedEventAt: null });

      await service.processWebhook(payload);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(updateWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'row-1' },
          data: expect.objectContaining({
            status: RevenueCatWebhookStatus.RECEIVED,
            tenantId,
          }),
        }),
      );
      expect(updateWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'row-1' },
          data: expect.objectContaining({ status: RevenueCatWebhookStatus.PROCESSED }),
        }),
      );
      expect(revenueCatCustomerUpsert).toHaveBeenCalledTimes(1);
      expect(upsertEntitlementSnapshot).toHaveBeenCalledTimes(1);
      expect(upsertSubscriptionSnapshot).toHaveBeenCalledTimes(1);
    });

    it('stale_replay IGNORED then fresh timestamp on same eventId runs transaction', async () => {
      const tenantId = 't-wh-2';
      const eventId = 'ev-wh-2';
      const staleMs = Date.now() - replayWindowMs - 60_000;
      const freshMs = Date.now();

      findUniqueTenant.mockResolvedValue({ id: tenantId });

      const payloadStale = buildSnapshotPayload({
        eventId,
        tenantId,
        eventTimestampMs: staleMs,
        premiumEntitlementId: env.REVENUECAT_PREMIUM_ENTITLEMENT_ID,
      });
      findUniqueWebhookEvent.mockResolvedValue(null);
      await service.processWebhook(payloadStale);

      expect(createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RevenueCatWebhookStatus.IGNORED,
            errorMessage: 'stale_replay',
            processedAt: null,
          }),
        }),
      );

      jest.clearAllMocks();
      findUniqueTenant.mockResolvedValue({ id: tenantId });
      const payloadFresh = buildSnapshotPayload({
        eventId,
        tenantId,
        eventTimestampMs: freshMs,
        premiumEntitlementId: env.REVENUECAT_PREMIUM_ENTITLEMENT_ID,
      });
      findUniqueWebhookEvent.mockResolvedValue(null);
      queryRaw.mockResolvedValue([{ id: 'row-2', status: RevenueCatWebhookStatus.IGNORED }]);
      findUniqueEntitlementSnapshot.mockResolvedValue({ lastAppliedEventAt: null });
      findUniqueSubscriptionSnapshot.mockResolvedValue({ lastAppliedEventAt: null });

      await service.processWebhook(payloadFresh);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(upsertEntitlementSnapshot).toHaveBeenCalled();
    });

    it('duplicate IGNORED deliveries (tenant still missing) keep one row and record delivery attempts', async () => {
      const tenantId = 't-wh-3';
      const eventId = 'ev-wh-3';
      const ts = Date.now();
      const payload = buildSnapshotPayload({
        eventId,
        tenantId,
        eventTimestampMs: ts,
        premiumEntitlementId: env.REVENUECAT_PREMIUM_ENTITLEMENT_ID,
      });

      findUniqueTenant.mockResolvedValue(null);

      findUniqueWebhookEvent.mockResolvedValue(null);
      await service.processWebhook(payload);
      expect(createWebhookEvent).toHaveBeenCalledTimes(1);

      const row = {
        id: 'w-ign',
        status: RevenueCatWebhookStatus.IGNORED,
      };
      findUniqueWebhookEvent.mockResolvedValue(row);
      await service.processWebhook(payload);

      expect(createDeliveryAttempt).toHaveBeenCalledWith({
        data: expect.objectContaining({
          webhookEventId: 'w-ign',
          reason: 'tenant_not_found',
        }),
      });

      await service.processWebhook(payload);
      expect(createDeliveryAttempt).toHaveBeenCalledTimes(2);
      expect(createWebhookEvent).toHaveBeenCalledTimes(1);
    });

    it('PROCESSED short-circuits without transaction or side effects', async () => {
      const tenantId = 't-wh-4';
      const eventId = 'ev-wh-4';
      const payload = buildSnapshotPayload({
        eventId,
        tenantId,
        eventTimestampMs: Date.now(),
        premiumEntitlementId: env.REVENUECAT_PREMIUM_ENTITLEMENT_ID,
      });

      findUniqueWebhookEvent.mockResolvedValue({
        id: 'done',
        status: RevenueCatWebhookStatus.PROCESSED,
      });

      await service.processWebhook(payload);

      expect($transaction).not.toHaveBeenCalled();
      expect(findUniqueTenant).not.toHaveBeenCalled();
    });
  });
});
