#!/usr/bin/env ts-node
/**
 * SAFE SMOKE-TEST SEED TOOL
 *
 * Creates realistic test members for a single tenant for testing filters,
 * dashboard counts, and badges.
 *
 * SAFETY FEATURES:
 * - Tenant-scoped (only operates within specified tenant)
 * - Production guard (aborts if NODE_ENV is 'production')
 * - Explicit flag required (ALLOW_TEST_SEED=true)
 * - Idempotent (deletes previous seed data before creating new)
 * - Deterministic randomness (seeded RNG for reproducibility)
 * - No PII in logs
 *
 * USAGE:
 *   ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --count 100
 *
 * OPTIONS:
 *   --email <email>    Email of the user/tenant to seed members for
 *   --count <number>   Total number of members to generate (default: 100)
 *   --seed <number>    RNG seed for reproducibility (default: 12345)
 */

import { PrismaClient, MemberGender, MemberStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ==================== CONFIGURATION ====================

const SEED_PREFIX = '[SEED]'; // Prefix to identify seeded members
const DEFAULT_COUNT = 100;
const DEFAULT_SEED = 12345;

// Data generation ratios (out of 100)
const ACTIVE_VALID_COUNT = 35; // Active, endDate >= today + 8 days
const EXPIRING_SOON_COUNT = 20; // Active, endDate in [today, today+7]
const EXPIRED_COUNT = 15; // Active/inactive, endDate < today
const PASSIVE_COUNT = 30; // PAUSED (15) + INACTIVE (15)

// ==================== SAFETY GUARDS ====================

function checkSafetyRequirements(): void {
  // Guard 1: Production environment check
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ABORT: Cannot run seed in production environment!');
    console.error('   NODE_ENV is set to "production"');
    process.exit(1);
  }

  // Guard 2: Explicit flag required
  if (process.env.ALLOW_TEST_SEED !== 'true') {
    console.error('❌ ABORT: ALLOW_TEST_SEED flag is not set!');
    console.error('   Run with: ALLOW_TEST_SEED=true npm run seed:members');
    process.exit(1);
  }

  console.log('✅ Safety checks passed');
}

// ==================== SEEDED RNG ====================

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Linear Congruential Generator (LCG)
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ==================== TEST DATA ====================

const FIRST_NAMES_MALE = [
  'Ahmet',
  'Mehmet',
  'Mustafa',
  'Ali',
  'Hüseyin',
  'İbrahim',
  'Can',
  'Efe',
  'Burak',
  'Emre',
  'Ömer',
  'Murat',
  'Serkan',
  'Hakan',
  'Kemal',
  'Osman',
  'Yusuf',
  'Erdem',
  'Onur',
  'Berk',
  'Çağlar',
  'Deniz',
  'Tuncay',
  'Volkan',
  'Arda',
  'Barış',
  'Cem',
  'Tolga',
  'Kaan',
  'Eren',
];

const FIRST_NAMES_FEMALE = [
  'Ayşe',
  'Fatma',
  'Zeynep',
  'Elif',
  'Emine',
  'Merve',
  'Esra',
  'Seda',
  'Büşra',
  'Şeyma',
  'Ebru',
  'Gül',
  'Nur',
  'Dilara',
  'Defne',
  'Ece',
  'Selin',
  'Ceren',
  'Pınar',
  'Nazlı',
  'Cansu',
  'İrem',
  'Tuğba',
  'Sibel',
  'Aslı',
  'Aylin',
  'Sevgi',
  'Yasemin',
  'Gizem',
  'Serap',
];

const LAST_NAMES = [
  'Yılmaz',
  'Kaya',
  'Demir',
  'Şahin',
  'Çelik',
  'Yıldız',
  'Yıldırım',
  'Öztürk',
  'Aydın',
  'Özdemir',
  'Arslan',
  'Doğan',
  'Kılıç',
  'Aslan',
  'Çetin',
  'Kara',
  'Koç',
  'Kurt',
  'Özkan',
  'Şimşek',
  'Erdoğan',
  'Polat',
  'Aksoy',
  'Türk',
  'Aktaş',
  'Güneş',
  'Korkmaz',
  'Özer',
  'Taş',
  'Acar',
  'Başar',
  'Tekin',
  'Güven',
  'Soylu',
  'Öz',
  'Turan',
  'Bozkurt',
  'Karaca',
  'Sönmez',
  'Toprak',
];

// ==================== HELPER FUNCTIONS ====================

function generatePhoneNumber(rng: SeededRandom): string {
  const prefix = `05${rng.nextInt(0, 9)}`;
  const number = String(rng.nextInt(0, 99999999)).padStart(8, '0');
  return `${prefix}${number}`;
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/İ/g, 'I');
}

