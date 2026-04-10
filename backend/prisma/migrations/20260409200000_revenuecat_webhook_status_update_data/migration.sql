-- Backfill: historical PROCESSED rows are treated as snapshot-applied.
-- Runs in a separate migration so the enum values added in
-- 20260409100000_revenuecat_webhook_status_semantics are committed before use
-- (PostgreSQL 55P04 constraint: new enum values cannot be used in the same transaction
-- in which they were added).

UPDATE "RevenueCatWebhookEvent"
SET status = 'PROCESSED_APPLIED'
WHERE status = 'PROCESSED';
