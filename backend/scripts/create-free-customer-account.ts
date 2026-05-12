#!/usr/bin/env ts-node
/**
 * Free Customer Account Setup
 *
 * Creates or updates a real customer account with premium/active billing access.
 * After running this script, /auth/me will return:
 *   billingStatus    = ACTIVE
 *   hasPremiumAccess = true
 *
 * SAFETY:
 *   - Idempotent — safe to re-run; existing records are updated, not duplicated.
 *   - NOT executed on app startup; must be run manually.
 *   - Password is never logged.
 *   - No fake/demo data is created (no members, plans, or payments).
 *
 * REQUIRED ENV VARS:
 *   DATABASE_URL                      — Postgres connection string
 *   CUSTOMER_INITIAL_PASSWORD         — Initial password for the customer account
 *   REVENUECAT_PREMIUM_ENTITLEMENT_ID — Must match the backend app's value
 *
 * USAGE (local):
 *   cd backend
 *   CUSTOMER_INITIAL_PASSWORD='<secure-password>' npx ts-node -r tsconfig-paths/register scripts/create-free-customer-account.ts
 *
 * USAGE (VPS):
 *   cd /opt/app/backend
 *   CUSTOMER_INITIAL_PASSWORD='<secure-password>' npx ts-node -r tsconfig-paths/register scripts/create-free-customer-account.ts
 */

