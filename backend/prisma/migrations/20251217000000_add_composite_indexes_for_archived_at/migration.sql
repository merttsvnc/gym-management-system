-- Add composite indexes for common query patterns
-- These indexes improve performance for filtering by tenantId + archivedAt
-- and tenantId + archivedAt + status combinations

-- Index for filtering by tenantId and archivedAt (used in listPlansForTenant when includeArchived=false)
CREATE INDEX IF NOT EXISTS "MembershipPlan_tenantId_archivedAt_idx" 
ON "MembershipPlan"("tenantId", "archivedAt");

-- Index for filtering by tenantId, archivedAt, and status (for combined filtering)
CREATE INDEX IF NOT EXISTS "MembershipPlan_tenantId_archivedAt_status_idx" 
ON "MembershipPlan"("tenantId", "archivedAt", "status");

