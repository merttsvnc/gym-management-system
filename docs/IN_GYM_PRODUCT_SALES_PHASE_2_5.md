# In-Gym Product Sales - Phase 2.5: Revenue Aggregation Endpoint

**Date**: February 13, 2026  
**Phase**: 2.5 - Revenue Reporting & Aggregation  
**Status**: ✅ Complete

---

## Overview

Phase 2.5 implements a revenue aggregation endpoint that combines membership payment revenue with in-gym product sales revenue. This provides a unified monthly revenue breakdown for financial reporting and analysis.

### Key Features Implemented

- ✅ Monthly revenue aggregation endpoint (`GET /reports/revenue`)
- ✅ Combines membership revenue (Payment model) and product sales revenue (ProductSale model)
- ✅ Tenant + Branch scoping for multi-tenancy
- ✅ Month validation with YYYY-MM format
- ✅ UTC-based month range calculation
- ✅ Revenue month lock status integration
- ✅ Decimal precision for financial accuracy
- ✅ Comprehensive unit tests (11 test cases)

---

## Endpoint Contract

### GET /api/v1/reports/revenue

**Purpose**: Get monthly revenue breakdown for a specific tenant/branch

**Authentication**: Required (JWT)  
**Authorization**: ADMIN role required  
**Guards**: JwtAuthGuard, TenantGuard, RolesGuard

#### Query Parameters

| Parameter | Type   | Required | Format      | Description                       |
| --------- | ------ | -------- | ----------- | --------------------------------- |
| month     | string | Yes      | `YYYY-MM`   | Month to query (e.g., "2026-02")  |
| branchId  | string | Yes      | CUID        | Branch ID for filtering           |

**Validation Rules**:
- `month`: Must match regex `^\d{4}-(0[1-9]|1[0-2])$` (valid YYYY-MM format)
- `branchId`: Required, must be non-empty string

#### Response Schema

```typescript
{
  "month": "2026-02",
  "membershipRevenue": "125000.00",
  "productRevenue": "18250.00",
  "totalRevenue": "143250.00",
  "currency": "TRY",
  "locked": false
}
```

**Response Fields**:

| Field              | Type    | Description                                      |
| ------------------ | ------- | ------------------------------------------------ |
| month              | string  | Month key in YYYY-MM format                      |
| membershipRevenue  | string  | Total membership payment revenue (Decimal 2dp)   |
| productRevenue     | string  | Total product sales revenue (Decimal 2dp)        |
| totalRevenue       | string  | Sum of membership + product revenue (Decimal 2dp)|
| currency           | string  | Currency code (always "TRY")                     |
| locked             | boolean | Whether month is locked for financial reporting  |

#### Error Responses

| Status | Condition                                | Message                                          |
| ------ | ---------------------------------------- | ------------------------------------------------ |
| 400    | Invalid month format                     | "Month must be in YYYY-MM format (e.g., 2026-02)"|
| 400    | Missing branchId                         | "Branch ID is required"                          |
| 401    | No JWT token                             | "Unauthorized"                                   |
| 403    | User not ADMIN role                      | "Forbidden"                                      |

---

## Business Logic

### Month Range Calculation

The endpoint calculates revenue for the specified month using UTC-based date ranges:

```typescript
// For month "2026-02":
const startDate = new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0));
// Result: 2026-02-01T00:00:00.000Z

const endDate = new Date(Date.UTC(2026, 2, 1, 0, 0, 0, 0));
// Result: 2026-03-01T00:00:00.000Z (first day of next month)
```

**Query Logic**: Use `>= startDate AND < endDate` to include all transactions in the month.

**Edge Case Handling**:
- December 2026 → start: 2026-12-01, end: 2027-01-01
- Leap years are handled automatically by JavaScript Date

---

## Revenue Sources

### 1. Membership Revenue

**Source**: `Payment` model (existing membership payment records)

**Query Logic**:
```typescript
await prisma.payment.aggregate({
  where: {
    tenantId,
    branchId,
    paidOn: {
      gte: startDate,
      lt: endDate,
    },
    isCorrected: false, // Exclude corrected payments
  },
  _sum: {
    amount: true,
  },
});
```