import {
  PrismaClient,
  BillingStatus,
  EntitlementState,
  PlanKey,
  AppStore,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

// ── Constants ──────────────────────────────────────────────────────────────────

const CUSTOMER_EMAIL = 'zeynepilatin@gmail.com';
const CUSTOMER_FIRST_NAME = 'Zeynep';
const CUSTOMER_LAST_NAME = 'Ilatin';
const TENANT_NAME = 'Paradoks';
const TENANT_SLUG = 'paradoks';
const BRANCH_NAME = 'Ana Şube';

// ── Environment validation ─────────────────────────────────────────────────────
// Fail fast before any DB connection so the error is obvious.

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌  FATAL: ${key} is required but not set.`);
    process.exit(1);
  }
  return value;
}

const customerPassword = requireEnv('CUSTOMER_INITIAL_PASSWORD');
const premiumEntitlementId = requireEnv('REVENUECAT_PREMIUM_ENTITLEMENT_ID');
const connectionString = requireEnv('DATABASE_URL');

// Password is validated above but never logged beyond this point.
console.log('✅  Environment validated');

// ── Prisma setup ───────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== Free Customer Account Setup ===\n');

  // ── Step 1: Tenant ──────────────────────────────────────────────────────────
  //
  // Anchor on the customer email to stay idempotent even when the script has
  // been run before. If the user already exists we update their tenant in-place;
  // otherwise we upsert by the deterministic slug so parallel runs are safe.

  const existingUser = await prisma.user.findUnique({
    where: { email: CUSTOMER_EMAIL },
    select: { id: true, tenantId: true },
  });

  let tenantId: string;

  if (existingUser) {
    const existingTenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: existingUser.tenantId },
      select: { id: true, slug: true },
    });

    if (existingTenant.slug !== TENANT_SLUG) {
      console.error(
        `❌  FATAL: User ${CUSTOMER_EMAIL} already belongs to another tenant: ${existingTenant.slug}. Refusing to update automatically.`,
      );
      process.exit(1);
    }

    tenantId = existingTenant.id;
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: TENANT_NAME, billingStatus: BillingStatus.ACTIVE },
    });
    console.log(`✅  Tenant updated (id: ${tenantId})`);
  } else {
    const tenant = await prisma.tenant.upsert({
      where: { slug: TENANT_SLUG },
      create: {
        name: TENANT_NAME,
        slug: TENANT_SLUG,
        defaultCurrency: 'TRY',
        planKey: PlanKey.SINGLE,
        billingStatus: BillingStatus.ACTIVE,
      },
      update: {
        name: TENANT_NAME,
        billingStatus: BillingStatus.ACTIVE,
      },
    });
    tenantId = tenant.id;
    console.log(`✅  Tenant upserted: ${tenant.name} (id: ${tenantId})`);
  }

  // ── Step 2: Branch ──────────────────────────────────────────────────────────

  const existingBranch = await prisma.branch.findFirst({
    where: { tenantId, name: BRANCH_NAME },
    select: { id: true },
  });

  let branchId: string;

  if (existingBranch) {
    branchId = existingBranch.id;
    await prisma.branch.update({
      where: { id: branchId },
      data: { isDefault: true, isActive: true, archivedAt: null },
    });
    console.log(`✅  Branch updated: "${BRANCH_NAME}" (id: ${branchId})`);
  } else {
    const branch = await prisma.branch.create({
      data: {
        tenantId,
        name: BRANCH_NAME,
        address: '',
        isDefault: true,
        isActive: true,
      },
    });
    branchId = branch.id;
    console.log(`✅  Branch created: "${BRANCH_NAME}" (id: ${branchId})`);
  }

  // Clear isDefault from every other branch in this tenant so Ana Şube is
  // the sole default branch — even if other branches were previously default.
  const demoted = await prisma.branch.updateMany({
    where: { tenantId, id: { not: branchId }, isDefault: true },
    data: { isDefault: false },
  });
  if (demoted.count > 0) {
    console.log(
      `✅  Cleared isDefault on ${demoted.count} other branch(es) in tenant`,
    );
  }

  // ── Step 3: User ────────────────────────────────────────────────────────────
  //
  // emailVerifiedAt is set so the account is treated as fully verified.
  // Login goes through POST /auth/login (password flow) — no OTP required.

  const passwordHash = await bcrypt.hash(customerPassword, 10);
  const now = new Date();

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        isActive: true,
        firstName: CUSTOMER_FIRST_NAME,
        lastName: CUSTOMER_LAST_NAME,
      },
    });
    console.log(`✅  User updated: ${CUSTOMER_EMAIL}`);
  } else {
    await prisma.user.create({
      data: {
        tenantId,
        email: CUSTOMER_EMAIL,
        passwordHash,
        firstName: CUSTOMER_FIRST_NAME,
        lastName: CUSTOMER_LAST_NAME,
        role: 'ADMIN',
        isActive: true,
        emailVerifiedAt: now,
      },
    });
    console.log(`✅  User created: ${CUSTOMER_EMAIL}`);
  }

  // ── Step 4: RevenueCat entitlement snapshot ─────────────────────────────────
  //
  // This is the backend record that makes /auth/me return:
  //   hasPremiumAccess = true
  //   billingStatus    = ACTIVE (effective)
  //
  // expiresAt = null means "no expiry" — premiumAccessFromEntitlementSnapshot
  // treats null expiresAt as lifetime access.

  const appUserId = `tenant:${tenantId}`;

  await prisma.revenueCatEntitlementSnapshot.upsert({
    where: {
      tenantId_entitlementId: { tenantId, entitlementId: premiumEntitlementId },
    },
    create: {
      tenantId,
      appUserId,
      entitlementId: premiumEntitlementId,
      state: EntitlementState.ACTIVE,
      isActive: true,
      expiresAt: null,
      gracePeriodExpiresAt: null,
      store: AppStore.UNKNOWN,
    },
    update: {
      appUserId,
      state: EntitlementState.ACTIVE,
      isActive: true,
      expiresAt: null,
      gracePeriodExpiresAt: null,
    },
  });
  console.log(
    `✅  Entitlement snapshot upserted (entitlementId: ${premiumEntitlementId})`,
  );
  console.log(
    '    → /auth/me will return billingStatus=ACTIVE, hasPremiumAccess=true',
  );

  // ── Done ────────────────────────────────────────────────────────────────────

  console.log('\n✅  Free customer account setup complete!\n');
  console.log('┌──────────────────────────────────────────────────┐');
  console.log('│  Free Customer Account                           │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  Email:    ${CUSTOMER_EMAIL.padEnd(39)}│`);
  console.log('│  Password: $CUSTOMER_INITIAL_PASSWORD            │');
  console.log(`│  Tenant:   ${TENANT_NAME.padEnd(39)}│`);
  console.log(`│  Branch:   ${BRANCH_NAME.padEnd(39)}│`);
  console.log('├──────────────────────────────────────────────────┤');
  console.log('│  /auth/me expected response:                     │');
  console.log('│    billingStatus    = ACTIVE                     │');
  console.log('│    hasPremiumAccess = true                       │');
  console.log('└──────────────────────────────────────────────────┘\n');
}

main()
  .catch((err: unknown) => {
    console.error(
      '❌  Script failed:',
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
