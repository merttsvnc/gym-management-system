-- Production DB fix: Rebaseline _prisma_migrations
-- Run this ONCE before deploying the new baseline migration.
-- This clears failed/old migration records and marks baseline as applied.
-- Production schema already has all tables; we only update migration history.

DELETE FROM "_prisma_migrations";

INSERT INTO "_prisma_migrations" (
  id,
  checksum,
  finished_at,
  migration_name,
  logs,
  rolled_back_at,
  started_at,
  applied_steps_count
) VALUES (
  gen_random_uuid()::text,
  '',
  NOW(),
  '20251205000000_baseline',
  NULL,
  NULL,
  NOW(),
  1
);
