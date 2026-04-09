import {
  entitlementSnapshotAdvisoryLockSql,
  subscriptionSnapshotAdvisoryLockSql,
} from './revenuecat-snapshot-advisory-lock.util';

describe('revenuecat-snapshot-advisory-lock.util', () => {
  it('produces stable Prisma.Sql for the same entitlement key', () => {
    const a = entitlementSnapshotAdvisoryLockSql('t1', 'premium');
    const b = entitlementSnapshotAdvisoryLockSql('t1', 'premium');
    expect(a).toEqual(b);
  });

  it('produces different Sql for different composite keys', () => {
    const a = entitlementSnapshotAdvisoryLockSql('t1', 'premium');
    const b = entitlementSnapshotAdvisoryLockSql('t1', 'other');
    expect(a).not.toEqual(b);
  });

  it('uses a different lock namespace than subscription snapshots', () => {
    const ent = entitlementSnapshotAdvisoryLockSql('tenantA', 'ent1');
    const sub = subscriptionSnapshotAdvisoryLockSql(
      'tenantA',
      'tenant:tenantA',
      'prod1',
    );
    expect(ent).not.toEqual(sub);
  });
});
