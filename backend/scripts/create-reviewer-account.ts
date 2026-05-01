#!/usr/bin/env ts-node
/**
 * App Store Reviewer Account Setup
 *
 * Creates or updates a dedicated test account for Apple App Store reviewers.
 * The account bypasses OTP, has email verified, owns a fully-set-up tenant,
 * and holds an active RevenueCat entitlement so /auth/me returns:
 *   billingStatus = ACTIVE
 *   hasPremiumAccess = true
 *
 * SAFETY:
 *   - Idempotent — safe to re-run; existing data is updated, not duplicated.
 *   - NOT executed on app startup; must be run manually.
 *   - Password is never logged.
 *
 * REQUIRED ENV VARS:
 *   DATABASE_URL                      — Postgres connection string
 *   REVIEWER_TEST_PASSWORD            — Password for the reviewer account
 *   REVENUECAT_PREMIUM_ENTITLEMENT_ID — Must match the backend app's value
 *
 * USAGE (local):
 *   cd backend
 *   REVIEWER_TEST_PASSWORD=<secret> npx ts-node -r tsconfig-paths/register scripts/create-reviewer-account.ts
 *
 * USAGE (VPS):
 *   cd /opt/app/backend
 *   REVIEWER_TEST_PASSWORD=<secret> npx ts-node -r tsconfig-paths/register scripts/create-reviewer-account.ts
 */

import {
  PrismaClient,
  BillingStatus,
  EntitlementState,
  PlanKey,
  PlanStatus,
  PlanScope,
  DurationType,
  MemberStatus,
  PaymentMethod,
  AppStore,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Stored exactly as-is. The "+" alias is intentional and must NOT be stripped. */
const REVIEWER_EMAIL = 'quuilo+appreview@quuilo.com';
const REVIEWER_FIRST_NAME = 'App';
const REVIEWER_LAST_NAME = 'Reviewer';
const TENANT_NAME = 'Quuilo Review Gym';
const TENANT_SLUG = 'quuilo-review-gym';
const BRANCH_NAME = 'Main Branch';

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

const reviewerPassword = requireEnv('REVIEWER_TEST_PASSWORD');
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
  console.log('\n=== App Store Reviewer Account Setup ===\n');

  // ── Step 1: Tenant ──────────────────────────────────────────────────────────
  //
  // Anchor on the reviewer email to stay idempotent even when the script has
  // been run before.  If the user already exists we update their tenant in-place;
  // otherwise we upsert by the deterministic slug so parallel runs are safe.

  const existingUser = await prisma.user.findUnique({
    where: { email: REVIEWER_EMAIL },
    select: { id: true, tenantId: true },
  });

  let tenantId: string;

  if (existingUser) {
    tenantId = existingUser.tenantId;
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

  // ── Step 3: User ────────────────────────────────────────────────────────────
  //
  // emailVerifiedAt is set so the account is treated as fully verified.
  // Login goes through POST /auth/login (password flow) — no OTP required.

  const passwordHash = await bcrypt.hash(reviewerPassword, 10);
  const now = new Date();

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        isActive: true,
        firstName: REVIEWER_FIRST_NAME,
        lastName: REVIEWER_LAST_NAME,
      },
    });
    console.log(`✅  User updated: ${REVIEWER_EMAIL}`);
  } else {
    await prisma.user.create({
      data: {
        tenantId,
        // Email stored exactly as provided — "+" alias intentionally preserved.
        email: REVIEWER_EMAIL,
        passwordHash,
        firstName: REVIEWER_FIRST_NAME,
        lastName: REVIEWER_LAST_NAME,
        role: 'ADMIN',
        isActive: true,
        emailVerifiedAt: now,
      },
    });
    console.log(`✅  User created: ${REVIEWER_EMAIL}`);
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

  // ── Step 5: Sample membership plans ────────────────────────────────────────
  // Skipped if plans with these names already exist for this tenant.

  const planDefs = [
    {
      name: 'Monthly Membership',
      durationType: DurationType.MONTHS,
      durationValue: 1,
      price: '500.00',
    },
    {
      name: 'Annual Membership',
      durationType: DurationType.MONTHS,
      durationValue: 12,
      price: '4800.00',
    },
  ] as const;

  const planIds: Record<string, string> = {};

  for (const def of planDefs) {
    const existing = await prisma.membershipPlan.findFirst({
      where: { tenantId, name: def.name, status: PlanStatus.ACTIVE },
      select: { id: true },
    });
    if (existing) {
      planIds[def.name] = existing.id;
      console.log(`✅  Membership plan already exists: "${def.name}"`);
    } else {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId,
          scope: PlanScope.TENANT,
          scopeKey: 'TENANT',
          name: def.name,
          durationType: def.durationType,
          durationValue: def.durationValue,
          price: def.price,
          currency: 'TRY',
          status: PlanStatus.ACTIVE,
        },
      });
      planIds[def.name] = plan.id;
      console.log(`✅  Membership plan created: "${def.name}"`);
    }
  }

  // ── Step 6: Sample members + payments ──────────────────────────────────────
  // Phone numbers are deterministic test values; uniqueness is per-tenant.
  // Members are skipped if the phone already exists for this tenant.

  const reviewerUser = await prisma.user.findUniqueOrThrow({
    where: { email: REVIEWER_EMAIL },
    select: { id: true },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const memberDefs = [
    {
      firstName: 'Alex',
      lastName: 'Johnson',
      phone: '+905550000001',
      planName: 'Monthly Membership',
      daysOffset: 20,
      amount: '500.00',
    },
    {
      firstName: 'Maria',
      lastName: 'Garcia',
      phone: '+905550000002',
      planName: 'Annual Membership',
      daysOffset: 300,
      amount: '4800.00',
    },
    {
      firstName: 'James',
      lastName: 'Smith',
      phone: '+905550000003',
      planName: 'Monthly Membership',
      daysOffset: 5,
      amount: '500.00',
    },
  ] as const;

  for (const def of memberDefs) {
    const existing = await prisma.member.findFirst({
      where: { tenantId, phone: def.phone },
      select: { id: true },
    });
    if (existing) {
      console.log(
        `✅  Member already exists: ${def.firstName} ${def.lastName}`,
      );
      continue;
    }

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + def.daysOffset);

    const member = await prisma.member.create({
      data: {
        tenantId,
        branchId,
        firstName: def.firstName,
        lastName: def.lastName,
        phone: def.phone,
        membershipPlanId: planIds[def.planName],
        membershipStartDate: today,
        membershipEndDate: endDate,
        status: MemberStatus.ACTIVE,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId,
        branchId,
        memberId: member.id,
        amount: def.amount,
        paidOn: today,
        paymentMethod: PaymentMethod.CASH,
        createdBy: reviewerUser.id,
      },
    });

    console.log(
      `✅  Member created: ${def.firstName} ${def.lastName} (+ payment)`,
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────────

  console.log('\n✅  Reviewer account setup complete!\n');
  console.log('┌──────────────────────────────────────────────────┐');
  console.log('│  App Store Reviewer Credentials                  │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  Email:    ${REVIEWER_EMAIL.padEnd(39)}│`);
  console.log('│  Password: $REVIEWER_TEST_PASSWORD               │');
  console.log('│  Tenant:   Quuilo Review Gym                     │');
  console.log('│  Branch:   Main Branch                           │');
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
