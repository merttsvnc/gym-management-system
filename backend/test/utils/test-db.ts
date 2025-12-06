import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { execSync } from 'child_process';

/**
 * Singleton Prisma client for tests
 * Uses DATABASE_URL from environment (should be a test database)
 * DATABASE_URL is set in test/jest-e2e.setup.ts
 */
const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/gym_management_test';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

/**
 * Initialize test database
 * Runs migrations to ensure schema is up to date
 */
export async function initTestDatabase() {
  try {
    // Run migrations
    execSync('npx prisma migrate deploy', {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gym_management_test',
      },
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Failed to initialize test database:', error);
    throw error;
  }
}

/**
 * Reset database by deleting all data
 * Order matters due to foreign key constraints
 */
export async function resetDatabase() {
  try {
    // Delete in order to respect foreign keys
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  await prisma.$disconnect();
}

/**
 * Setup function for test suites
 * Call in beforeAll
 */
export async function setupTestDatabase() {
  await initTestDatabase();
  await resetDatabase();
}

/**
 * Cleanup function for test suites
 * Call in afterAll
 */
export async function cleanupTestDatabase() {
  await resetDatabase();
  await closeDatabase();
}
