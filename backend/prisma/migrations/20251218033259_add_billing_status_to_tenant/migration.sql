-- Migration: 20251218033259_add_billing_status_to_tenant
-- Purpose: Add billing status fields to Tenant model for access control
-- 
-- Rollback steps (if needed):
-- 1. DROP INDEX "Tenant_billingStatus_idx";
-- 2. ALTER TABLE "Tenant" DROP COLUMN "billingStatusUpdatedAt";
-- 3. ALTER TABLE "Tenant" DROP COLUMN "billingStatus";
-- 4. DROP TYPE "BillingStatus";
--
-- Note: Rollback will remove billing status data. Ensure backup if needed.

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "billingStatusUpdatedAt" TIMESTAMP(3);

-- Backfill existing tenants: set billingStatus to ACTIVE and billingStatusUpdatedAt to createdAt
-- This ensures all existing tenants are treated as active (paid and current)
UPDATE "Tenant" 
SET "billingStatus" = 'ACTIVE',
    "billingStatusUpdatedAt" = "createdAt"
WHERE "billingStatusUpdatedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Tenant_billingStatus_idx" ON "Tenant"("billingStatus");