**Key Points**:
- Uses `Payment.amount` field (Decimal 10,2)
- Filters by `paidOn` field (business date, stored as UTC DateTime)
- Excludes corrected payments (`isCorrected=false`) to avoid double-counting
- Includes correction payments automatically (handled by PaymentsService logic)
- Reuses existing Payment model infrastructure from `PaymentsModule`

**Source Discovery**:
- Found via `backend/src/payments/payments.service.ts`
- Method: `getRevenueReport()` already aggregates payment revenue
- Membership fees are stored as Payment records when members pay

---

### 2. Product Sales Revenue

**Source**: `ProductSale` model (in-gym product sales from Phase 1 & 2)

**Query Logic**:
```typescript
await prisma.productSale.aggregate({
  where: {
    tenantId,
    branchId,
    soldAt: {
      gte: startDate,
      lt: endDate,
    },
  },
  _sum: {
    totalAmount: true,
  },
});
```

**Key Points**:
- Uses `ProductSale.totalAmount` field (Decimal 12,2)
- Filters by `soldAt` field (business date/time, stored as UTC DateTime)
- Pre-calculated total from ProductSaleItem line items (Phase 2 logic)
- No corrections/adjustments for product sales (different business rules)

---

### 3. Revenue Month Lock

**Source**: `RevenueMonthLock` model (financial control from Phase 2)

**Query Logic**:
```typescript
await prisma.revenueMonthLock.findUnique({
  where: {
    tenantId_branchId_month: {
      tenantId,
      branchId,
      month, // "YYYY-MM"
    },
  },
});
```

**Key Points**:
- Unique constraint on `(tenantId, branchId, month)`
- Returns `locked: true` if lock exists, `false` otherwise
- Does not block reads (only affects create/delete operations in ProductSalesService)
- Provides read-only status for financial reporting

---

## Total Revenue Calculation

**Formula**:
```typescript
totalRevenue = membershipRevenue + productRevenue
```

**Implementation**:
```typescript
const totalRevenue = membershipRevenue.add(productRevenue);
```

**Precision**:
- Uses Prisma `Decimal` type for financial accuracy
- No floating-point arithmetic errors
- Formatted to 2 decimal places in response: `.toFixed(2)`

**Null Handling**:
- If no payments: `membershipRevenue = new Decimal(0)`
- If no sales: `productRevenue = new Decimal(0)`
- Result: `totalRevenue = 0.00` (not null)

---

## Files Changed/Added

### New Files Created

1. **`backend/src/reports/revenue-report.module.ts`**
   - Module definition
   - Imports: PrismaModule
   - Exports: RevenueReportService

2. **`backend/src/reports/revenue-report.controller.ts`**
   - GET /api/v1/reports/revenue endpoint
   - JWT auth + tenant guard + ADMIN role guard
   - Query validation via RevenueReportQueryDto

3. **`backend/src/reports/revenue-report.service.ts`**
   - Business logic for revenue aggregation
   - Method: `getMonthlyRevenue(tenantId, branchId, month)`
   - Prisma aggregation queries for Payment + ProductSale
   - RevenueMonthLock status check

4. **`backend/src/reports/dto/revenue-report-query.dto.ts`**
   - Query parameter validation
   - Month format validation: `^\d{4}-(0[1-9]|1[0-2])$`
   - BranchId required validation

5. **`backend/src/reports/dto/revenue-report-response.dto.ts`**
   - Response type definition
   - TypeScript interface for API contract

6. **`backend/src/reports/revenue-report.service.spec.ts`**
   - 11 comprehensive unit tests
   - Tests: date range, aggregation, scoping, edge cases

### Modified Files

1. **`backend/src/app.module.ts`**
   - Added imports: ProductsModule, ProductSalesModule, RevenueReportModule
   - Registered all three modules in AppModule.imports array

---

## Testing

### Unit Tests

**File**: `backend/src/reports/revenue-report.service.spec.ts`

