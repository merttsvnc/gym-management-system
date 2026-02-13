# Phase 3: Advanced Analytics & Reports

## Overview

Phase 3 adds advanced analytics and reporting endpoints for dashboards. All endpoints are scoped by `tenantId` (from JWT) and `branchId` (from query parameter). This phase builds on top of Phase 2.5's revenue aggregation endpoint.

## Endpoints

### 1. Monthly Revenue Trend

**Endpoint:** `GET /api/v1/reports/revenue/trend?branchId=...&months=6`

**Description:** Returns revenue trend for the last N months, combining membership and product revenue.

**Query Parameters:**

- `branchId` (required): Branch ID for filtering
- `months` (optional): Number of months to return (default: 6, max: 24)

**Response:**

```json
{
  "currency": "TRY",
  "months": [
    {
      "month": "2025-09",
      "membershipRevenue": "12450.00",
      "productRevenue": "3250.50",
      "totalRevenue": "15700.50",
      "locked": false
    },
    {
      "month": "2025-10",
      "membershipRevenue": "13200.00",
      "productRevenue": "4100.25",
      "totalRevenue": "17300.25",
      "locked": false
    },
    {
      "month": "2025-11",
      "membershipRevenue": "14500.00",
      "productRevenue": "5200.00",
      "totalRevenue": "19700.00",
      "locked": true
    }
  ]
}
```

**Authorization:** Requires JWT + ADMIN role

**Sample cURL:**

```bash
curl -X GET "http://localhost:3000/api/v1/reports/revenue/trend?branchId=branch-456&months=6" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 2. Daily Revenue Breakdown

**Endpoint:** `GET /api/v1/reports/revenue/daily?branchId=...&month=YYYY-MM`

**Description:** Returns day-by-day revenue breakdown for a given month. Includes all days in the month, even days with zero revenue.

**Query Parameters:**

- `branchId` (required): Branch ID for filtering
- `month` (required): Month in YYYY-MM format (e.g., "2026-02")

**Response:**

```json
{
  "month": "2026-02",
  "currency": "TRY",
  "days": [
    {
      "date": "2026-02-01",
      "membershipRevenue": "450.00",
      "productRevenue": "120.50",
      "totalRevenue": "570.50"
    },
    {
      "date": "2026-02-02",
      "membershipRevenue": "0.00",
      "productRevenue": "0.00",
      "totalRevenue": "0.00"
    },
    {
      "date": "2026-02-03",
      "membershipRevenue": "890.00",
      "productRevenue": "250.00",
      "totalRevenue": "1140.00"
    }
  ]
}
```

**Authorization:** Requires JWT + ADMIN role

**Sample cURL:**

```bash
curl -X GET "http://localhost:3000/api/v1/reports/revenue/daily?branchId=branch-456&month=2026-02" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 3. Payment Method Breakdown

**Endpoint:** `GET /api/v1/reports/revenue/payment-methods?branchId=...&month=YYYY-MM`

**Description:** Returns revenue grouped by payment method for both membership payments and product sales.

**Query Parameters:**

- `branchId` (required): Branch ID for filtering
- `month` (required): Month in YYYY-MM format (e.g., "2026-02")

**Response:**

```json
{
  "month": "2026-02",
  "currency": "TRY",
  "membershipByMethod": [
    {
      "paymentMethod": "CASH",
      "amount": "5600.00"
    },
    {
      "paymentMethod": "CREDIT_CARD",
      "amount": "8900.00"
    },
    {
      "paymentMethod": "BANK_TRANSFER",
      "amount": "2300.00"
    }
  ],
  "productSalesByMethod": [
    {
      "paymentMethod": "CASH",
      "amount": "1200.50"
    },
    {
      "paymentMethod": "CREDIT_CARD",
      "amount": "3450.75"
    }
  ]
}
```

**Authorization:** Requires JWT + ADMIN role

**Sample cURL:**

```bash
curl -X GET "http://localhost:3000/api/v1/reports/revenue/payment-methods?branchId=branch-456&month=2026-02" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 4. Top Selling Products

**Endpoint:** `GET /api/v1/reports/products/top?branchId=...&month=YYYY-MM&limit=10`

**Description:** Returns top selling products for a given month, sorted by revenue. Groups by productId (catalog products) or customName (custom products).

**Query Parameters:**

- `branchId` (required): Branch ID for filtering
- `month` (required): Month in YYYY-MM format (e.g., "2026-02")
- `limit` (optional): Maximum number of products to return (default: 10, max: 100)

**Response:**

```json
{
  "month": "2026-02",
  "currency": "TRY",
  "items": [
    {
      "name": "Protein Powder",
      "productId": "product-123",
      "quantity": 45,
      "revenue": "4500.00"
    },
    {
      "name": "Energy Drink",
      "productId": "product-456",
      "quantity": 120,
      "revenue": "3600.00"
    },
    {
      "name": "Custom Shaker Bottle",
      "productId": null,
      "quantity": 30,
      "revenue": "1500.00"
    }
  ]
}
```

**Authorization:** Requires JWT + ADMIN role

**Sample cURL:**

```bash
curl -X GET "http://localhost:3000/api/v1/reports/products/top?branchId=branch-456&month=2026-02&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Query Logic & Implementation

