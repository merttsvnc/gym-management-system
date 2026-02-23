-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "PlanKey" AS ENUM ('SINGLE');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'PAUSED', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemberGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER');

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DurationType" AS ENUM ('DAYS', 'MONTHS');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanScope" AS ENUM ('TENANT', 'BRANCH');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "planKey" "PlanKey" NOT NULL DEFAULT 'SINGLE',
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
    "billingStatusUpdatedAt" TIMESTAMP(3),
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" "PlanScope" NOT NULL DEFAULT 'TENANT',
    "branchId" TEXT,
    "scopeKey" TEXT NOT NULL DEFAULT 'TENANT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationType" "DurationType" NOT NULL,
    "durationValue" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "maxFreezeDays" INTEGER,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "status" "PlanStatus" NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "MemberGender",
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "photoUrl" TEXT,
    "address" TEXT,
    "district" TEXT,
    "nationalId" TEXT,
    "maritalStatus" "MaritalStatus",
    "occupation" TEXT,
    "industry" TEXT,
    "bloodType" "BloodType",
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "membershipPlanId" TEXT NOT NULL,
    "membershipStartDate" TIMESTAMP(3) NOT NULL,
    "membershipEndDate" TIMESTAMP(3) NOT NULL,
    "membershipPriceAtPurchase" DECIMAL(10,2),
    "pendingMembershipPlanId" TEXT,
    "pendingMembershipStartDate" TIMESTAMP(3),
    "pendingMembershipEndDate" TIMESTAMP(3),
    "pendingMembershipPriceAtPurchase" DECIMAL(10,2),
    "pendingMembershipScheduledAt" TIMESTAMP(3),
    "pendingMembershipScheduledByUserId" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "MemberPlanChangeHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "oldPlanId" TEXT,
    "newPlanId" TEXT,
    "oldStartDate" TIMESTAMP(3),
    "oldEndDate" TIMESTAMP(3),
    "newStartDate" TIMESTAMP(3),
    "newEndDate" TIMESTAMP(3),
    "oldPriceAtPurchase" DECIMAL(10,2),
    "newPriceAtPurchase" DECIMAL(10,2),
    "changeType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "changedByUserId" TEXT,
    "effectiveDateDay" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberPlanChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailySentCount" INTEGER NOT NULL DEFAULT 0,
    "dailySentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailySentCount" INTEGER NOT NULL DEFAULT 0,
    "dailySentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultPrice" DECIMAL(12,2) NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" VARCHAR(500),
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT,
    "customName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueMonthLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueMonthLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_billingStatus_idx" ON "Tenant"("billingStatus");

-- CreateIndex
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- CreateIndex
CREATE INDEX "Branch_tenantId_isActive_idx" ON "Branch"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Branch_tenantId_isDefault_idx" ON "Branch"("tenantId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_name_key" ON "Branch"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_id_tenantId_key" ON "Branch"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_idx" ON "MembershipPlan"("tenantId");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_scope_idx" ON "MembershipPlan"("tenantId", "scope");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_status_idx" ON "MembershipPlan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_scope_status_idx" ON "MembershipPlan"("tenantId", "scope", "status");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_branchId_idx" ON "MembershipPlan"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "MembershipPlan_branchId_idx" ON "MembershipPlan"("branchId");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_sortOrder_idx" ON "MembershipPlan"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_archivedAt_idx" ON "MembershipPlan"("tenantId", "archivedAt");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_archivedAt_status_idx" ON "MembershipPlan"("tenantId", "archivedAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_tenantId_scope_scopeKey_name_key" ON "MembershipPlan"("tenantId", "scope", "scopeKey", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_id_tenantId_key" ON "MembershipPlan"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Member_tenantId_branchId_idx" ON "Member"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Member_tenantId_phone_idx" ON "Member"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Member_membershipPlanId_idx" ON "Member"("membershipPlanId");

-- CreateIndex
CREATE INDEX "Member_tenantId_membershipPlanId_idx" ON "Member"("tenantId", "membershipPlanId");

