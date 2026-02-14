# Reports Fix - Quick Reference

## Manual Verification Commands

### 1. Test Without Authentication (Should Return 401)

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue/daily?month=2026-02&branchId=YOUR_BRANCH_ID' \
  -H 'Content-Type: application/json' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** `401 Unauthorized`

---

### 2. Get Authentication Token

```bash
# Get token and save to variable
export TOKEN=$(curl -s -X POST 'http://localhost:3000/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "YOUR_ADMIN_EMAIL",
    "password": "YOUR_PASSWORD",
    "tenantId": "YOUR_TENANT_ID"
  }' | jq -r '.accessToken')

# Verify token was obtained
echo "Token: ${TOKEN:0:30}..."
```

---

### 3. Test Daily Revenue Endpoint (Should Return 200)

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue/daily?month=2026-02&branchId=YOUR_BRANCH_ID' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' | jq
```

**Expected Response:**

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
    // ... 28 days total for February 2026
  ]
}
```

---

### 4. Test Monthly Revenue Aggregation

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue?month=2026-02&branchId=YOUR_BRANCH_ID' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' | jq
```

**Expected Response:**

```json
{
  "month": "2026-02",
  "membershipRevenue": "12500.00",
  "productRevenue": "3200.50",
  "totalRevenue": "15700.50",
  "currency": "TRY",
  "locked": false
}
```

---

### 5. Test Revenue Trend

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue/trend?branchId=YOUR_BRANCH_ID&months=3' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' | jq
```

---

### 6. Test Payment Method Breakdown

```bash
curl -X GET 'http://localhost:3000/api/v1/reports/revenue/payment-methods?month=2026-02&branchId=YOUR_BRANCH_ID' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' | jq
```

---

## Run Automated Test Script

```bash
# From project root
./test-reports-fix.sh \
  http://localhost:3000 \
  admin@test.com \
  password123 \
  YOUR_TENANT_ID \
  YOUR_BRANCH_ID
```

---

## Run Integration Test

```bash
cd backend
npm test -- revenue-report-sql.integration.spec.ts
```

---

## What Was Fixed

### Issue 1: SQL Column Names (CRITICAL)

- ❌ **Before:** `sold_at`, `total_amount`, `tenant_id`, `branch_id`
- ✅ **After:** `"soldAt"`, `"totalAmount"`, `"tenantId"`, `"branchId"`

**Why:** Prisma schema uses camelCase without `@map`. Postgres requires quoted identifiers for camelCase.

### Issue 2: GROUP BY Clause (CRITICAL)

- ❌ **Before:** `GROUP BY ("soldAt" AT TIME ZONE 'timezone')::date`
- ✅ **After:** `GROUP BY 1` (ordinal position)

**Why:** PostgreSQL error 42803 - expression mismatch. Using ordinal position avoids this.

### Issue 3: Auth Guard Order (DOCUMENTATION)

- Clarified that `BillingStatusGuard` is global and runs BEFORE `JwtAuthGuard`
- Guard gracefully skips when `req.user` is undefined
- Protected routes still return 401 via `JwtAuthGuard`

---

## Files Changed

✅ `backend/src/reports/revenue-report.service.ts` - Fixed SQL column names  
✅ `backend/src/app.module.ts` - Updated guard order documentation  
✅ `backend/src/auth/guards/billing-status.guard.ts` - Clarified guard behavior  
✅ `backend/src/reports/revenue-report-sql.integration.spec.ts` - New regression test  
✅ `docs/REPORTS_SQL_FIX_PATCH.md` - Complete documentation  
✅ `test-reports-fix.sh` - Automated verification script

---

## Expected Behavior

### Without Auth Token

- ❌ `401 Unauthorized` - JwtAuthGuard blocks request
- ❌ No access to any reports endpoints

### With Valid Auth Token

- ✅ `200 OK` - All reports endpoints work
- ✅ SQL executes without Prisma error 42703
- ✅ Returns valid JSON with revenue data

---

## Troubleshooting

### "Column does not exist" Error

- Check database column names match Prisma schema
- Ensure raw SQL uses quoted camelCase identifiers

### "401 Unauthorized" with Token

- Verify token is valid (not expired)
- Check token is passed in `Authorization: Bearer <token>` header
- Ensure user has ADMIN role

### "BillingStatusGuard: Skipping check" in Logs

- This is EXPECTED for routes without `req.user`
- JwtAuthGuard runs after and enforces authentication
- Not an error - just informational logging
