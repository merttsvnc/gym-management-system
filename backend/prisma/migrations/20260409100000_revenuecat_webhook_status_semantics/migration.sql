-- Expand webhook status enum for applied vs noop processing and invalid payloads.
-- These ALTER TYPE statements are idempotent (IF NOT EXISTS) and safe for both fresh and existing databases.
--
-- NOTE: PostgreSQL does not allow newly-added enum values to be used in the same transaction.
-- The data migration (UPDATE) is intentionally placed in the next migration file.

ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'PROCESSED_APPLIED';
ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'PROCESSED_NOOP';
ALTER TYPE "RevenueCatWebhookStatus" ADD VALUE IF NOT EXISTS 'INVALID_PAYLOAD';
