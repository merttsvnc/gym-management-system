-- AlterTable
-- Add archivedAt column to MembershipPlan for soft archiving functionality
ALTER TABLE "MembershipPlan" ADD COLUMN "archivedAt" TIMESTAMP(3);