### 1. Monthly Revenue Trend

**Service:** `RevenueReportService.getRevenueTrend()`

**Optimization Strategy:**

- Single query to fetch all payments in date range
- Single query to fetch all product sales in date range
- Single query to fetch all locks for the months
- In-memory grouping by month for better performance

**Logic:**

1. Calculate date range for N months (from current month back N-1 months)
2. Fetch all Payment records where `paidOn` is in range and `isCorrected=false`
3. Fetch all ProductSale records where `soldAt` is in range
4. Fetch all RevenueMonthLock records for these months
5. Group payments and sales by month in memory
6. Return array ordered ASC by month

**Date Handling:** All dates use UTC for consistency

---

### 2. Daily Revenue Breakdown

**Service:** `RevenueReportService.getDailyBreakdown()`

**Logic:**

1. Parse month string to get UTC date range (first day to last day)
2. Fetch all Payment records for the month
3. Fetch all ProductSale records for the month
4. Generate all days in the month (28-31 days depending on month)
5. Initialize all days with zero revenue
6. Aggregate payments by `paidOn` date
7. Aggregate product sales by `soldAt` date
8. Return array ordered by date ASC

**Zero Days:** All days in the month are included, even if no transactions occurred.

---

### 3. Payment Method Breakdown

**Service:** `RevenueReportService.getPaymentMethodBreakdown()`

**Logic:**

1. Use Prisma `groupBy` on Payment table by `paymentMethod`
2. Use Prisma `groupBy` on ProductSale table by `paymentMethod`
3. Sum amounts for each payment method
4. Return two separate arrays (membership and product sales)

**Payment Methods:** Uses PaymentMethod enum (CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER)

---

### 4. Top Selling Products

**Service:** `ProductReportService.getTopSellingProducts()`

**Logic:**

1. Fetch all ProductSaleLineItem records for the month (via productSale relation)
2. Group by:
   - `productId` when not null (catalog products) - join with Product table to get name
   - `customName` when productId is null (custom products)
3. For each group, sum:
   - `quantity`: Total units sold
   - `lineTotal`: Total revenue
4. Sort by revenue DESC
5. Return top N products (limited by `limit` parameter)

**Grouping Key:**

- Catalog products: `product:{productId}`
- Custom products: `custom:{customName}`

This ensures catalog and custom products with the same name are kept separate.

---

## Performance Notes

### Revenue Trend

- **Optimization:** Uses single query per data source (payments, product sales, locks) instead of N separate queries per month
- **In-memory grouping:** More efficient than N database queries
- **Indexed fields:** Queries use indexes on `tenantId`, `branchId`, `paidOn`/`soldAt`

### Daily Breakdown

- **All days included:** Days with no transactions still appear with 0.00 values
- **In-memory aggregation:** Efficient for typical month size (28-31 days)
- **Date formatting:** Uses ISO format (YYYY-MM-DD) for consistency

### Payment Method Breakdown

- **Prisma groupBy:** Efficient native database grouping
- **Separate arrays:** Keeps membership and product sales distinct for clarity

### Top Products

- **Line item query:** Fetches from ProductSaleLineItem table
- **In-memory grouping:** Required for complex grouping logic (productId vs customName)
- **Performance consideration:** For high-volume branches, consider adding date range pagination

### General Optimizations

1. **UTC dates:** Consistent timezone handling avoids edge cases
2. **Decimal math:** Uses Prisma.Decimal for accurate money calculations
3. **Indexed queries:** All queries use indexed fields (tenantId, branchId, dates)
4. **Scoped by tenant/branch:** Ensures data isolation and better index usage

---

## Data Model Dependencies

### Tables Used:

- **Payment:** Membership revenue source
  - Fields: `amount`, `paidOn`, `paymentMethod`, `isCorrected`
- **ProductSale:** Product revenue source
  - Fields: `totalAmount`, `soldAt`, `paymentMethod`
- **ProductSaleLineItem:** Product details for top products
  - Fields: `productId`, `customName`, `quantity`, `lineTotal`
- **Product:** Catalog product names
  - Fields: `name`
- **RevenueMonthLock:** Month lock status
  - Fields: `month`

### Indexes Required:

- `Payment`: Composite index on `(tenantId, branchId, paidOn)`
- `ProductSale`: Composite index on `(tenantId, branchId, soldAt)`
- `RevenueMonthLock`: Unique index on `(tenantId, branchId, month)`

---

## Files Added/Changed

### New Files:

**DTOs:**

