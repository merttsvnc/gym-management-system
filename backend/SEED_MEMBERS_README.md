# Seed Members Tool

A safe, repeatable smoke-test tool for generating realistic test members for one tenant.

## Features

✅ **Tenant-scoped**: Only creates members within the specified tenant  
✅ **Production-safe**: Aborts if `NODE_ENV=production`  
✅ **Explicit flag required**: Must set `ALLOW_TEST_SEED=true`  
✅ **Idempotent**: Deletes previous seed data before creating new  
✅ **Deterministic**: Uses seeded RNG for reproducible results  
✅ **Realistic data**: Turkish names, proper phone formats  
✅ **Privacy-conscious**: No PII in logs

## Data Generation

Creates **100 members** (by default) with the following distribution:

| Category          | Count | Description                                             |
| ----------------- | ----- | ------------------------------------------------------- |
| **Active-Valid**  | 35    | `status=ACTIVE`, `endDate >= today + 8 days`            |
| **Expiring Soon** | 20    | `status=ACTIVE`, `endDate in [today, today+7]`          |
| **Expired**       | 15    | `endDate < today`, mixed status (for cron sync testing) |
| **Paused**        | 15    | `status=PAUSED`, mixed endDate                          |
| **Inactive**      | 15    | `status=INACTIVE`, mixed endDate                        |

All seeded members are marked with a `[SEED]` prefix in their `firstName` for easy identification and cleanup.

## Usage

### Basic Usage

```bash
cd backend
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com
```

### Custom Count

```bash
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --count 50
```

### Custom RNG Seed (for different data)

```bash
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --seed 99999
```

## Command-Line Options

| Option             | Description                                | Default |
| ------------------ | ------------------------------------------ | ------- |
| `--email <email>`  | **Required**. Email of user/tenant to seed | -       |
| `--count <number>` | Total members to generate                  | 100     |
| `--seed <number>`  | RNG seed for reproducibility               | 12345   |

## Safety Guards

The tool will **abort** if:

1. ❌ `NODE_ENV` is set to `production`
2. ❌ `ALLOW_TEST_SEED` is not set to `true`
3. ❌ Specified user email is not found
4. ❌ User has no tenant or branch
5. ❌ No active membership plan exists

## Verification Queries

After seeding, verify the data with these API calls:

### Dashboard Summary

```bash
GET /api/mobile/dashboard/summary
```

Should show:

- Active members count (~35)
- Expiring soon badge count (~20)
- Expired badge count (~15)

### Active Members Filter

```bash
GET /api/mobile/members?status=ACTIVE
```

Should return ~55 members (active-valid + expiring-soon, **excluding** expired)

### Passive Members Filter

```bash
GET /api/mobile/members?status=PASSIVE
```

Should return ~30 members (PAUSED + INACTIVE)

### Expired Members Filter

```bash
GET /api/mobile/members?expired=true
```

Should return ~15 members (those with `endDate < today`)

### Expiring Soon (7 days)

```bash
GET /api/mobile/members?expiringDays=7
```

Should return ~20 members (active members expiring within 7 days)

## Technical Details

### Idempotency

The tool deletes all members with `firstName` starting with `[SEED]` before creating new members. This ensures:

- Re-running doesn't duplicate data
- Fresh dataset on each run
- Easy cleanup when testing is done

### Deterministic Randomness

Uses a Linear Congruential Generator (LCG) seeded RNG:

- Same seed = same data every time
- Default seed: `12345`
- Useful for reproducible test scenarios
- Change seed with `--seed` flag for variation

### Date Logic

All dates use **start of day** (00:00:00) normalization, matching the production `getTodayStart()` utility:

- Consistent with member filtering logic
- Avoids time-of-day edge cases
- Ensures accurate day calculations

### Member Creation

- `createdAt`: Spread across last 6 months for realism
- `membershipStartDate`: Same as `createdAt` (normalized to start of day)
- `membershipEndDate`: **Always set** (NOT NULL)
- `phone`: Turkish format (`05XXXXXXXXX`)
- `email`: Normalized Turkish names + `@seedtest.com`
- `dateOfBirth`: Random between 1970-2005

## Examples

### Example Output

```
🌱 SEED MEMBERS TOOL
============================================================
✅ Safety checks passed

📧 Looking up user: info.vedweb@gmail.com
✅ Found tenant: VedWeb Gym (vedweb-gym)
✅ Found branch: Ana Şube

🗑️  Cleaning up previous seed data...
   Deleted 100 previous seed members

🎲 Using RNG seed: 12345

📊 Generating 100 members:
   - 35 active-valid (endDate >= today + 8 days)
   - 20 expiring-soon (endDate in [today, today+7])
   - 15 expired (endDate < today)
   - 30 passive (15 PAUSED + 15 INACTIVE)

🔨 Creating members...
   ✓ 25 members created...
   ✓ 50 members created...
   ✓ 75 members created...
   ✓ 100 members created...

✅ SEEDING COMPLETE
============================================================
📊 Summary:
   Total created:     100
   Active-valid:      35
   Expiring-soon:     20
   Expired:           15
   Paused:            15
   Inactive:          15

🧪 Verification queries:
   GET /api/mobile/dashboard/summary
   GET /api/mobile/members?status=ACTIVE
   GET /api/mobile/members?status=PASSIVE
   GET /api/mobile/members?expired=true
   GET /api/mobile/members?expiringDays=7
```

## Cleanup

To remove all seeded members manually:

```sql
DELETE FROM "Member"
WHERE "firstName" LIKE '[SEED]%';
```

Or simply re-run the seed command (it auto-cleans before seeding).

## Troubleshooting

### Error: "ALLOW_TEST_SEED flag is not set"

**Solution**: Add the flag before the command:

```bash
ALLOW_TEST_SEED=true npm run seed:members -- --email user@example.com
```

### Error: "User not found"

**Solution**: Verify the email exists in the database:

```sql
SELECT email FROM "User" WHERE email = 'info.vedweb@gmail.com';
```

### Error: "No active membership plan found"

**Solution**: Create an active membership plan for the tenant first.

### Error: "Cannot run seed in production"

**Solution**: This is working as intended! Never run seed in production. Use a dev/staging environment.

## Development Notes

### Files Modified

- `backend/src/scripts/seed-members.ts` - Main seed script
- `backend/package.json` - Added `seed:members` npm script

### Dependencies Used

- `@prisma/client` - Database access
- `@prisma/adapter-pg` - PostgreSQL adapter
- `pg` - PostgreSQL driver

### RNG Algorithm

Linear Congruential Generator (LCG) parameters:

- Multiplier: 9301
- Increment: 49297
- Modulus: 233280

This provides sufficient randomness for test data while maintaining determinism.

## Best Practices

1. **Always use in dev/test environments only**
2. **Set ALLOW_TEST_SEED=true explicitly each time**
3. **Use consistent seed for reproducible tests**
4. **Verify data with provided queries after seeding**
5. **Clean up seeded data before production-like tests**
6. **Document any deviations from defaults in test plans**

## Related Documentation

- [Member Filtering Reference](../docs/MEMBERS_FILTERING_REFERENCE.md)
- [Dashboard Counts Documentation](../docs/MEMBER_CREATE_FIELD_ANALYSIS.md)
- [Mobile Auth Integration](../docs/MOBILE_AUTH_INTEGRATION.md)