**Coverage**: 11 test cases

1. ✅ Service instantiation
2. ✅ Month range computation in UTC
3. ✅ Membership revenue aggregation
4. ✅ Product sales revenue aggregation
5. ✅ Total revenue calculation
6. ✅ Locked status when RevenueMonthLock exists
7. ✅ Unlocked status when no lock exists
8. ✅ Zero revenue when no data exists
9. ✅ December edge case (next month = January)
10. ✅ Tenant + branch scoping for all queries
11. ✅ Large amounts with Decimal precision

**Run Tests**:
```bash
cd backend
npm test -- revenue-report.service.spec.ts
```

**Expected Output**:
```
PASS  src/reports/revenue-report.service.spec.ts
  RevenueReportService
    ✓ should be defined
    getMonthlyRevenue
      ✓ should compute correct month range in UTC
      ✓ should sum membership revenue correctly
      ✓ should sum product sales revenue correctly
      ✓ should calculate total revenue as sum of membership + product revenue
      ✓ should return locked=true when RevenueMonthLock exists
      ✓ should return locked=false when RevenueMonthLock does not exist
      ✓ should return 0.00 for all revenue when no data exists
      ✓ should handle December month correctly
      ✓ should use tenant+branch scope for all queries
      ✓ should handle large revenue amounts with Decimal precision

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

---

## Sample API Requests

### 1. Basic Request

```bash
curl -X GET 'http://localhost:3001/api/v1/reports/revenue?month=2026-02&branchId=branch-456' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response**:
```json
{
  "month": "2026-02",
  "membershipRevenue": "125000.00",
  "productRevenue": "18250.00",
  "totalRevenue": "143250.00",
  "currency": "TRY",
  "locked": false
}
```

---

### 2. No Data Case

```bash
curl -X GET 'http://localhost:3001/api/v1/reports/revenue?month=2025-01&branchId=branch-new' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response**:
```json
{
  "month": "2025-01",
  "membershipRevenue": "0.00",
  "productRevenue": "0.00",
  "totalRevenue": "0.00",
  "currency": "TRY",
  "locked": false
}
```

---

### 3. Locked Month

```bash
curl -X GET 'http://localhost:3001/api/v1/reports/revenue?month=2025-12&branchId=branch-456' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response**:
```json
{
  "month": "2025-12",
  "membershipRevenue": "98500.50",
  "productRevenue": "12300.25",
  "totalRevenue": "110800.75",
  "currency": "TRY",
  "locked": true
}
```

---

### 4. Invalid Month Format

```bash
curl -X GET 'http://localhost:3001/api/v1/reports/revenue?month=2026-13&branchId=branch-456' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response** (400 Bad Request):
```json
{
  "statusCode": 400,
  "message": [
    "Month must be in YYYY-MM format (e.g., 2026-02)"
  ],
  "error": "Bad Request"
}
```

---

### 5. Missing BranchId

```bash
curl -X GET 'http://localhost:3001/api/v1/reports/revenue?month=2026-02' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response** (400 Bad Request):
```json
{
  "statusCode": 400,
  "message": [
    "Branch ID is required"
  ],
  "error": "Bad Request"
}
```

---

## Integration with Existing Systems

### Relationship to PaymentsModule

- **Reuses**: Payment model for membership revenue
- **Different from**: `PaymentsService.getRevenueReport()` method
  - PaymentsService: Detailed breakdown by day/week/month with filters
  - RevenueReportService: Simple monthly aggregate with product sales

### Relationship to ProductSalesModule

- **Reuses**: ProductSale model for product revenue
- **Different from**: ProductSalesService endpoints
  - ProductSalesService: CRUD operations for individual sales
  - RevenueReportService: Monthly aggregation for reporting

### Relationship to RevenueMonthLock

- **Read-only**: Only checks lock status, does not create/delete locks
- **Purpose**: Inform users if month is locked (context for reporting)

---

## Architecture Notes

### Module Structure

