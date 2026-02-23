-- CreatePlanScope enum
CREATE TYPE "PlanScope" AS ENUM ('TENANT', 'BRANCH');

-- Step 1: Add scope column with default 'TENANT'
ALTER TABLE "MembershipPlan" 
ADD COLUMN "scope" "PlanScope" NOT NULL DEFAULT 'TENANT';

-- Step 2: Add branchId column (nullable)
ALTER TABLE "MembershipPlan" 
ADD COLUMN "branchId" TEXT;

-- Step 3: Add scopeKey column with default 'TENANT'
ALTER TABLE "MembershipPlan" 
ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT 'TENANT';

-- Step 4: Update all existing plans to ensure they have correct values
-- This ensures all existing plans are properly migrated to TENANT scope
-- Even though defaults are set, this explicit update ensures data consistency
UPDATE "MembershipPlan" 
SET 
  "scope" = 'TENANT',
  "branchId" = NULL,
  "scopeKey" = 'TENANT';

-- Step 5: Add foreign key constraint for branchId → Branch.id with ON DELETE RESTRICT
ALTER TABLE "MembershipPlan" 
ADD CONSTRAINT "MembershipPlan_branchId_fkey" 
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") 
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 6: Drop existing unique constraint @@unique([tenantId, name])
ALTER TABLE "MembershipPlan" 
DROP CONSTRAINT IF EXISTS "MembershipPlan_tenantId_name_key";

-- Step 7: Add new unique constraint @@unique([tenantId, scope, scopeKey, name])
CREATE UNIQUE INDEX "MembershipPlan_tenantId_scope_scopeKey_name_key" 
ON "MembershipPlan"("tenantId", "scope", "scopeKey", "name");

-- Step 8: Add indexes for performance
CREATE INDEX "MembershipPlan_tenantId_scope_idx" ON "MembershipPlan"("tenantId", "scope");
CREATE INDEX "MembershipPlan_tenantId_scope_status_idx" ON "MembershipPlan"("tenantId", "scope", "status");
CREATE INDEX "MembershipPlan_tenantId_branchId_idx" ON "MembershipPlan"("tenantId", "branchId");
CREATE INDEX "MembershipPlan_branchId_idx" ON "MembershipPlan"("branchId");