function generateEmail(
  firstName: string,
  lastName: string,
  index: number,
): string {
  const cleanFirst = normalizeString(firstName);
  const cleanLast = normalizeString(lastName);
  return `${cleanFirst}.${cleanLast}.${index}@seedtest.com`;
}

function getDateOfBirth(rng: SeededRandom): Date {
  const year = 1970 + rng.nextInt(0, 35); // 1970-2005
  const month = rng.nextInt(0, 11);
  const day = rng.nextInt(1, 28);
  return new Date(year, month, day);
}

function getCreatedAtInPast(rng: SeededRandom): Date {
  const monthsAgo = rng.nextInt(0, 6); // 0-6 months ago
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(date.getDate() - rng.nextInt(0, 30));
  date.setHours(rng.nextInt(8, 20), rng.nextInt(0, 59), 0, 0);
  return date;
}

function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ==================== MAIN LOGIC ====================

interface SeedConfig {
  tenantEmail: string;
  totalCount: number;
  seed: number;
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf('--email');
  const countIndex = args.indexOf('--count');
  const seedIndex = args.indexOf('--seed');

  if (emailIndex === -1 || !args[emailIndex + 1]) {
    console.error('❌ ERROR: --email parameter is required');
    console.error(
      '   Usage: ALLOW_TEST_SEED=true npm run seed:members -- --email user@example.com',
    );
    process.exit(1);
  }

  const config: SeedConfig = {
    tenantEmail: args[emailIndex + 1],
    totalCount:
      countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : DEFAULT_COUNT,
    seed: seedIndex !== -1 ? parseInt(args[seedIndex + 1], 10) : DEFAULT_SEED,
  };

  console.log('\n🌱 SEED MEMBERS TOOL');
  console.log('='.repeat(60));

  // Run safety checks
  checkSafetyRequirements();

  // Initialize Prisma
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://mertsevinc@localhost:5432/gym_management_dev';

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({
    adapter: adapter as any,
    log: ['error', 'warn'],
  });

