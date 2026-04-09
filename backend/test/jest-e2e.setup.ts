/**
 * Jest e2e test setup file
 * Ensures required env vars are set for Prisma and app initialization
 */

// Ensure DATABASE_URL is set for tests
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://mertsevinc@localhost:5432/gym_management_test?schema=public';
}

// PR-4: Ensure required env vars for config (tests bypass main.ts validateEnv)
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
}
if (!process.env.JWT_SIGNUP_SECRET || process.env.JWT_SIGNUP_SECRET.length < 32) {
  process.env.JWT_SIGNUP_SECRET = 'b'.repeat(32);
}
if (!process.env.JWT_RESET_SECRET || process.env.JWT_RESET_SECRET.length < 32) {
  process.env.JWT_RESET_SECRET = 'c'.repeat(32);
}
if (!process.env.REVENUECAT_WEBHOOK_SECRET || process.env.REVENUECAT_WEBHOOK_SECRET.length < 16) {
  process.env.REVENUECAT_WEBHOOK_SECRET = 'd'.repeat(16);
}
if (!process.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID) {
  process.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID = 'premium';
}
