# Seed Members Implementation Summary

## Overview

Created a safe, repeatable smoke-test seed tool for generating realistic member test data.

## Files Created

### 1. Core Script: `src/scripts/seed-members.ts`

- **Lines of code**: ~500
- **Key features**:
  - Seeded RNG (Linear Congruential Generator) for deterministic randomness
  - Safety guards (production check + explicit flag requirement)
  - Idempotent operation (deletes previous seed data)
  - Realistic Turkish names and phone formats
  - Privacy-conscious (no PII in logs)
  - Proper date normalization using `getTodayStart()`

### 2. Documentation: `SEED_MEMBERS_README.md`

- **Comprehensive guide** with:
  - Usage instructions
  - Safety requirements
  - Data distribution details
  - Verification queries
  - Troubleshooting section
  - Technical implementation notes

### 3. Helper Scripts

- `run-seed-example.sh` - Interactive example script for ease of use
- Updated `package.json` with `seed:members` npm script

## Data Generation Strategy

### Total: 100 Members (configurable)

| Category          | Count | Criteria                                       |
| ----------------- | ----- | ---------------------------------------------- |
| **Active-Valid**  | 35    | `status=ACTIVE`, `endDate >= today + 8 days`   |
| **Expiring Soon** | 20    | `status=ACTIVE`, `endDate in [today, today+7]` |
| **Expired**       | 15    | `endDate < today` (mixed ACTIVE/INACTIVE)      |
| **Paused**        | 15    | `status=PAUSED`, mixed endDate                 |
| **Inactive**      | 15    | `status=INACTIVE`, mixed endDate               |

## Safety Features

### Multiple Layers of Protection

1. **Environment Check**
   - Aborts if `NODE_ENV === 'production'`
2. **Explicit Flag Requirement**
   - Must set `ALLOW_TEST_SEED=true`
3. **Tenant Scoping**
   - Only operates within specified tenant
   - User email must exist
   - Tenant must have active branch and membership plan

4. **Idempotency**
   - Marks all seeded members with `[SEED]` prefix
   - Deletes previous seed data before creating new
   - Safe to re-run multiple times

5. **Deterministic Randomness**
   - Uses seeded RNG (default seed: 12345)
   - Same seed produces identical results
   - Change seed for variations

## Usage

### Basic Command

```bash
cd backend
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com
```

### Options

- `--email <email>` - **Required**. User/tenant email
- `--count <number>` - Total members (default: 100)
- `--seed <number>` - RNG seed (default: 12345)

### Examples

```bash
# Default: 100 members
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com

# Custom count: 50 members
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --count 50

# Different data: seed 99999
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --seed 99999
```

### Interactive Mode

```bash
./run-seed-example.sh
```

## Verification Queries

After seeding, verify with these API calls:

```bash
# Dashboard summary (badges)
GET /api/mobile/dashboard/summary

# Active members (should return ~55: active-valid + expiring-soon)
GET /api/mobile/members?status=ACTIVE

# Passive members (should return ~30: paused + inactive)
GET /api/mobile/members?status=PASSIVE

# Expired members (should return ~15)
GET /api/mobile/members?expired=true

# Expiring soon (should return ~20)
GET /api/mobile/members?expiringDays=7
```

## Technical Implementation Details

### Date Handling

- Uses `getTodayStart()` utility for consistency
- All dates normalized to start of day (00:00:00)
- Matches production filtering logic exactly

### Member Distribution Logic

```typescript
// Active-valid: endDate >= today + 8..120 days
const daysInFuture = rng.nextInt(8, 120);
endDate = addDays(today, daysInFuture);

// Expiring soon: endDate in [today, today+7]
const daysInFuture = rng.nextInt(0, 7);
endDate = addDays(today, daysInFuture);

// Expired: endDate < today (1..60 days ago)
const daysInPast = rng.nextInt(1, 60);
endDate = addDays(today, -daysInPast);

// Passive: mixed dates (30 days past to 60 days future)
const daysDelta = rng.nextInt(-30, 60);
endDate = addDays(today, daysDelta);
```

