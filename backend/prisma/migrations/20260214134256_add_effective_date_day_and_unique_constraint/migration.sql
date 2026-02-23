-- AlterTable
ALTER TABLE "MemberPlanChangeHistory" ADD COLUMN "effectiveDateDay" DATE;

-- Backfill effectiveDateDay for existing APPLIED records (defense-in-depth for uniqueness)
-- Use AT TIME ZONE 'UTC' to ensure deterministic UTC date (session timezone would be ambiguous)
UPDATE "MemberPlanChangeHistory"
SET "effectiveDateDay" = ("newStartDate" AT TIME ZONE 'UTC')::date
WHERE "changeType" = 'APPLIED' AND "newStartDate" IS NOT NULL;

-- Partial unique index: prevent duplicate APPLIED history for same member and effective date
CREATE UNIQUE INDEX "MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key"
ON "MemberPlanChangeHistory" ("memberId", "effectiveDateDay")
WHERE "changeType" = 'APPLIED';
