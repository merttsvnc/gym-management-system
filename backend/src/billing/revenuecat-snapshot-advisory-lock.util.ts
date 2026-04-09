import { Prisma } from '@prisma/client';

/**
 * First-row snapshot upserts are serialized with PostgreSQL transaction-scoped advisory locks.
 * `SELECT … FOR UPDATE` does not lock non-existent rows; two concurrent first inserts could
 * race. `pg_advisory_xact_lock` is held until the transaction commits or rolls back, so
 * parallel deliveries for the same entitlement or subscription key run one at a time.
 *
 * @see https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
 */
const ADVISORY_NS_ENTITLEMENT = 'rc_ent_snap_v1';
const ADVISORY_NS_SUBSCRIPTION = 'rc_sub_snap_v1';

export function entitlementSnapshotAdvisoryLockSql(
  tenantId: string,
  entitlementId: string,
): Prisma.Sql {
  const composite = `${tenantId}:${entitlementId}`;
  return Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_NS_ENTITLEMENT}), hashtext(${composite}))`;
}

export function subscriptionSnapshotAdvisoryLockSql(
  tenantId: string,
  appUserId: string,
  productId: string,
): Prisma.Sql {
  const composite = `${tenantId}:${appUserId}:${productId}`;
  return Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_NS_SUBSCRIPTION}), hashtext(${composite}))`;
}
