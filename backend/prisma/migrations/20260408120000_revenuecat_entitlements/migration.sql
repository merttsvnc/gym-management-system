-- CreateEnum
CREATE TYPE "AppStore" AS ENUM ('APPLE_APP_STORE', 'GOOGLE_PLAY', 'STRIPE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EntitlementState" AS ENUM ('ACTIVE', 'INACTIVE', 'GRACE_PERIOD', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RevenueCatWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "RevenueCatCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "appUserId" TEXT NOT NULL,
    "originalAppUserId" TEXT,
    "aliases" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueCatCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueCatEntitlementSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "state" "EntitlementState" NOT NULL DEFAULT 'INACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "store" "AppStore" NOT NULL DEFAULT 'UNKNOWN',
    "periodType" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "originalPurchaseDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "gracePeriodExpiresAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "billingIssueDetectedAt" TIMESTAMP(3),
    "ownershipType" TEXT,
    "willRenew" BOOLEAN,
    "trialType" TEXT,
    "raw" JSONB,
    "updatedFromEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueCatEntitlementSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueCatSubscriptionSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "entitlementId" TEXT,
    "store" "AppStore" NOT NULL DEFAULT 'UNKNOWN',
    "originalTransactionId" TEXT,
    "transactionId" TEXT,
    "isSandbox" BOOLEAN,
    "periodType" TEXT,
    "purchaseStatus" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "originalPurchaseDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "gracePeriodExpiresAt" TIMESTAMP(3),
    "cancellationDetectedAt" TIMESTAMP(3),
    "billingIssueDetectedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "willRenew" BOOLEAN,
    "raw" JSONB,
    "updatedFromEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueCatSubscriptionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueCatWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "apiVersion" TEXT,
    "eventType" TEXT NOT NULL,
    "appUserId" TEXT,
    "originalAppUserId" TEXT,
    "tenantId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventTimestamp" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "status" "RevenueCatWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "RevenueCatWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenueCatCustomer_tenantId_appUserId_key" ON "RevenueCatCustomer"("tenantId", "appUserId");

-- CreateIndex
CREATE INDEX "RevenueCatCustomer_userId_idx" ON "RevenueCatCustomer"("userId");

-- CreateIndex
CREATE INDEX "RevenueCatCustomer_appUserId_idx" ON "RevenueCatCustomer"("appUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueCatEntitlementSnapshot_tenantId_entitlementId_key" ON "RevenueCatEntitlementSnapshot"("tenantId", "entitlementId");

-- CreateIndex
CREATE INDEX "RevenueCatEntitlementSnapshot_tenantId_isActive_idx" ON "RevenueCatEntitlementSnapshot"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "RevenueCatEntitlementSnapshot_tenantId_appUserId_idx" ON "RevenueCatEntitlementSnapshot"("tenantId", "appUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueCatSubscriptionSnapshot_tenantId_appUserId_productId_key" ON "RevenueCatSubscriptionSnapshot"("tenantId", "appUserId", "productId");

-- CreateIndex
CREATE INDEX "RevenueCatSubscriptionSnapshot_tenantId_appUserId_idx" ON "RevenueCatSubscriptionSnapshot"("tenantId", "appUserId");

-- CreateIndex
CREATE INDEX "RevenueCatSubscriptionSnapshot_tenantId_entitlementId_idx" ON "RevenueCatSubscriptionSnapshot"("tenantId", "entitlementId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueCatWebhookEvent_eventId_key" ON "RevenueCatWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "RevenueCatWebhookEvent_tenantId_idx" ON "RevenueCatWebhookEvent"("tenantId");

-- CreateIndex
CREATE INDEX "RevenueCatWebhookEvent_appUserId_idx" ON "RevenueCatWebhookEvent"("appUserId");

-- CreateIndex
CREATE INDEX "RevenueCatWebhookEvent_eventType_receivedAt_idx" ON "RevenueCatWebhookEvent"("eventType", "receivedAt");

-- CreateIndex
CREATE INDEX "RevenueCatWebhookEvent_receivedAt_idx" ON "RevenueCatWebhookEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "RevenueCatCustomer" ADD CONSTRAINT "RevenueCatCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueCatCustomer" ADD CONSTRAINT "RevenueCatCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueCatEntitlementSnapshot" ADD CONSTRAINT "RevenueCatEntitlementSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueCatSubscriptionSnapshot" ADD CONSTRAINT "RevenueCatSubscriptionSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueCatWebhookEvent" ADD CONSTRAINT "RevenueCatWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
