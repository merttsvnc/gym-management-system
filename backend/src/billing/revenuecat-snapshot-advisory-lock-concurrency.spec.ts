/**
 * Verifies PostgreSQL transaction advisory locks serialize concurrent work on the same
 * snapshot key (same behavior relied on by RevenueCatWebhookService.applyEvent).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { entitlementSnapshotAdvisoryLockSql } from './revenuecat-snapshot-advisory-lock.util';

describe('entitlement snapshot advisory lock (concurrency)', () => {
  let pool: Pool;
  let prisma: PrismaClient;

  beforeAll(() => {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/gym_management_test';
    pool = new Pool({ connectionString });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it('serializes two concurrent transactions that take the same entitlement lock', async () => {
    const order: number[] = [];
    const tenantId = `lock-test-${Date.now()}`;
    const entitlementId = 'ent-concurrency';

    await Promise.all([
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          entitlementSnapshotAdvisoryLockSql(tenantId, entitlementId),
        );
        order.push(1);
        await new Promise((r) => setTimeout(r, 80));
        order.push(2);
      }),
      prisma.$transaction(async (tx) => {
        await new Promise((r) => setTimeout(r, 10));
        await tx.$executeRaw(
          entitlementSnapshotAdvisoryLockSql(tenantId, entitlementId),
        );
        order.push(3);
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });
});