- `backend/src/reports/dto/revenue-trend-query.dto.ts`
- `backend/src/reports/dto/revenue-trend-response.dto.ts`
- `backend/src/reports/dto/daily-breakdown-query.dto.ts`
- `backend/src/reports/dto/daily-breakdown-response.dto.ts`
- `backend/src/reports/dto/payment-method-breakdown-query.dto.ts`
- `backend/src/reports/dto/payment-method-breakdown-response.dto.ts`
- `backend/src/reports/dto/top-products-query.dto.ts`
- `backend/src/reports/dto/top-products-response.dto.ts`

**Services:**

- `backend/src/reports/product-report.service.ts` - New service for product analytics

**Controllers:**

- `backend/src/reports/product-report.controller.ts` - New controller for product endpoints

**Tests:**

- `backend/src/reports/revenue-report-phase3.service.spec.ts` - Tests for revenue trend, daily, payment methods
- `backend/src/reports/product-report.service.spec.ts` - Tests for top products

### Modified Files:

**Services:**

- `backend/src/reports/revenue-report.service.ts`
  - Added helper methods: `getMonthDateRange()`, `getMonthKey()`
  - Added Phase 3 methods: `getRevenueTrend()`, `getDailyBreakdown()`, `getPaymentMethodBreakdown()`
  - Refactored existing method to use helper

**Controllers:**

- `backend/src/reports/revenue-report.controller.ts`
  - Added imports for new DTOs
  - Added Phase 3 endpoints: `/revenue/trend`, `/revenue/daily`, `/revenue/payment-methods`

**Modules:**

- `backend/src/reports/revenue-report.module.ts`
  - Added ProductReportController to controllers
  - Added ProductReportService to providers and exports

---

## Testing

### Test Coverage:

**Revenue Trend Tests:**

- ✅ Returns correct number of months
- ✅ Returns months in ASC order
- ✅ Correctly aggregates revenue by month
- ✅ Correctly sets locked status
- ✅ Respects max months limit of 24

**Daily Breakdown Tests:**

- ✅ Includes all days in the month (28-31 days)
- ✅ Includes zero revenue days
- ✅ Correctly aggregates revenue by day
- ✅ Handles 31-day, 30-day, and leap year months

**Payment Method Breakdown Tests:**

- ✅ Groups membership payments by method
- ✅ Groups product sales by method
- ✅ Handles empty results
- ✅ Handles null sums correctly

**Top Products Tests:**

- ✅ Groups catalog products by productId
- ✅ Groups custom products by customName
- ✅ Handles mix of catalog and custom products
- ✅ Sorts products by revenue DESC
- ✅ Respects limit parameter
- ✅ Handles empty results
- ✅ Uses default limit of 10
- ✅ Handles missing product names gracefully

### Run Tests:

```bash
cd backend
npm test -- revenue-report-phase3.service.spec.ts
npm test -- product-report.service.spec.ts
```

---

## Security & Authorization

All endpoints require:

1. **JwtAuthGuard:** Valid JWT token
2. **TenantGuard:** Extracts `tenantId` from JWT
3. **RolesGuard + @Roles('ADMIN'):** ADMIN role required

Data isolation:

- All queries are scoped by `tenantId` (from JWT)
- All queries require `branchId` parameter
- No cross-tenant or cross-branch data leakage

---

## Migration from Phase 2.5

Phase 3 is fully backward compatible with Phase 2.5:

- Existing `/api/v1/reports/revenue` endpoint unchanged
- All Phase 2.5 functionality preserved
- New endpoints are additive only
- Shared service methods reuse existing logic

---

## Future Enhancements

Potential improvements for future phases:

1. **Caching:** Add Redis cache for frequently accessed months
2. **Materialized views:** Pre-aggregate daily revenue for fast queries
3. **Export functionality:** Add CSV/Excel export for reports
4. **Date range filters:** Allow custom date ranges beyond month boundaries
5. **Multi-branch comparison:** Compare revenue across branches
6. **Staff performance:** Track sales by staff member
7. **Product category analytics:** Group products by category
8. **Forecast:** Predict future revenue based on trends

---

## API Contract Stability

All response fields are guaranteed stable:

- Money fields always formatted as strings with 2 decimals
- Date fields always in ISO format (YYYY-MM-DD or YYYY-MM)
- Currency always "TRY" (prepared for multi-currency support)
- Arrays always present (empty array if no data)

Breaking changes will be versioned (e.g., `/api/v2/reports/...`)

---

## Phase 3 Complete ✅

All Phase 3 requirements implemented:

- ✅ Monthly revenue trend (last N months)
- ✅ Daily breakdown for a given month
- ✅ Payment method breakdown
- ✅ Top selling products
- ✅ All endpoints scoped by tenant + branch
- ✅ Prisma Decimal for money math
- ✅ UTC for date filtering
- ✅ JWT + Role guards
- ✅ Comprehensive tests
- ✅ Performance optimizations
- ✅ Complete documentation
