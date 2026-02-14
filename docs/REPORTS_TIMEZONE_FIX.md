# Reports Timezone Fix

## Problem Summary

**Issue**: Revenue reports were grouping transactions by UTC date, while mobile app displays and records transactions in tenant local time (Turkey Time, UTC+3). This caused a date mismatch between mobile and backend reports.

**Example**:

- Mobile app records a sale at **Feb 14, 00:35** Istanbul time
- Stored in DB as **2026-02-13T21:35:00Z** (UTC)
- Backend daily report grouped by UTC date → counted under **Feb 13**
- Mobile app shows the sale under **Feb 14**
- **Result**: Reports don't match mobile app display ❌

## Solution

Implement **tenant timezone awareness** for all revenue reports:

1. Store timezone as IANA string in Tenant model (e.g., `Europe/Istanbul`)
2. Use timezone utilities to convert UTC dates to tenant local dates
3. Group transactions by **tenant local date**, not UTC date
4. Keep storage in UTC (timestamptz) — only grouping logic changes

## Why IANA Timezone?

IANA timezone strings (e.g., `Europe/Istanbul`) handle:

- Daylight Saving Time (DST) transitions automatically
- Historical timezone changes
- Future-proof timezone rules

Simple UTC offsets (e.g., `UTC+3`) don't handle DST and can break twice a year.

## Implementation Details

### 1. Schema Changes

**Added to Tenant model**:

```prisma
model Tenant {
  // ... existing fields
  timezone String @default("Europe/Istanbul") // IANA timezone for business-day grouping
  // ... existing fields
}
```

**Migration**: `20260214042523_add_tenant_timezone`

### 2. Timezone Utilities

Created `src/utils/timezone.util.ts` with Luxon-based helpers:

#### `getMonthRangeUtc(monthKey, timezone)`

Converts a month (YYYY-MM) to UTC date range respecting tenant timezone boundaries.

**Example**:

```typescript
getMonthRangeUtc("2026-02", "Europe/Istanbul");
// Returns:
// {
//   startUtc: Date('2026-01-31T21:00:00.000Z'),  // Feb 1 00:00 Istanbul
//   endUtc: Date('2026-02-28T21:00:00.000Z')     // Mar 1 00:00 Istanbul
// }
```

**Usage**: Define WHERE clause date ranges for queries

```sql
WHERE sold_at >= startUtc AND sold_at < endUtc
```

#### `normalizeDayKey(date, timezone)`

Converts a UTC Date to a day string (YYYY-MM-DD) in tenant timezone.

**Example**:

```typescript
const utcDate = new Date("2026-02-13T21:35:00.000Z");
normalizeDayKey(utcDate, "Europe/Istanbul");
// Returns: '2026-02-14'  ✅ (not '2026-02-13')
```

#### `getAllDaysInMonth(monthKey, timezone)`

Returns all day strings (YYYY-MM-DD) for a month in tenant timezone.

**Usage**: Pre-fill report with all days including zero-revenue days

#### `normalizeMonthKey(date, timezone)`

Converts a UTC Date to a month string (YYYY-MM) in tenant timezone.

**Usage**: Group by month in trend reports

### 3. Service Changes

#### Revenue Report Service (`revenue-report.service.ts`)

**Changed methods**:

1. **`getMonthlyRevenue()`**
   - Uses `getMonthRangeUtc()` to compute month boundaries in tenant timezone
   - Queries filter by UTC range that corresponds to full month in tenant TZ

2. **`getRevenueTrend()`**
   - Computes month keys in tenant timezone
   - Groups payments/sales by tenant local month using `normalizeMonthKey()`

3. **`getDailyBreakdown()`** ⭐ **Key Fix**
   - **Replaced in-memory grouping with PostgreSQL timezone conversion**
   - Uses raw SQL with `AT TIME ZONE` for accurate day grouping:

   ```sql
   SELECT
     to_char((sold_at AT TIME ZONE $timezone)::date, 'YYYY-MM-DD') AS day,
     COALESCE(SUM(total_amount), 0)::text AS amount
   FROM "ProductSale"
   WHERE tenant_id = $tenantId
     AND branch_id = $branchId
     AND sold_at >= $startUtc
     AND sold_at < $endUtc
   GROUP BY (sold_at AT TIME ZONE $timezone)::date
   ORDER BY day ASC
   ```

   **Why raw SQL?**
   - Prisma `groupBy` cannot group by timezone-converted date expressions
   - PostgreSQL `AT TIME ZONE` handles DST and offset changes correctly
   - Grouping happens in database (efficient, accurate)

