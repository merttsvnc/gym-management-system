# Reports SQL Column Names Fix - Patch Documentation

**Date:** 2026-02-14  
**Issue:** Prisma `$queryRaw` error 42703 - column "sold_at" does not exist  
**Root Cause:** Raw SQL queries used snake_case column names, but Prisma schema uses camelCase without `@map`

---

## Problem Summary

### Issue 1: Incorrect SQL Column Names

The `getDailyBreakdown()` method in `revenue-report.service.ts` used raw SQL with snake_case identifiers:

- `sold_at` instead of `"soldAt"`
- `total_amount` instead of `"totalAmount"`
- `tenant_id` instead of `"tenantId"`
- `branch_id` instead of `"branchId"`
- `paid_on` instead of `"paidOn"`
- `is_corrected` instead of `"isCorrected"`

**Why it failed:**  
Prisma schema fields (`soldAt`, `totalAmount`, etc.) do NOT use `@map` directives. PostgreSQL stores columns with the same names as Prisma fields. When Prisma uses ORM, it knows the field names. But `$queryRaw` passes SQL directly to Postgres, which requires **quoted identifiers** for camelCase names.

### Issue 2: Auth Guard Confusion

Logs showed: `BillingStatusGuard: Skipping check - no user or tenantId` for reports endpoints, creating confusion about authentication.

**Why it happened:**  
`BillingStatusGuard` is registered as a global guard (`APP_GUARD`). Global guards run **before** controller-level guards like `@UseGuards(JwtAuthGuard, ...)`. Since the guard executes before JWT validation, `request.user` is undefined, causing it to skip.

**This is intentional behavior** - the guard is designed to gracefully skip when no user exists, allowing `JwtAuthGuard` to enforce authentication. Protected routes still return 401 for unauthenticated requests.

---

## Solution Applied

### A) Fixed SQL Column Names

**File:** `backend/src/reports/revenue-report.service.ts`

Changed raw SQL to use **quoted camelCase identifiers**:

```sql
-- BEFORE (WRONG):
SELECT
  to_char((sold_at AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day,
  COALESCE(SUM(total_amount), 0)::text AS amount
FROM "ProductSale"
WHERE tenant_id = $2
  AND branch_id = $3
  AND sold_at >= $4
  AND sold_at < $5
GROUP BY (sold_at AT TIME ZONE $1)::date;

-- AFTER (CORRECT):
SELECT
  to_char(("soldAt" AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day,
  COALESCE(SUM("totalAmount"), 0)::text AS amount
FROM "ProductSale"
WHERE "tenantId" = $2
  AND "branchId" = $3
  AND "soldAt" >= $4
  AND "soldAt" < $5
GROUP BY ("soldAt" AT TIME ZONE $1)::date;
```

**Key rules for Postgres camelCase identifiers:**

1. Must be quoted: `"soldAt"`, `"totalAmount"`
2. Table names are already quoted: `"ProductSale"`, `"Payment"`
3. Without quotes, Postgres lowercases all identifiers
4. `$queryRaw` passes SQL verbatim - no ORM field name translation

### B) Clarified Guard Order Documentation

**Files:**

- `backend/src/app.module.ts` - Updated comment explaining global guard execution order
- `backend/src/auth/guards/billing-status.guard.ts` - Clarified that guard runs BEFORE JwtAuthGuard

**Guard execution order:**

1. `BillingStatusGuard` (global via `APP_GUARD`)
2. `JwtAuthGuard` (controller-level `@UseGuards`)
3. `TenantGuard` (controller-level `@UseGuards`)
4. `RolesGuard` (controller-level `@UseGuards`)

**Design rationale:**  
Global guards always run first in NestJS. `BillingStatusGuard` checks if `req.user` exists:

- **If undefined:** Skip guard (let JwtAuthGuard handle auth)
- **If defined:** Check billing status and enforce restrictions

This allows the guard to work on both authenticated and unauthenticated routes.

### C) Added SQL Regression Test

**File:** `backend/src/reports/revenue-report-sql.integration.spec.ts`

Added integration test that:

1. Calls `getDailyBreakdown()` with non-existent tenant (validates SQL syntax)
2. Creates test data and validates query results
3. Catches Prisma error 42703 if column names are wrong

**Test command:**

```bash
npm test -- revenue-report-sql.integration.spec.ts
```

---

## Database Schema Reference

### ProductSale Model (Prisma Schema)

