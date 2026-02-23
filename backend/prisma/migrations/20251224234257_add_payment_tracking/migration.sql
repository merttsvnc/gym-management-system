-- Migration: 20251224234257_add_payment_tracking
-- Purpose: Add Payment tracking system with PaymentMethod enum, Payment model, and IdempotencyKey model
-- 
-- Rollback steps (if needed):
-- 1. DROP TABLE "IdempotencyKey";
-- 2. DROP TABLE "Payment";
-- 3. DROP TYPE "PaymentMethod";
--
-- Note: Rollback will remove all payment data. Ensure backup if needed.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" VARCHAR(500),
    "isCorrection" BOOLEAN NOT NULL DEFAULT false,
    "correctedPaymentId" TEXT,
    "isCorrected" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_correctedPaymentId_key" ON "Payment"("correctedPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_branchId_idx" ON "Payment"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_memberId_idx" ON "Payment"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paidOn_idx" ON "Payment"("tenantId", "paidOn");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paymentMethod_idx" ON "Payment"("tenantId", "paymentMethod");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paidOn_branchId_idx" ON "Payment"("tenantId", "paidOn", "branchId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paidOn_paymentMethod_idx" ON "Payment"("tenantId", "paidOn", "paymentMethod");

-- CreateIndex
CREATE INDEX "Payment_memberId_idx" ON "Payment"("memberId");

-- CreateIndex
CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");

-- CreateIndex
CREATE INDEX "Payment_correctedPaymentId_idx" ON "Payment"("correctedPaymentId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_isCorrection_idx" ON "Payment"("tenantId", "isCorrection");

-- CreateIndex
CREATE INDEX "Payment_tenantId_isCorrected_idx" ON "Payment"("tenantId", "isCorrected");

-- CreateIndex
CREATE INDEX "IdempotencyKey_key_idx" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_correctedPaymentId_fkey" FOREIGN KEY ("correctedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

