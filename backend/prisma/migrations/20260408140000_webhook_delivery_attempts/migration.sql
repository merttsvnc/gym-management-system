-- CreateTable
CREATE TABLE "RevenueCatWebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueCatWebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevenueCatWebhookDeliveryAttempt_webhookEventId_receivedAt_idx" ON "RevenueCatWebhookDeliveryAttempt"("webhookEventId", "receivedAt");

-- AddForeignKey
ALTER TABLE "RevenueCatWebhookDeliveryAttempt" ADD CONSTRAINT "RevenueCatWebhookDeliveryAttempt_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "RevenueCatWebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