-- CreateIndex
CREATE INDEX "Member_tenantId_nationalId_idx" ON "Member"("tenantId", "nationalId");

-- CreateIndex
CREATE INDEX "Member_tenantId_emergencyContactPhone_idx" ON "Member"("tenantId", "emergencyContactPhone");

-- CreateIndex
CREATE INDEX "Member_tenantId_pendingMembershipPlanId_idx" ON "Member"("tenantId", "pendingMembershipPlanId");

-- CreateIndex
CREATE INDEX "Member_tenantId_pendingMembershipStartDate_idx" ON "Member"("tenantId", "pendingMembershipStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "Member_tenantId_phone_key" ON "Member"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Member_id_tenantId_key" ON "Member"("id", "tenantId");

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
CREATE UNIQUE INDEX "Payment_id_tenantId_key" ON "Payment"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_key_idx" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_tenantId_memberId_idx" ON "MemberPlanChangeHistory"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_tenantId_appliedAt_idx" ON "MemberPlanChangeHistory"("tenantId", "appliedAt");

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_tenantId_scheduledAt_idx" ON "MemberPlanChangeHistory"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_memberId_idx" ON "MemberPlanChangeHistory"("memberId");

-- CreateIndex
CREATE INDEX "EmailOtp_email_idx" ON "EmailOtp"("email");

-- CreateIndex
CREATE INDEX "EmailOtp_email_consumedAt_idx" ON "EmailOtp"("email", "consumedAt");

-- CreateIndex
CREATE INDEX "EmailOtp_email_expiresAt_idx" ON "EmailOtp"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_idx" ON "PasswordResetOtp"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_expiresAt_idx" ON "PasswordResetOtp"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_createdAt_idx" ON "PasswordResetOtp"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_tenantId_branchId_idx" ON "Product"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Product_tenantId_branchId_isActive_idx" ON "Product"("tenantId", "branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_tenantId_branchId_key" ON "Product"("id", "tenantId", "branchId");

-- CreateIndex
CREATE INDEX "ProductSale_tenantId_branchId_soldAt_idx" ON "ProductSale"("tenantId", "branchId", "soldAt");

-- CreateIndex
CREATE INDEX "ProductSale_tenantId_branchId_createdAt_idx" ON "ProductSale"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductSale_tenantId_soldAt_idx" ON "ProductSale"("tenantId", "soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSale_id_tenantId_branchId_key" ON "ProductSale"("id", "tenantId", "branchId");

-- CreateIndex
CREATE INDEX "ProductSaleItem_tenantId_branchId_idx" ON "ProductSaleItem"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "ProductSaleItem_saleId_idx" ON "ProductSaleItem"("saleId");

-- CreateIndex
CREATE INDEX "ProductSaleItem_productId_idx" ON "ProductSaleItem"("productId");

-- CreateIndex
CREATE INDEX "ProductSaleItem_tenantId_saleId_idx" ON "ProductSaleItem"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "RevenueMonthLock_tenantId_branchId_idx" ON "RevenueMonthLock"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "RevenueMonthLock_tenantId_month_idx" ON "RevenueMonthLock"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueMonthLock_tenantId_branchId_month_key" ON "RevenueMonthLock"("tenantId", "branchId", "month");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_pendingMembershipPlanId_fkey" FOREIGN KEY ("pendingMembershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_pendingMembershipScheduledByUserId_fkey" FOREIGN KEY ("pendingMembershipScheduledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_correctedPaymentId_fkey" FOREIGN KEY ("correctedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPlanChangeHistory" ADD CONSTRAINT "MemberPlanChangeHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPlanChangeHistory" ADD CONSTRAINT "MemberPlanChangeHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPlanChangeHistory" ADD CONSTRAINT "MemberPlanChangeHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSaleItem" ADD CONSTRAINT "ProductSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ProductSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSaleItem" ADD CONSTRAINT "ProductSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