4. **`getPaymentMethodBreakdown()`**
   - Uses `getMonthRangeUtc()` for consistent month boundaries

**Helper methods added**:

- `getTenantTimezone(tenantId)`: Fetches timezone from DB
- `getMonthDateRangeWithTimezone(tenantId, month)`: Convenience wrapper

#### Product Report Service (`product-report.service.ts`)

**Changed methods**:

1. **`getTopSellingProducts()`**
   - Uses `getMonthRangeUtc()` to query products sold in tenant's local month
   - Ensures consistency with revenue reports

### 4. PostgreSQL Timezone Conversion

**Key SQL pattern**:

```sql
(sold_at AT TIME ZONE 'Europe/Istanbul')::date
```

**How it works**:

1. `sold_at` is `timestamptz` (UTC in storage)
2. `AT TIME ZONE 'Europe/Istanbul'` converts to Istanbul local time (returns `timestamp without time zone`)
3. `::date` extracts the local date (YYYY-MM-DD)

**Example**:

```
sold_at (UTC):           2026-02-13T21:35:00Z
After AT TIME ZONE:      2026-02-14 00:35:00  (Istanbul local time)
After ::date:            2026-02-14
```

### 5. Month Boundary Logic

**Before (Broken)**:

```typescript
// Month boundaries at UTC midnight
const startDate = new Date(Date.UTC(2026, 1, 1, 0, 0, 0)); // Feb 1 00:00 UTC
const endDate = new Date(Date.UTC(2026, 2, 1, 0, 0, 0)); // Mar 1 00:00 UTC
```

- Misses sales from Jan 31 21:00-23:59 UTC (Feb 1 in Istanbul)
- Incorrectly includes sales from Feb 28 21:00-23:59 UTC (Mar 1 in Istanbul)

**After (Fixed)**:

```typescript
// Month boundaries at Istanbul midnight, converted to UTC
getMonthRangeUtc("2026-02", "Europe/Istanbul");
// Returns:
// startUtc: 2026-01-31T21:00:00Z  (Feb 1 00:00 Istanbul)
// endUtc:   2026-02-28T21:00:00Z  (Mar 1 00:00 Istanbul)
```

- Correctly includes all Feb sales in Istanbul time
- Correctly excludes Jan/Mar sales

## Testing

### Unit Tests

Created `timezone.util.spec.ts` with 20 test cases covering:

- Month range calculation for various timezones
- Day/month key normalization at boundaries
- DST handling (implicit via Luxon)
- Real-world bug scenario verification

**All tests passing** ✅

**Key test case** (demonstrates the fix):

```typescript
it("should group sales correctly at day boundary", () => {
  // Sale at 00:35 Istanbul on Feb 14
  const soldAtUtc = new Date("2026-02-13T21:35:00.000Z");
  const dayKey = normalizeDayKey(soldAtUtc, "Europe/Istanbul");

  expect(dayKey).toBe("2026-02-14"); // ✅ Not '2026-02-13'
});
```

### Manual Testing

To verify the fix manually:

1. **Insert test sale**:

   ```sql
   INSERT INTO "ProductSale"
     (id, tenant_id, branch_id, sold_at, payment_method, total_amount, created_at, updated_at)
   VALUES
     ('test-sale-1', 'your-tenant-id', 'your-branch-id',
      '2026-02-13T21:35:00Z', 'CASH', 100.00, NOW(), NOW());
   ```

