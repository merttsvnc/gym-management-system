# Bugfix: Monthly New Members Dashboard Chart Shows Zero for New Tenants

**Issue Date**: January 28, 2026  
**Fixed By**: System  
**Severity**: High (Production Issue)  
**Affected Component**: Dashboard Monthly Members Endpoint

## Problem Statement

After creating a brand-new tenant via registration and adding 3 members, the "Aylık Yeni Üyeler (Son 6 ay içinde kayıt olan üye sayısı)" dashboard chart displayed all months as 0. This affected all newly created tenants, making the dashboard appear broken and preventing visibility into new member signups.

## Root Cause

The root cause was a **timezone handling bug** in the date range query for counting monthly new members.

### Technical Details

The `getMonthlyMembers` function in [dashboard.service.ts](../backend/src/dashboard/dashboard.service.ts) was using `getTodayStart()` as the upper bound for the date range query:

```typescript
const today = getTodayStart(); // Returns midnight today in local timezone
const members = await this.prisma.member.findMany({
  where: {
    createdAt: {
      gte: startDate,
      lte: today, // ❌ PROBLEM: Excludes members created "today"
    },
  },
});
```

**The Issue:**

1. `getTodayStart()` returns the current date at 00:00:00 in the **server's local timezone**
2. When the server is running in a timezone west of UTC (e.g., PST UTC-8), midnight local time converts to the **previous day** when expressed in UTC
3. Database timestamps (`createdAt`) are stored in UTC with full precision (hours, minutes, seconds)
4. Members created "today" have timestamps in UTC that are **after** the `lte: today` limit when the server is in non-UTC timezone
5. Result: Members created today are systematically excluded from the query

**Example:**

- Server timezone: PST (UTC-8)
- Current date/time: Jan 28, 2026 at 10:00 AM PST
- `getTodayStart()` returns: Jan 28, 2026 at 00:00:00 PST = **Jan 27, 2026 at 08:00:00 UTC**
- Member created at: Jan 28, 2026 at 01:53 PM UTC
- Query filters: `createdAt <= Jan 27, 2026 08:00 UTC`
- Member is **excluded** because 13:53 UTC is after 08:00 UTC

This bug affects:

- Any server running in a timezone west of UTC (Americas, Pacific)
- Any members created "today" after midnight UTC
- Most critically: Brand new tenants creating their first members

## Fix Summary

Changed the upper bound of the date range query from `getTodayStart()` to `new Date()` (current moment):

```typescript
const now = new Date(); // Current moment in time
const members = await this.prisma.member.findMany({
  where: {
    createdAt: {
      gte: startDate,
      lte: now, // ✅ FIXED: Includes all members up to this moment
    },
  },
});
```

This ensures:

- Members created at any time "today" are included in the current month count
- The query works correctly regardless of server timezone
- No dependency on timezone conversion logic

### Additional Changes