### Seeded RNG Algorithm

Linear Congruential Generator (LCG):

```
seed = (seed * 9301 + 49297) % 233280
random = seed / 233280
```

### Data Realism

- **Names**: 30 male names, 30 female names, 40 last names (Turkish)
- **Phones**: Format `05XXXXXXXXX` (Turkish mobile)
- **Emails**: Normalized names + `@seedtest.com`
- **Birth Dates**: Random between 1970-2005
- **Created Dates**: Spread across last 6 months

### Cleanup

```sql
-- Manual cleanup if needed
DELETE FROM "Member" WHERE "firstName" LIKE '[SEED]%';
```

## Integration Points

### Dependencies

- `PrismaClient` - Database access
- `PrismaPg` - PostgreSQL adapter
- `pg` - Connection pool

### Services Used

- User lookup
- Tenant validation
- Branch validation (default branch)
- Membership plan lookup (active plans only)

### Database Schema

Uses standard `Member` model:

- All required fields populated
- `membershipEndDate` always set (NOT NULL)
- `status` properly distributed
- Timestamps realistic

## Testing Scenarios

### Scenario 1: Dashboard Badges

**Purpose**: Verify badge counts are accurate

```bash
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com
# Check dashboard: should show 35 active, 20 expiring, 15 expired
```

### Scenario 2: Mobile Filters

**Purpose**: Test all filter combinations

```bash
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com
# Test each filter endpoint
```

### Scenario 3: Reproducible Tests

**Purpose**: Same data for consistent testing

```bash
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --seed 12345
# Re-run with same seed for identical data
```

### Scenario 4: Scale Testing

**Purpose**: Test with larger datasets

```bash
ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --count 500
```

## Best Practices

1. ✅ **Always run in dev/test environments only**
2. ✅ **Use consistent seed for reproducible tests**
3. ✅ **Verify data after seeding with provided queries**
4. ✅ **Clean up before production-like testing**
5. ✅ **Document test scenarios in test plans**
6. ✅ **Never commit with `ALLOW_TEST_SEED=true` in CI/CD**

## Error Handling

### Common Errors

| Error                           | Cause                 | Solution                    |
| ------------------------------- | --------------------- | --------------------------- |
| "Cannot run seed in production" | `NODE_ENV=production` | Use dev/staging environment |
| "ALLOW_TEST_SEED flag not set"  | Missing flag          | Add `ALLOW_TEST_SEED=true`  |
| "User not found"                | Invalid email         | Verify user exists in DB    |
| "No active membership plan"     | No plan for tenant    | Create active plan first    |
| "No default branch"             | Branch not configured | Set default branch          |

## Future Enhancements

### Potential Additions (if needed):

1. Branch distribution (assign members across multiple branches)
2. Payment history generation
3. Additional member statuses (ARCHIVED)
4. Custom date ranges for membership periods
5. Bulk operations (multiple tenants)
6. Export/import seed configurations
7. Web UI for seed management

## Related Documentation

- [Member Filtering Reference](../docs/MEMBERS_FILTERING_REFERENCE.md)
- [Dashboard Implementation](../docs/BUGFIX_MONTHLY_MEMBERS_ZERO.md)
- [Mobile Auth Integration](../docs/MOBILE_AUTH_INTEGRATION.md)

## Change Log

### Version 1.0 (2026-02-01)

- ✅ Initial implementation
- ✅ Safety guards (production + explicit flag)
- ✅ Idempotent operation
- ✅ Deterministic RNG
- ✅ Realistic data generation
- ✅ Comprehensive documentation
- ✅ Helper scripts
- ✅ Verification queries

---

**Author**: Senior NestJS Backend Engineer  
**Date**: February 1, 2026  
**Status**: Ready for use