2. **Query daily report**:

   ```bash
   curl -X GET "http://localhost:3000/api/v1/reports/revenue/daily?branchId=your-branch-id&month=2026-02" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Verify**: Sale appears under **2026-02-14**, not 2026-02-13

## Files Changed

### New Files

- `backend/src/utils/timezone.util.ts` - Timezone conversion utilities
- `backend/src/utils/timezone.util.spec.ts` - Unit tests
- `docs/REPORTS_TIMEZONE_FIX.md` - This documentation

### Modified Files

- `backend/prisma/schema.prisma` - Added `timezone` field to Tenant
- `backend/prisma/migrations/20260214042523_add_tenant_timezone/migration.sql` - Migration
- `backend/src/reports/revenue-report.service.ts` - Fixed all month/day grouping
- `backend/src/reports/product-report.service.ts` - Fixed month range calculation

### Dependencies

- ✅ `luxon` (already installed)
- ✅ `@types/luxon` (already installed)

## Breaking Changes

**None**. This is a bug fix that improves accuracy.

**Default timezone**: `Europe/Istanbul`

- All existing tenants will default to this timezone
- Can be overridden per tenant if needed

## Future Enhancements

1. **Tenant timezone UI**: Allow admins to configure timezone in settings
2. **Timezone validation**: Add enum of supported IANA timezones
3. **Multi-timezone tenants**: Support different timezones per branch (if needed)
4. **Audit other reports**: Review member statistics, payment reports for similar issues

## Example: Before vs After

### Scenario

- Tenant timezone: `Europe/Istanbul` (UTC+3)
- Sale recorded: **2026-02-14 00:35** Istanbul time
- Querying: Daily revenue for **2026-02**

### Before Fix ❌

```
Database: sold_at = 2026-02-13T21:35:00Z
Backend groups by UTC date: 2026-02-13
Mobile shows sale on: 2026-02-14
Report shows sale on: 2026-02-13
Result: Mismatch! 🐛
```

### After Fix ✅

```
Database: sold_at = 2026-02-13T21:35:00Z
Backend groups by Istanbul date: 2026-02-14
Mobile shows sale on: 2026-02-14
Report shows sale on: 2026-02-14
Result: Match! 🎉
```

## SQL Query Examples

### Daily Revenue (Product Sales)

```sql
SELECT
  to_char((sold_at AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD') AS day,
  COALESCE(SUM(total_amount), 0)::text AS amount
FROM "ProductSale"
WHERE tenant_id = 'tenant-123'
  AND branch_id = 'branch-456'
  AND sold_at >= '2026-01-31T21:00:00Z'  -- Feb 1 00:00 Istanbul
  AND sold_at < '2026-02-28T21:00:00Z'   -- Mar 1 00:00 Istanbul
GROUP BY (sold_at AT TIME ZONE 'Europe/Istanbul')::date
ORDER BY day ASC;
```

### Daily Revenue (Membership Payments)

```sql
SELECT
  to_char((paid_on AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD') AS day,
  COALESCE(SUM(amount), 0)::text AS amount
FROM "Payment"
WHERE tenant_id = 'tenant-123'
  AND branch_id = 'branch-456'
  AND paid_on >= '2026-01-31T21:00:00Z'  -- Feb 1 00:00 Istanbul
  AND paid_on < '2026-02-28T21:00:00Z'   -- Mar 1 00:00 Istanbul
  AND is_corrected = false
GROUP BY (paid_on AT TIME ZONE 'Europe/Istanbul')::date
ORDER BY day ASC;
```

## Performance Notes

### Query Performance

- PostgreSQL timezone conversion is efficient (uses indexed timestamptz directly)
- Grouping by expression is supported but not indexed
- For large datasets: Consider materializing daily aggregates if performance becomes an issue

### Indexes

Existing indexes are sufficient:

```sql
-- Already exists on ProductSale
CREATE INDEX "ProductSale_tenantId_branchId_soldAt_idx"
  ON "ProductSale"(tenant_id, branch_id, sold_at);

-- Already exists on Payment
CREATE INDEX "Payment_tenantId_paidOn_branchId_idx"
  ON "Payment"(tenant_id, paid_on, branch_id);
```

## Rollback Plan

If issues arise:

1. **Database**: Revert migration

   ```bash
   npx prisma migrate resolve --rolled-back 20260214042523_add_tenant_timezone
   ```

2. **Code**: Revert service changes
   - Restore `getMonthDateRange()` to use UTC boundaries
   - Revert `getDailyBreakdown()` to in-memory grouping

3. **Re-deploy**: Previous version

**Note**: Rolling back means the bug returns. Better to fix forward if possible.

## Conclusion

This fix ensures that:

1. ✅ Reports match mobile app display exactly
2. ✅ Sales are grouped by business day in tenant timezone
3. ✅ Month boundaries respect tenant timezone
4. ✅ Storage remains in UTC (best practice)
5. ✅ DST transitions are handled automatically
6. ✅ All tests pass

**The core principle**: Store in UTC, group by tenant timezone.
