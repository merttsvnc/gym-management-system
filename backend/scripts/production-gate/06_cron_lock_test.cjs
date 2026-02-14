#!/usr/bin/env node
/**
 * Advisory lock 4-step validation (Prisma $queryRaw).
 * Uses PrismaClient with adapter (same as app). No standalone pg usage.
 * 1) prismaA acquire (expect true)
 * 2) prismaB try acquire (expect false - lock held)
 * 3) prismaA release (expect true)
 * 4) prismaB try acquire (expect true - after release)
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const LOCK_NAME = process.env.LOCK_NAME || `gate:test:advisory-lock-${Date.now()}`;

function maskDatabaseUrl(url) {
  if (!url) return '(not set)';
  try {
    const u = new URL(url.replace(/^postgresql:\/\//, 'https://'));
    const db = (u.pathname || '/db').replace(/^\//, '') || 'db';
    return `${u.hostname}:${u.port || 5432}/${db}`;
  } catch {
    return url.replace(/:[^:@]+@/, ':***@');
  }
}

function createPrismaClient(url) {
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter, log: ['error', 'warn'] });
}

async function runDiagnostics(prisma) {
  console.error('--- DIAGNOSTICS (step 1 returned FALSE) ---');
  console.error('DATABASE_URL (masked host/db):', maskDatabaseUrl(process.env.DATABASE_URL));
  console.error('pg_locks (advisory):');
  try {
    const r = await prisma.$queryRaw`
      SELECT pid, locktype, classid, objid, objsubid, granted
      FROM pg_locks WHERE locktype='advisory'
    `;
    console.error(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('pg_locks error:', e.message);
  }
  console.error('Suggestion: Run "npm run gate:cleanup" and retry.');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const prismaA = createPrismaClient(url);
  const prismaB = createPrismaClient(url);

  try {
    // Step 1: prismaA acquire (expect true)
    const r1 = await prismaA.$queryRaw(
      Prisma.sql`SELECT pg_try_advisory_lock(hashtext(${LOCK_NAME})) as acquired`
    );
    const step1 = r1[0]?.acquired ?? false;
    if (!step1) {
      await runDiagnostics(prismaA);
      process.exit(1);
    }

    // Step 2: prismaB try acquire (expect false)
    const r2 = await prismaB.$queryRaw(
      Prisma.sql`SELECT pg_try_advisory_lock(hashtext(${LOCK_NAME})) as acquired`
    );
    const step2 = r2[0]?.acquired ?? true;
    if (step2) {
      console.error('FAIL: Step 2 expected FALSE (lock held by another session)');
      process.exit(1);
    }

    // Step 3: prismaA release (expect true)
    const r3 = await prismaA.$queryRaw(
      Prisma.sql`SELECT pg_advisory_unlock(hashtext(${LOCK_NAME})) as released`
    );
    const step3 = r3[0]?.released ?? false;
    if (!step3) {
      console.error('FAIL: Step 3 release returned FALSE');
      process.exit(1);
    }

    // Step 4: prismaB try acquire again (expect true)
    const r4 = await prismaB.$queryRaw(
      Prisma.sql`SELECT pg_try_advisory_lock(hashtext(${LOCK_NAME})) as acquired`
    );
    const step4 = r4[0]?.acquired ?? false;
    if (!step4) {
      console.error('FAIL: Step 4 expected TRUE after release');
      process.exit(1);
    }

    // Cleanup
    await prismaB.$queryRaw(
      Prisma.sql`SELECT pg_advisory_unlock(hashtext(${LOCK_NAME}))`
    );

    console.log('ok');
  } finally {
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  }
}

main().catch((e) => {
  console.error('Error:', e?.message || e);
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
  }
  process.exit(1);
});
