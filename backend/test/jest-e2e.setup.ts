/**
 * Jest e2e test setup file
 * Ensures DATABASE_URL is set for Prisma Client initialization
 */

// Ensure DATABASE_URL is set for tests
// If not set, use a default test database URL
// IMPORTANT: This must run before PrismaClient is instantiated
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/gym_management_test';
  
  // Log for debugging (can be removed in production)
  console.log('[jest-e2e.setup] DATABASE_URL set to:', process.env.DATABASE_URL);
}

