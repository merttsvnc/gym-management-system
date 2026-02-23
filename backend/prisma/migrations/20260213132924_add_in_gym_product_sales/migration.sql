-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

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
CREATE INDEX "EmailOtp_email_idx" ON "EmailOtp"("email");

-- CreateIndex
CREATE INDEX "EmailOtp_email_consumedAt_idx" ON "EmailOtp"("email", "consumedAt");

-- CreateIndex
CREATE INDEX "EmailOtp_email_expiresAt_idx" ON "EmailOtp"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "Product_tenantId_branchId_idx" ON "Product"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Product_tenantId_branchId_isActive_idx" ON "Product"("tenantId", "branchId", "isActive");

-- CreateIndex
CREATE INDEX "ProductSale_tenantId_branchId_soldAt_idx" ON "ProductSale"("tenantId", "branchId", "soldAt");

-- CreateIndex
CREATE INDEX "ProductSale_tenantId_branchId_createdAt_idx" ON "ProductSale"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductSale_tenantId_soldAt_idx" ON "ProductSale"("tenantId", "soldAt");

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