```prisma
model ProductSale {
  id              String        @id @default(cuid())
  tenantId        String        // DB column: "tenantId"
  branchId        String        // DB column: "branchId"
  soldAt          DateTime      // DB column: "soldAt"
  totalAmount     Decimal       // DB column: "totalAmount"
  paymentMethod   PaymentMethod
  // ... other fields
}
```

**Actual DB columns:** `"tenantId"`, `"branchId"`, `"soldAt"`, `"totalAmount"`  
**NOT:** `tenant_id`, `branch_id`, `sold_at`, `total_amount`

### Payment Model (Prisma Schema)

```prisma
model Payment {
  id              String        @id @default(cuid())
  tenantId        String        // DB column: "tenantId"
  branchId        String        // DB column: "branchId"
  paidOn          DateTime      // DB column: "paidOn"
  amount          Decimal       // DB column: "amount"
  isCorrected     Boolean       // DB column: "isCorrected"
  // ... other fields
}
```

**Actual DB columns:** `"tenantId"`, `"branchId"`, `"paidOn"`, `"isCorrected"`  
**NOT:** `tenant_id`, `branch_id`, `paid_on`, `is_corrected`

---

## Manual Verification

### 1. Test without authentication (should return 401)

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue/daily?month=2026-02&branchId=BRANCH_ID' \
  -H 'Content-Type: application/json' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** `401 Unauthorized` (JwtAuthGuard blocks request)

### 2. Test with authentication (should return 200)

First, get auth token:

```bash
TOKEN=$(curl -X POST 'http://localhost:3000/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@example.com",
    "password": "yourpassword",
    "tenantId": "YOUR_TENANT_ID"
  }' | jq -r '.accessToken')
```

Then call daily revenue endpoint:

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue/daily?month=2026-02&branchId=BRANCH_ID' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** `200 OK` with JSON response:

```json
{
  "month": "2026-02",
  "currency": "TRY",
  "days": [
    {
      "date": "2026-02-01",
      "membershipRevenue": "0.00",
      "productRevenue": "0.00",
      "totalRevenue": "0.00"
    }
    // ... 28 days total
  ]
}
```

### 3. Test monthly revenue endpoint

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue?month=2026-02&branchId=BRANCH_ID' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** `200 OK` with aggregated revenue

---

## Impact Assessment

### Files Changed

- ✅ `backend/src/reports/revenue-report.service.ts` - Fixed SQL column names
- ✅ `backend/src/app.module.ts` - Updated guard order documentation
- ✅ `backend/src/auth/guards/billing-status.guard.ts` - Clarified guard behavior
- ✅ `backend/src/reports/revenue-report-sql.integration.spec.ts` - New test file

### Affected Endpoints

- `GET /api/v1/reports/revenue/daily` - **FIXED** (was throwing Prisma error 42703)
- `GET /api/v1/reports/revenue/trend` - Not affected (uses Prisma ORM, not raw SQL)
- `GET /api/v1/reports/revenue` - Not affected (uses Prisma ORM)
- `GET /api/v1/reports/revenue/payment-methods` - Not affected (uses groupBy, not raw SQL)

### Breaking Changes

**None.** This is a bugfix that enables previously broken functionality.

---

## Future Recommendations

1. **Avoid raw SQL when possible**  
   Use Prisma ORM methods (`groupBy`, `aggregate`) which handle field names automatically.

2. **If raw SQL is required for timezone operations:**
   - Always quote camelCase identifiers: `"fieldName"`
   - Add integration tests that execute the actual SQL
   - Document the table/column mappings

3. **Consider SQL query builder libraries:**
   - Knex.js
   - Kysely
   - Slonik

   These provide better type safety and identifier quoting.

4. **Guard ordering:**
   - Keep BillingStatusGuard as global (current design is correct)
   - Consider adding a custom decorator `@RequireAuth()` that makes the intent clearer
   - Global guards are appropriate for cross-cutting concerns like billing checks

---

## Verification Checklist

- [x] Raw SQL uses quoted camelCase identifiers
- [x] Integration test added that executes actual SQL
- [x] Guard order documented in code comments
- [x] Reports endpoints have correct `@UseGuards` decorators
- [x] Manual curl tests pass (401 without auth, 200 with auth)
- [x] No Prisma error 42703 when calling daily revenue endpoint
- [x] Documentation created explaining root cause and solution

---

**Status:** ✅ Complete  
**Deployment:** Safe to merge and deploy  
**Rollback:** Not needed (this is a critical bugfix)
