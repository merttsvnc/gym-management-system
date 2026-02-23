-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "pendingMembershipEndDate" TIMESTAMP(3),
ADD COLUMN     "pendingMembershipPlanId" TEXT,
ADD COLUMN     "pendingMembershipPriceAtPurchase" DECIMAL(10,2),
ADD COLUMN     "pendingMembershipScheduledAt" TIMESTAMP(3),
ADD COLUMN     "pendingMembershipScheduledByUserId" TEXT,
ADD COLUMN     "pendingMembershipStartDate" TIMESTAMP(3);

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberPlanChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_tenantId_memberId_idx" ON "MemberPlanChangeHistory"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_tenantId_appliedAt_idx" ON "MemberPlanChangeHistory"("tenantId", "appliedAt");

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_tenantId_scheduledAt_idx" ON "MemberPlanChangeHistory"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "MemberPlanChangeHistory_memberId_idx" ON "MemberPlanChangeHistory"("memberId");

-- CreateIndex
CREATE INDEX "Member_tenantId_pendingMembershipPlanId_idx" ON "Member"("tenantId", "pendingMembershipPlanId");

-- CreateIndex
CREATE INDEX "Member_tenantId_pendingMembershipStartDate_idx" ON "Member"("tenantId", "pendingMembershipStartDate");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_pendingMembershipPlanId_fkey" FOREIGN KEY ("pendingMembershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_pendingMembershipScheduledByUserId_fkey" FOREIGN KEY ("pendingMembershipScheduledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPlanChangeHistory" ADD CONSTRAINT "MemberPlanChangeHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPlanChangeHistory" ADD CONSTRAINT "MemberPlanChangeHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPlanChangeHistory" ADD CONSTRAINT "MemberPlanChangeHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