  try {
    console.log(`\n📧 Looking up user: ${config.tenantEmail}`);

    // Find user and tenant
    const user = await prisma.user.findUnique({
      where: { email: config.tenantEmail },
      include: { tenant: true },
    });

    if (!user) {
      console.error(`❌ ERROR: User not found: ${config.tenantEmail}`);
      process.exit(1);
    }

    if (!user.tenant) {
      console.error(`❌ ERROR: User has no tenant: ${config.tenantEmail}`);
      process.exit(1);
    }

    const tenant = user.tenant;
    console.log(`✅ Found tenant: ${tenant.name} (${tenant.slug})`);

    // Find default branch
    const branch = await prisma.branch.findFirst({
      where: { tenantId: tenant.id, isDefault: true },
    });

    if (!branch) {
      console.error('❌ ERROR: No default branch found for tenant');
      process.exit(1);
    }

    console.log(`✅ Found branch: ${branch.name}`);

    // Find active membership plan
    const membershipPlan = await prisma.membershipPlan.findFirst({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
    });

    if (!membershipPlan) {
      console.error('❌ ERROR: No active membership plan found for tenant');
      process.exit(1);
    }

    console.log(`✅ Found membership plan: ${membershipPlan.name}`);

    // IDEMPOTENCY: Delete existing seeded members
    console.log(`\n🗑️  Cleaning up previous seed data...`);
    const deleteResult = await prisma.member.deleteMany({
      where: {
        tenantId: tenant.id,
        firstName: { startsWith: SEED_PREFIX },
      },
    });
    console.log(`   Deleted ${deleteResult.count} previous seed members`);

    // Initialize seeded RNG
    const rng = new SeededRandom(config.seed);
    console.log(`\n🎲 Using RNG seed: ${config.seed}`);

    // Generate member distribution
    console.log(`\n📊 Generating ${config.totalCount} members:`);
    console.log(
      `   - ${ACTIVE_VALID_COUNT} active-valid (endDate >= today + 8 days)`,
    );
    console.log(
      `   - ${EXPIRING_SOON_COUNT} expiring-soon (endDate in [today, today+7])`,
    );
    console.log(`   - ${EXPIRED_COUNT} expired (endDate < today)`);
    console.log(`   - ${PASSIVE_COUNT} passive (15 PAUSED + 15 INACTIVE)`);

    const today = getTodayStart();
    const members: any[] = [];

    let memberIndex = 0;

    // 1) Active-valid members (endDate >= today + 8 days)
    for (let i = 0; i < ACTIVE_VALID_COUNT; i++) {
      const daysInFuture = rng.nextInt(8, 120);
      members.push({
        type: 'active-valid',
        endDate: addDays(today, daysInFuture),
        status: MemberStatus.ACTIVE,
      });
    }

    // 2) Expiring soon members (endDate in [today, today+7])
    for (let i = 0; i < EXPIRING_SOON_COUNT; i++) {
      const daysInFuture = rng.nextInt(0, 7);
      members.push({
        type: 'expiring-soon',
        endDate: addDays(today, daysInFuture),
        status: MemberStatus.ACTIVE,
      });
    }

    // 3) Expired members (endDate < today)
    for (let i = 0; i < EXPIRED_COUNT; i++) {
      const daysInPast = rng.nextInt(1, 60);
      // Mix: some ACTIVE (will be synced by cron), some already INACTIVE
      const status =
        i < EXPIRED_COUNT / 2 ? MemberStatus.ACTIVE : MemberStatus.INACTIVE;
      members.push({
        type: 'expired',
        endDate: addDays(today, -daysInPast),
        status,
      });
    }

    // 4) Passive members (15 PAUSED + 15 INACTIVE)
    const pausedCount = Math.floor(PASSIVE_COUNT / 2);
    const inactiveCount = PASSIVE_COUNT - pausedCount;

    for (let i = 0; i < pausedCount; i++) {
      // Mix of future and past dates
      const daysDelta = rng.nextInt(-30, 60);
      members.push({
        type: 'paused',
        endDate: addDays(today, daysDelta),
        status: MemberStatus.PAUSED,
      });
    }

    for (let i = 0; i < inactiveCount; i++) {
      // Mix of future and past dates
      const daysDelta = rng.nextInt(-30, 60);
      members.push({
        type: 'inactive',
        endDate: addDays(today, daysDelta),
        status: MemberStatus.INACTIVE,
      });
    }

    // Shuffle for realism
    const shuffledMembers = rng.shuffle(members);

    console.log(`\n🔨 Creating members...`);

    let created = 0;
    const counters = {
      activeValid: 0,
      expiringSoon: 0,
      expired: 0,
      paused: 0,
      inactive: 0,
    };

    for (const memberData of shuffledMembers) {
      const gender = rng.next() > 0.5 ? MemberGender.MALE : MemberGender.FEMALE;
      const firstName = rng.choice(
        gender === MemberGender.MALE ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE,
      );
      const lastName = rng.choice(LAST_NAMES);

      const createdAt = getCreatedAtInPast(rng);
      const membershipStartDate = new Date(createdAt);
      membershipStartDate.setHours(0, 0, 0, 0);

      try {
        await prisma.member.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            firstName: `${SEED_PREFIX} ${firstName}`,
            lastName,
            gender,
            dateOfBirth: getDateOfBirth(rng),
            phone: generatePhoneNumber(rng),
            email: generateEmail(firstName, lastName, memberIndex++),
            membershipPlanId: membershipPlan.id,
            membershipStartDate,
            membershipEndDate: memberData.endDate,
            membershipPriceAtPurchase: membershipPlan.price,
            status: memberData.status,
            createdAt,
            updatedAt: createdAt,
          },
        });

        created++;

        // Track counters
        if (memberData.type === 'active-valid') counters.activeValid++;
        else if (memberData.type === 'expiring-soon') counters.expiringSoon++;
        else if (memberData.type === 'expired') counters.expired++;
        else if (memberData.type === 'paused') counters.paused++;
        else if (memberData.type === 'inactive') counters.inactive++;

        if (created % 25 === 0) {
          console.log(`   ✓ ${created} members created...`);
        }
      } catch (error: any) {
        console.error(
          `   ✗ Failed to create member ${memberIndex}:`,
          error.message,
        );
      }
    }

    // Summary
    console.log('\n✅ SEEDING COMPLETE');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Total created:     ${created}`);
    console.log(`   Active-valid:      ${counters.activeValid}`);
    console.log(`   Expiring-soon:     ${counters.expiringSoon}`);
    console.log(`   Expired:           ${counters.expired}`);
    console.log(`   Paused:            ${counters.paused}`);
    console.log(`   Inactive:          ${counters.inactive}`);
    console.log('');
    console.log('🧪 Verification queries:');
    console.log('   GET /api/mobile/dashboard/summary');
    console.log('   GET /api/mobile/members?status=ACTIVE');
    console.log('   GET /api/mobile/members?status=PASSIVE');
    console.log('   GET /api/mobile/members?expired=true');
    console.log('   GET /api/mobile/members?expiringDays=7');
    console.log('');
  } catch (error) {
    console.error('\n❌ SEED FAILED:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Execute
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
