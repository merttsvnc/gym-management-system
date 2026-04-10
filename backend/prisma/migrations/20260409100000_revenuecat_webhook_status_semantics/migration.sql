-- Expand webhook status enum for applied vs noop processing and invalid payloads.
-- These ALTER TYPE statements are idempotent (IF NOT EXISTS) and safe for both fresh and existing databases.

ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'PROCESSED_APPLIED';
ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'PROCESSED_NOOP';
ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'INVALID_PAYLOAD';

-- Historical PROCESSED rows are treated as snapshot-applied (conservative observability default).
UPDATE "RevenueCatWebhookEvent"
SET status = 'PROCESSED_APPLIED'
WHERE status = 'PROCESSED';
