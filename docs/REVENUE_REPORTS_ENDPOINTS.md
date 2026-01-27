# Revenue Reports Endpoints - API Documentation

**Last Updated:** January 27, 2026  
**Version:** 1.0  
**Status:** ✅ Production

---

## Table of Contents

1. [Overview](#overview)
2. [Base Configuration & Authentication](#base-configuration--authentication)
3. [Endpoint Catalog](#endpoint-catalog)
4. [Detailed Endpoint Documentation](#detailed-endpoint-documentation)
5. [Request/Response Examples](#requestresponse-examples)
6. [Data Model & Dependencies](#data-model--dependencies)
7. [Error Handling](#error-handling)
8. [Notes & Recommendations](#notes--recommendations)

---

## Overview

The backend provides **one dedicated revenue reporting endpoint** that supports the "Gelir Raporları" (Revenue Reports) frontend page. This endpoint aggregates payment data with flexible filtering and grouping capabilities.

### Key Features
- ✅ Date range filtering (başlangıç / bitiş tarihi)
- ✅ Branch filtering (şube)
- ✅ Payment method filtering (ödeme yöntemi)
- ✅ Flexible grouping (günlük / haftalık / aylık)
- ✅ Total revenue calculation
- ✅ Period breakdown with payment counts
- ✅ Automatic correction handling (excludes corrected payments, includes corrections)
- ✅ Tenant isolation (automatic)

---

## Base Configuration & Authentication

### Base URL
```
http://localhost:3000
```
**Note:** No global prefix is set. Controllers define their full paths including `/api/v1/`.

### Authentication

**Required:** JWT Bearer Token

All revenue reporting endpoints require authentication via JWT token in the Authorization header:

```http
Authorization: Bearer <JWT_TOKEN>
```

### Token Payload Structure
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "tenantId": "tenant-id",
  "role": "ADMIN"
}
```

### Guards Applied
1. **JwtAuthGuard** - Validates JWT token
2. **TenantGuard** - Ensures valid tenantId in request context
3. **RolesGuard** - Enforces role-based authorization

### Required Role
- **ADMIN** - Only users with ADMIN role can access revenue reports

### Tenant Isolation
- Tenant ID is automatically extracted from JWT token
- All queries are automatically scoped to the authenticated user's tenant
- No need to pass tenantId in request parameters

---

## Endpoint Catalog

| Method | Path | Purpose | Auth | Role | Query Params | Response Fields |
|--------|------|---------|------|------|--------------|----------------|
| GET | `/api/v1/payments/revenue` | Get aggregated revenue report with period breakdown | JWT | ADMIN | `startDate`, `endDate`, `branchId?`, `paymentMethod?`, `groupBy?` | `totalRevenue`, `period`, `breakdown[]` |

---

## Detailed Endpoint Documentation

### GET /api/v1/payments/revenue

**Description:** Get revenue report with aggregation and period breakdown.

**Controller:** `PaymentsController`  
**Service Method:** `PaymentsService.getRevenueReport()`

#### Query Parameters

| Parameter | Type | Required | Description | Format/Values | Default |
|-----------|------|----------|-------------|---------------|---------|
| `startDate` | string | ✅ Yes | Report start date | ISO 8601 date string (e.g., `2024-01-01`, `2024-01-01T00:00:00Z`) | - |
| `endDate` | string | ✅ Yes | Report end date (inclusive) | ISO 8601 date string (e.g., `2024-12-31`, `2024-12-31T23:59:59Z`) | - |
| `branchId` | string | ❌ No | Filter by specific branch | CUID string | - |
| `paymentMethod` | string | ❌ No | Filter by payment method | `CASH`, `CREDIT_CARD`, `BANK_TRANSFER`, `CHECK`, `OTHER` | - |
| `groupBy` | string | ❌ No | Group results by period | `day`, `week`, `month` | `day` |

##### Date Handling
- **Format:** ISO 8601 date strings (e.g., `2024-01-01` or `2024-01-01T00:00:00.000Z`)
- **Timezone:** All dates are truncated to start-of-day UTC internally
- **Inclusive Range:** Both `startDate` and `endDate` are inclusive (entire end date is included)
- **Validation:** Dates must be valid ISO 8601 format (enforced by `@IsDateString()` validator)

##### Payment Method Enum
```typescript
enum PaymentMethod {
  CASH           // Nakit
  CREDIT_CARD    // Kredi Kartı
  BANK_TRANSFER  // Banka Havalesi
  CHECK          // Çek
  OTHER          // Diğer
}
```

##### Group By Options
- **`day`** - Groups by individual days (YYYY-MM-DD format)
- **`week`** - Groups by week start date (Monday, YYYY-MM-DD format)
- **`month`** - Groups by month (YYYY-MM format)

#### Response Structure

**Status Code:** `200 OK`

```typescript
{
  totalRevenue: number;      // Sum of all payment amounts in the period
  period: string;            // Echo of groupBy parameter ('day' | 'week' | 'month')
  breakdown: Array<{
    period: string;          // Date/period identifier (format depends on groupBy)
    revenue: number;         // Revenue for this period
    count: number;           // Number of payments in this period
  }>;
}
```

##### Period Format by Group Type
- **Daily (`day`):** `"2024-01-15"` (YYYY-MM-DD)
- **Weekly (`week`):** `"2024-01-08"` (Monday of the week, YYYY-MM-DD)
- **Monthly (`month`):** `"2024-01"` (YYYY-MM)

#### Business Rules

1. **Correction Handling**
   - ❌ Excludes corrected original payments (`isCorrection=false AND isCorrected=true`)
   - ✅ Includes correction payments (`isCorrection=true`)
   - This ensures accurate revenue calculation by counting only the corrected amounts

2. **Tenant Isolation**
   - Automatically filters by `tenantId` from JWT token
   - No cross-tenant data leakage

3. **Branch Filtering**
   - If `branchId` is provided, only payments from that branch are included
   - Branch must belong to the authenticated user's tenant (implicit validation)

4. **Date Range**
   - `startDate` is inclusive (from start of day)
   - `endDate` is inclusive (includes the entire end date)
   - Dates are truncated to start-of-day UTC for consistent querying

5. **Week Calculation**
   - Weeks start on Monday (ISO 8601 standard)
   - Week grouping uses the Monday date as the period key

#### Authorization

- **Required:** JWT Bearer token
- **Role:** ADMIN only
- **Guards:** `JwtAuthGuard`, `TenantGuard`, `RolesGuard`

#### Error Responses

| Status Code | Reason | Example Message |
|-------------|--------|-----------------|
| 400 | Invalid date format | `"Geçerli bir başlangıç tarihi formatı giriniz (ISO 8601)"` |
| 400 | Invalid paymentMethod | `"Ödeme yöntemi CASH, CREDIT_CARD, BANK_TRANSFER, CHECK veya OTHER olmalıdır"` |
| 400 | Invalid groupBy value | `"Grup by değeri day, week veya month olmalıdır"` |
| 401 | Missing or invalid JWT token | `"Unauthorized"` |
| 403 | Insufficient role (not ADMIN) | `"Access denied. Required roles: ADMIN"` |

---

## Request/Response Examples

### Example 1: Daily Revenue Report (Date Range Only)

**Request:**
```bash
curl -X GET \
  'http://localhost:3000/api/v1/payments/revenue?startDate=2024-01-01&endDate=2024-01-31&groupBy=day' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**
```json
{
  "totalRevenue": 45600.50,
  "period": "day",
  "breakdown": [
    {
      "period": "2024-01-01",
      "revenue": 1200.00,
      "count": 5
    },
    {
      "period": "2024-01-02",
      "revenue": 800.50,
      "count": 3
    },
    {
      "period": "2024-01-03",
      "revenue": 2100.00,
      "count": 8
    }
    // ... more days
  ]
}
```

---

### Example 2: Weekly Revenue Report with Payment Method Filter

**Request:**
```bash
curl -X GET \
  'http://localhost:3000/api/v1/payments/revenue?startDate=2024-01-01&endDate=2024-03-31&groupBy=week&paymentMethod=CASH' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**
```json
{
  "totalRevenue": 12450.00,
  "period": "week",
  "breakdown": [
    {
      "period": "2024-01-01",
      "revenue": 3200.00,
      "count": 15
    },
    {
      "period": "2024-01-08",
      "revenue": 2800.50,
      "count": 12
    },
    {
      "period": "2024-01-15",
      "revenue": 3150.00,
      "count": 14
    }
    // ... more weeks
  ]
}
```

---

### Example 3: Monthly Revenue Report with Branch Filter

**Request:**
```bash
curl -X GET \
  'http://localhost:3000/api/v1/payments/revenue?startDate=2023-01-01&endDate=2023-12-31&groupBy=month&branchId=clx1a2b3c4d5e6f7g8h9i0' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**
```json
{
  "totalRevenue": 284750.25,
  "period": "month",
  "breakdown": [
    {
      "period": "2023-01",
      "revenue": 22100.00,
      "count": 85
    },
    {
      "period": "2023-02",
      "revenue": 19850.50,
      "count": 72
    },
    {
      "period": "2023-03",
      "revenue": 26300.75,
      "count": 95
    }
    // ... more months
  ]
}
```

---

### Example 4: Combined Filters (Branch + Payment Method + Monthly)

**Request:**
```bash
curl -X GET \
  'http://localhost:3000/api/v1/payments/revenue?startDate=2024-01-01&endDate=2024-06-30&groupBy=month&branchId=clx1a2b3c4d5e6f7g8h9i0&paymentMethod=CREDIT_CARD' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**
```json
{
  "totalRevenue": 58920.00,
  "period": "month",
  "breakdown": [
    {
      "period": "2024-01",
      "revenue": 9850.00,
      "count": 42
    },
    {
      "period": "2024-02",
      "revenue": 8920.00,
      "count": 38
    },
    {
      "period": "2024-03",
      "revenue": 10150.00,
      "count": 45
    },
    {
      "period": "2024-04",
      "revenue": 9800.00,
      "count": 41
    },
    {
      "period": "2024-05",
      "revenue": 10100.00,
      "count": 44
    },
    {
      "period": "2024-06",
      "revenue": 10100.00,
      "count": 43
    }
  ]
}
```

---

### Example 5: Error Response (Invalid Date Format)

**Request:**
```bash
curl -X GET \
  'http://localhost:3000/api/v1/payments/revenue?startDate=01-01-2024&endDate=2024-12-31' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**
```json
{
  "statusCode": 400,
  "message": [
    "Geçerli bir başlangıç tarihi formatı giriniz (ISO 8601)"
  ],
  "error": "Bad Request"
}
```

---

### Example 6: Error Response (Missing Authorization)

**Request:**
```bash
curl -X GET \
  'http://localhost:3000/api/v1/payments/revenue?startDate=2024-01-01&endDate=2024-12-31'
```

**Response:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

### Example 7: Error Response (Insufficient Role)

**Request:**
```bash
curl -X GET \
  'http://localhost:3000/api/v1/payments/revenue?startDate=2024-01-01&endDate=2024-12-31' \
  -H 'Authorization: Bearer <TOKEN_WITH_NON_ADMIN_ROLE>'
```

**Response:**
```json
{
  "statusCode": 403,
  "message": "Access denied. Required roles: ADMIN",
  "error": "Forbidden"
}
```

---

## Data Model & Dependencies

### Database Table: `Payment`

The revenue report endpoint depends on the `Payment` table with the following relevant columns:

```prisma
model Payment {
  id                 String        @id @default(cuid())
  tenantId           String
  branchId           String
  memberId           String
  
  // Payment details
  amount             Decimal       @db.Decimal(10, 2)
  paidOn             DateTime      // DATE-ONLY: stored as start-of-day UTC
  paymentMethod      PaymentMethod
  note               String?       @db.VarChar(500)
  
  // Correction tracking
  isCorrection       Boolean       @default(false)
  correctedPaymentId String?       @unique
  isCorrected        Boolean       @default(false)
  
  // Audit fields
  createdBy          String        // User ID
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  
  // Relations
  tenant             Tenant        @relation(...)
  branch             Branch        @relation(...)
  member             Member        @relation(...)
  
  @@index([tenantId, paidOn])
  @@index([tenantId, branchId])
  @@index([tenantId, paymentMethod])
  @@index([tenantId, paidOn, branchId])
  @@index([tenantId, paidOn, paymentMethod])
}
```

### Key Columns Used
- **`amount`** - Payment amount (Decimal, max 999999.99, 2 decimal places)
- **`paidOn`** - Payment date (stored as start-of-day UTC DateTime)
- **`paymentMethod`** - Payment method enum
- **`branchId`** - Branch reference for filtering
- **`tenantId`** - Automatic tenant isolation
- **`isCorrection`** - Flag indicating this is a correction payment
- **`isCorrected`** - Flag indicating this payment was corrected (and should be excluded from reports)

### Timezone Handling

**Current Implementation:**
- All dates are stored as **start-of-day UTC** (00:00:00Z)
- This provides DATE-ONLY semantics regardless of timezone
- Frontend should send dates in ISO 8601 format (e.g., `2024-01-15` or `2024-01-15T00:00:00.000Z`)

**Future Enhancement:**
- Backend has placeholders for tenant-specific timezone support
- When tenant timezone is added, validation will check against local tenant time
- Storage will remain in UTC with start-of-day semantics

### Future Date Handling

**Payment Creation:** The backend **prevents** future-dated payments:
- Validation checks that `paidOn` <= today (in tenant timezone)
- Error message: `"Ödeme tarihi gelecekte olamaz. Bugün veya geçmiş bir tarih seçiniz."`

**Revenue Reports:** Future dates in query parameters are allowed but will return empty results (no payments exist yet).

### Performance Considerations

**Indexes Available:**
```sql
@@index([tenantId, paidOn])              -- For date range queries
@@index([tenantId, branchId])             -- For branch filtering
@@index([tenantId, paymentMethod])        -- For payment method filtering
@@index([tenantId, paidOn, branchId])     -- For combined filtering
@@index([tenantId, paidOn, paymentMethod]) -- For combined filtering
```

**Query Pattern:**
1. Backend fetches all matching payments using WHERE clause with filters
2. Aggregation (grouping and summing) is done **in-application** (not via SQL GROUP BY)
3. Results are sorted by period in ascending order

**Optimization Opportunities:**
- For large datasets, consider moving aggregation to database level using Prisma's `groupBy()` or raw SQL
- Current implementation fetches all payment records and aggregates in memory

---

## Error Handling

### Validation Errors (400 Bad Request)

All query parameters are validated using NestJS class-validator:

| Field | Validation | Error Message (Turkish) |
|-------|-----------|------------------------|
| `startDate` | `@IsDateString()` | `"Geçerli bir başlangıç tarihi formatı giriniz (ISO 8601)"` |
| `endDate` | `@IsDateString()` | `"Geçerli bir bitiş tarihi formatı giriniz (ISO 8601)"` |
| `branchId` | `@IsString()` | `"Şube ID metin olmalıdır"` |
| `paymentMethod` | `@IsEnum(PaymentMethod)` | `"Ödeme yöntemi CASH, CREDIT_CARD, BANK_TRANSFER, CHECK veya OTHER olmalıdır"` |
| `groupBy` | `@IsIn(['day', 'week', 'month'])` | `"Grup by değeri day, week veya month olmalıdır"` |

### Authentication Errors (401 Unauthorized)

- Missing `Authorization` header
- Invalid or expired JWT token
- Token signature verification failure

### Authorization Errors (403 Forbidden)

- User role is not `ADMIN`
- Error message: `"Access denied. Required roles: ADMIN"`

### Not Found Errors (404 Not Found)

**Note:** This endpoint does not return 404 errors. If no payments match the filters, it returns:
```json
{
  "totalRevenue": 0,
  "period": "day",
  "breakdown": []
}
```

---

## Notes & Recommendations

### Current State

✅ **The backend has a dedicated revenue reporting endpoint** that fully supports the "Gelir Raporları" frontend requirements:
- Date range filtering
- Branch filtering
- Payment method filtering
- Flexible grouping (daily/weekly/monthly)
- Total revenue + breakdown

### Key Strengths

1. **Correction Handling:** Automatically excludes corrected payments and includes correction amounts for accurate reporting
2. **Tenant Isolation:** Built-in multi-tenancy support with automatic scoping
3. **Flexible Grouping:** Supports daily, weekly (Monday-start), and monthly grouping
4. **Inclusive Date Ranges:** Both start and end dates are fully inclusive
5. **Proper Indexing:** Database indexes support efficient filtering

### Limitations & Considerations

1. **No Pagination:** The endpoint returns all matching periods. For large date ranges with daily grouping, this could result in many items.
   - **Recommendation:** Frontend should handle large result sets or limit date range selection

2. **In-Memory Aggregation:** Grouping and summing happens in application code after fetching all payments
   - **Recommendation:** For very large datasets (1000+ payments), consider moving aggregation to database level

3. **No Payment Method Breakdown:** The endpoint returns a single total per period, not broken down by payment method
   - **Current Workaround:** Frontend can make multiple requests with different `paymentMethod` filters
   - **Future Enhancement:** Consider adding `breakdownByMethod: true` parameter for multi-dimensional reporting

4. **No Branch Breakdown:** Similar to payment method, no per-branch breakdown in a single request
   - **Current Workaround:** Frontend can make multiple requests with different `branchId` filters
   - **Future Enhancement:** Consider adding `breakdownByBranch: true` parameter

5. **No Multi-Branch Selection:** Cannot filter by multiple branches in one request
   - **Current:** Single `branchId` or all branches
   - **Enhancement:** Consider accepting `branchId[]` array parameter

6. **Week Definition:** Weeks start on Monday (ISO 8601 standard)
   - **Note:** Ensure frontend expectations align with Monday-start weeks

### Integration Checklist for Frontend

- [ ] Pass dates in ISO 8601 format (e.g., `2024-01-15` or `2024-01-15T00:00:00.000Z`)
- [ ] Handle JWT token management (obtain, refresh, attach to requests)
- [ ] Ensure user has ADMIN role for access
- [ ] Map Turkish labels to English enum values:
  - Nakit → `CASH`
  - Kredi Kartı → `CREDIT_CARD`
  - Banka Havalesi → `BANK_TRANSFER`
  - Çek → `CHECK`
  - Diğer → `OTHER`
- [ ] Map grouping labels:
  - Günlük → `day`
  - Haftalık → `week`
  - Aylık → `month`
- [ ] Handle empty results gracefully (totalRevenue: 0, breakdown: [])
- [ ] Display period dates appropriately based on groupBy:
  - Daily: Format as "DD MMM YYYY"
  - Weekly: Format as "Week of DD MMM YYYY" (show Monday)
  - Monthly: Format as "MMM YYYY"
- [ ] Consider limiting date range selection to prevent excessive data
- [ ] Handle 400/401/403 errors with user-friendly messages

### Testing Recommendations

1. **Test with corrections:** Create a payment, correct it, and verify only the corrected amount appears in reports
2. **Test with multiple branches:** Verify branch filtering works correctly
3. **Test with mixed payment methods:** Verify filtering by payment method
4. **Test week boundaries:** Verify weeks start on Monday correctly
5. **Test month boundaries:** Verify months are grouped correctly (e.g., Jan 31 → Feb 1)
6. **Test empty date ranges:** Verify graceful handling of periods with no payments
7. **Test large date ranges:** Verify performance with 1+ year daily reports

### Proposed Future Enhancements

While **no backend changes are needed** to support the current "Gelir Raporları" requirements, here are potential future enhancements:

1. **Multi-Dimensional Breakdown**
   ```typescript
   // New query parameter
   breakdownBy?: 'paymentMethod' | 'branch' | 'both'
   
   // New response structure
   {
     totalRevenue: 45600.50,
     period: 'day',
     breakdown: [
       {
         period: '2024-01-15',
         total: 3200.00,
         count: 12,
         byPaymentMethod: {
           CASH: { revenue: 1200.00, count: 5 },
           CREDIT_CARD: { revenue: 2000.00, count: 7 }
         }
       }
     ]
   }
   ```

2. **Comparative Reports**
   ```typescript
   // Add comparison period
   compareWithPrevious?: boolean
   
   // Returns both current and previous period data
   ```

3. **Export Support**
   ```typescript
   // Add export format parameter
   format?: 'json' | 'csv' | 'xlsx'
   ```

4. **Pagination for Large Results**
   ```typescript
   page?: number
   limit?: number
   ```

5. **Custom Period Ranges**
   ```typescript
   groupBy?: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
   customDays?: number  // For custom period length
   ```

---

## Related Endpoints

While not strictly revenue reporting, these endpoints may be useful for related features:

### Payment List
- **GET** `/api/v1/payments`
- Returns detailed payment records (not aggregated)
- Supports same filters: `branchId`, `paymentMethod`, `startDate`, `endDate`
- Includes pagination: `page`, `limit`
- Returns full payment objects with member and branch details

### Dashboard Summary
- **GET** `/api/v1/dashboard/summary`
- Returns member statistics (not revenue)
- Supports branch filtering
- No ADMIN role required (accessible to all authenticated users)

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-01-27 | Initial documentation - Revenue reporting endpoints audit | GitHub Copilot |

---

## Contact & Support

For questions or issues related to these endpoints:
- **Backend Team:** Review `PaymentsController` and `PaymentsService` in `backend/src/payments/`
- **API Documentation:** See `docs/api/` for general API documentation
- **Schema:** Review `backend/prisma/schema.prisma` for data model

---

**End of Document**