1. **Removed `getTodayStart()` dependency** for month key generation in this function (still used in other dashboard functions for membership status calculation where it's appropriate)
2. **Added comprehensive comments** explaining the timezone consideration
3. **Used consistent date reference** (`now`) throughout the function for month initialization and result generation

## How to Reproduce (Before Fix)

1. **Create a new tenant**:

   ```bash
   POST /api/v1/auth/register
   {
     "tenantName": "New Gym",
     "email": "owner@newgym.com",
     "password": "password123"
   }
   ```

2. **Create 3 members** using the new tenant's auth token:

   ```bash
   POST /api/v1/members (3 times with different data)
   ```

3. **Call the dashboard endpoint**:

   ```bash
   GET /api/v1/dashboard/monthly-members
   Authorization: Bearer <tenant_token>
   ```

4. **Observe the bug**: Current month shows `newMembers: 0` despite having 3 members

## Tests Added

### Unit Tests

Added to [dashboard.service.spec.ts](../backend/src/dashboard/dashboard.service.spec.ts):

- `should include members created on current day (regression test for timezone bug)`
  - Verifies query uses `new Date()` as upper bound
  - Ensures members created "today" are counted correctly
  - Tests that `lte` parameter is close to current time (within 1 second)

### Integration Tests

Added to [dashboard.e2e-spec.ts](../backend/test/dashboard.e2e-spec.ts):

1. **`should include members created today in current month count (regression test)`**
   - Creates a member at the current moment
   - Calls the dashboard endpoint
   - Verifies current month count includes the new member
   - Tests real database query with actual timestamps

2. **`should count members across different months correctly`**
   - Creates members in different past months
   - Verifies each month is counted separately
   - Ensures multi-month aggregation works correctly

### Reproduction Test

Created [reproduction-monthly-members-bug.e2e-spec.ts](../backend/test/reproduction-monthly-members-bug.e2e-spec.ts):

- Full end-to-end test simulating the production bug scenario
- Creates brand new tenant + branch + plan + 3 members
- Verifies dashboard endpoint returns correct counts
- Includes detailed logging for debugging

All tests pass successfully.

## Files Changed

1. **[backend/src/dashboard/dashboard.service.ts](../backend/src/dashboard/dashboard.service.ts)**
   - Modified `getMonthlyMembers()` method
   - Changed date range upper bound from `getTodayStart()` to `new Date()`
   - Updated month key generation logic
   - Added detailed comments

2. **[backend/src/dashboard/dashboard.service.spec.ts](../backend/src/dashboard/dashboard.service.spec.ts)**
   - Added regression test for timezone bug

3. **[backend/test/dashboard.e2e-spec.ts](../backend/test/dashboard.e2e-spec.ts)**
   - Added 2 new regression tests
   - Fixed missing `token2` variable declaration

4. **[backend/test/reproduction-monthly-members-bug.e2e-spec.ts](../backend/test/reproduction-monthly-members-bug.e2e-spec.ts)** (new file)
   - Full reproduction test suite

## Impact Assessment

### Before Fix

- ❌ New tenants see empty dashboard chart
- ❌ Poor user experience during onboarding
- ❌ Members created "today" not counted in current month
- ❌ Bug affects all timezones west of UTC

### After Fix

- ✅ New tenants see accurate member counts immediately
- ✅ Current day members counted correctly
- ✅ Works in all timezones
- ✅ No breaking changes to existing functionality
- ✅ All existing tests pass

## Related Issues Checked

During root cause analysis, we verified the following were NOT the cause:

- ✅ Tenant filter is correct (no cross-tenant leakage)
- ✅ Branch scoping works as expected
- ✅ CreatedAt field is correct (not using wrong column)
- ✅ Data types are handled correctly (Postgres TIMESTAMP)
- ✅ Month key format is consistent (YYYY-MM)
- ✅ Fill logic for zero months works correctly

The issue was isolated to the **time range calculation only**.

## Lessons Learned

1. **Avoid timezone-dependent logic in aggregation queries**: When counting records over time periods, use absolute timestamps (`new Date()`) rather than timezone-adjusted dates
2. **Test with real timestamps**: Unit tests should verify actual Date objects, not just mocked results
3. **Reproduce before fixing**: The reproduction test was crucial in confirming the fix
4. **Consider timezone implications**: Always think about how server timezone affects date comparisons with UTC database timestamps

## Deployment Notes

- ✅ No database migration required
- ✅ No breaking API changes
- ✅ Backward compatible with existing frontend
- ✅ Safe to deploy immediately
- ✅ No configuration changes needed

## Verification Steps Post-Deploy

1. Create a new tenant via registration
2. Add at least 1 member
3. Check dashboard: `/api/v1/dashboard/monthly-members`
4. Verify current month shows count >= 1
5. Verify all months return (default 6 months)

## References

- Dashboard Service: [backend/src/dashboard/dashboard.service.ts](../backend/src/dashboard/dashboard.service.ts)
- Dashboard Controller: [backend/src/dashboard/dashboard.controller.ts](../backend/src/dashboard/dashboard.controller.ts)
- API Documentation: [docs/api/endpoints.md](api/endpoints.md)
- Membership Status Utils: [backend/src/common/utils/membership-status.util.ts](../backend/src/common/utils/membership-status.util.ts)
