-- Expand webhook status enum for applied vs noop processing and invalid payloads.
-- Enum values have been added manually via ALTER TYPE commands.
-- This migration only updates historical data.

-- Historical PROCESSED rows are treated as snapshot-applied (conservative observability default).
UPDATE "RevenueCatWebhookEvent"
SET status = 'PROCESSED_APPLIED'
WHERE status = 'PROCESSED';
