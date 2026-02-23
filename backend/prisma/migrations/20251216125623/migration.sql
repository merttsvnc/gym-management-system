-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_membershipPlanId_fkey";

-- DropIndex
DROP INDEX "MembershipPlan_tenantId_name_key";

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