```
backend/src/
├── reports/                          # NEW: Revenue aggregation module
│   ├── revenue-report.module.ts
│   ├── revenue-report.controller.ts
│   ├── revenue-report.service.ts
│   ├── revenue-report.service.spec.ts
│   └── dto/
│       ├── revenue-report-query.dto.ts
│       └── revenue-report-response.dto.ts
├── payments/                          # EXISTING: Membership payments
│   └── payments.service.ts            # Source: membershipRevenue
├── product-sales/                     # EXISTING: Product sales (Phase 2)
│   └── product-sales.service.ts       # Source: productRevenue
└── app.module.ts                      # MODIFIED: Registered RevenueReportModule
```

### Design Decisions

1. **Separate Module**: Created new `reports/` module instead of adding to payments or product-sales
   - Rationale: Aggregates data from multiple modules (single responsibility)
   - Future: Can add more report types without coupling to specific modules

2. **UTC Date Handling**: All date range calculations use UTC
   - Rationale: Consistent with Payment.paidOn and ProductSale.soldAt storage
   - Avoids timezone bugs in monthly aggregation

3. **Decimal Precision**: Uses Prisma Decimal for all calculations
   - Rationale: Financial accuracy (no floating-point errors)
   - Formatted to 2dp in response for consistency

4. **Exclude Corrected Payments**: Filters out `isCorrected=true` payments
   - Rationale: Avoid double-counting original + correction
   - Correction payments (isCorrection=true) are automatically included
   - Matches PaymentsService.getRevenueReport() logic

5. **No Product Sales Corrections**: ProductSale has no correction mechanism
   - Rationale: Phase 2 design uses delete + recreate pattern
   - RevenueMonthLock prevents deletion in locked months

---

## Future Enhancements

### Potential Phase 3 Features

1. **Date Range Queries**
   - Add `startMonth` and `endMonth` parameters
   - Return array of monthly breakdowns

2. **Revenue Breakdown by Category**
   - Add `groupBy=category` parameter
   - Product revenue split by product categories

3. **Comparison Metrics**
   - Compare to previous month/year
   - Revenue growth percentage

4. **Export Formats**
   - Add `?format=csv` or `?format=pdf` query param
   - Generate downloadable reports

5. **Multi-Branch Aggregation**
   - Allow `branchId=all` for tenant-wide revenue
   - Aggregate across all branches

---

## Verification Checklist

- ✅ Endpoint returns correct membership revenue from Payment model
- ✅ Endpoint returns correct product revenue from ProductSale model
- ✅ Total revenue is accurate sum of both sources
- ✅ Month validation rejects invalid formats (e.g., 2026-13)
- ✅ BranchId validation requires non-empty string
- ✅ TenantId automatically scoped from JWT (no cross-tenant leakage)
- ✅ Locked status correctly reflects RevenueMonthLock existence
- ✅ Zero values returned when no data exists (not null/undefined)
- ✅ Decimal precision maintained throughout calculation
- ✅ UTC date range calculation handles month boundaries correctly
- ✅ December edge case works (next month = January of next year)
- ✅ Module registered in AppModule.imports
- ✅ All 11 unit tests pass
- ✅ Documentation complete with sample requests

---

## Related Documentation

- **Phase 1**: [IN_GYM_PRODUCT_SALES_PHASE_1.md](./IN_GYM_PRODUCT_SALES_PHASE_1.md) - Data models
- **Phase 2**: [IN_GYM_PRODUCT_SALES_PHASE_2.md](./IN_GYM_PRODUCT_SALES_PHASE_2.md) - Business logic & endpoints
- **Payments Module**: [backend/src/payments/payments.service.ts](../backend/src/payments/payments.service.ts) - Membership revenue source

---

## Conclusion

Phase 2.5 successfully implements a unified revenue aggregation endpoint that combines membership and product sales revenue. The implementation:

- Reuses existing Payment and ProductSale models
- Maintains financial accuracy with Decimal precision
- Enforces proper tenant/branch scoping for multi-tenancy
- Provides comprehensive test coverage
- Follows NestJS best practices and existing codebase patterns

**Status**: ✅ Ready for production use
