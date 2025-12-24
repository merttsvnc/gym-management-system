# Feature Specification: Collections & Revenue Tracking (Tahsilat & Gelir Takibi)

**Version:** 1.0.0  
**Author:** System Architect  
**Date:** 2025-12-18  
**Status:** Draft

---

## Overview

### Purpose

The Collections & Revenue Tracking module enables gym owners and managers to record payments collected from members and track revenue over time. This feature provides essential financial tracking capabilities, allowing gym administrators to monitor income by branch, payment method, and time period. The system maintains a complete audit trail of all payment transactions, supporting corrections while preserving historical accuracy.

This module serves as the foundation for financial reporting and helps gym owners understand their revenue patterns, identify trends, and make informed business decisions. It integrates with the existing Member and Branch models to provide contextual payment recording and reporting.

### Scope

**What IS included:**

- Payment entity for recording individual payment transactions
- Payment recording with date, amount, payment method, optional note, and member association
- Member payment history view (all payments for a specific member)
- Revenue reporting by time period (daily, weekly, monthly)
- Revenue filtering by branch and payment method
- Payment correction mechanism with audit trail preservation
- Backdated payment entry support (payments can be recorded for past dates)
- Tenant isolation enforcement (each tenant only sees their own payments)
- Branch-level revenue tracking (revenue can be filtered and reported per branch)

**What is NOT included:**

- Invoice generation or automated invoicing workflows
- Payment provider integration (Stripe, PayPal, etc.)
- Recurring payment automation or subscription billing
- Payment reminders or dunning workflows
- Advanced accounting features (double-entry bookkeeping, chart of accounts)
- Tax calculation or reporting
- Payment reconciliation with bank statements
- Multi-currency conversion (payments stored in tenant's default currency)
- Refund processing (payments can be corrected but no explicit refund workflow)
- Payment approval workflows or multi-step authorization
- Integration with external accounting systems (QuickBooks, Xero, etc.)

### Constitution Alignment

This feature aligns with multiple constitutional principles:

- **Principle 6 (Multi-Tenant SaaS):** Enforces strict tenant isolation for all payment records and revenue data
- **Principle 1 (Long-Term Maintainability):** Establishes clean payment data model that can be extended for future billing integrations
- **Principle 3 (Explicit Domain Rules):** Defines clear payment recording rules, correction workflows, and audit trail requirements
- **Principle 5 (Modular Architecture):** Creates reusable payment patterns that can be integrated with future subscription and billing modules
- **Principle 9 (Performance & Scalability):** Implements proper indexing for payment queries and revenue aggregation

---

## Clarifications

### Session 2025-12-18

- Q: What should happen if two admins try to correct the same payment simultaneously? → A: Optimistic locking (version field, second correction detects conflict and fails)
- Q: What level of logging should be implemented for payment operations? → A: Structured event logging (payment created/corrected events with metadata, excluding amounts)
- Q: Should payment recording and correction endpoints have rate limiting? → A: Yes, with specific limits: Payment creation endpoint (POST /api/v1/payments): 100 requests per 15 minutes per user. Payment correction endpoint (POST /api/v1/payments/:id/correct): 30-50 requests per 15 minutes per user (stricter than creation). See plan.md for implementation details.
- Q: How should payment dates be stored and handled across different timezones? → A: Store as date-only (no time component), use tenant timezone for date selection/display
- Q: Should there be any time restrictions on when payments can be corrected? → A: Warning but allow (show warning for old payments but allow correction)

---

## Success Criteria

The Collections & Revenue Tracking module will be considered successful when:

1. **Payment Recording:**
   - Admins can record payments for any member in their tenant in under 30 seconds
   - Payment recording form validates all inputs and provides clear error messages
   - Backdated payments can be recorded for any past date
   - 100% of payment records are correctly associated with member's branch and tenant

2. **Payment History:**
   - Member payment history loads in under 1 second for members with up to 100 payments
   - Payment history displays all payments in chronological order with clear correction indicators
   - Payment history pagination works correctly for members with 100+ payments
   - Date range filtering reduces payment list to matching payments accurately

3. **Revenue Reporting:**
   - Revenue reports generate in under 2 seconds for monthly reports with up to 1000 payments
   - Revenue calculations exclude corrected original payments and include corrected amounts
   - Branch filtering accurately isolates revenue to selected branch
   - Payment method filtering accurately isolates revenue to selected payment method
   - Revenue breakdown by day/week/month displays correctly for all time periods

4. **Payment Corrections:**
   - Payment corrections preserve original payment record with audit trail
   - Corrected payments are clearly marked in payment history
   - Revenue reports use corrected amounts (not original incorrect amounts)
   - Correction workflow prevents correcting already-corrected payments (single-correction rule enforced)

5. **Tenant Isolation:**
   - 100% of payment queries are automatically filtered by tenantId
   - Admins cannot see payments from other tenants
   - Admins cannot record payments for members from other tenants
   - Revenue reports only include data from admin's tenant

6. **Data Accuracy:**
   - Payment amounts are stored with 2 decimal places precision
   - Payment dates are stored as date-only (no time component) to avoid timezone conversion issues
   - Payment dates use tenant timezone for selection and display
   - Payment corrections maintain data integrity (no orphaned records)
   - Revenue calculations match sum of individual payments within date range

7. **User Experience:**
   - Payment recording form: A user can record a payment in ≤ 60 seconds on a typical dataset (member selection, amount entry, date selection, payment method, optional note)
   - Form validation: Forms have clear validation; invalid submit rate < 5% during manual QA (validation errors prevent submission before API call)
   - Loading/error states: Key flows have explicit empty/loading/error states (payment history table shows skeleton loader, form shows loading spinner, error messages displayed clearly)
   - Payment history navigation: Payment history displays payments in chronological order with clear correction indicators; pagination works correctly
   - Revenue reports: Revenue reports provide actionable insights (clear totals and breakdowns displayed prominently)
   - Error messages: Error messages are user-friendly, clear, and in Turkish (if applicable)

---

## User Stories

### US-001: Record a Payment
**As an** Admin (gym owner/manager)  
**I want to** record a payment received from a member  
**So that** I can track revenue and maintain accurate financial records

**Acceptance Criteria:**
- Admin can select a member from their tenant's member list
- Admin can enter payment amount, date, payment method, and optional note
- Payment date can be in the past (backdated payments)
- Payment is associated with the member's branch automatically
- Payment is recorded with current timestamp for audit purposes
- Payment appears in member's payment history immediately

### US-002: View Member Payment History
**As an** Admin  
**I want to** view all payments made by a specific member  
**So that** I can see their payment history and track outstanding balances

**Acceptance Criteria:**
- Admin can access member payment history from member detail page
- Payment history shows all payments in chronological order (newest first)
- Each payment entry displays: date, amount, payment method, note (if any), and correction status
- Payment history is paginated for members with many payments
- Admin can filter payment history by date range
- Corrected payments show both original and corrected amounts with audit trail

### US-003: View Revenue by Time Period
**As an** Admin  
**I want to** see how much revenue was collected in a given period  
**So that** I can understand revenue trends and performance

**Acceptance Criteria:**
- Admin can select time period: daily, weekly, or monthly
- Revenue report shows total amount collected in selected period
- Report can be filtered by branch (all branches or specific branch)
- Report can be filtered by payment method
- Report shows breakdown by date within the period
- Revenue includes corrected payment amounts (`isCorrection = true`)
- Revenue excludes original payments that have been corrected (`isCorrection = false` AND `isCorrected = true`)

### US-004: Filter Revenue by Branch
**As an** Admin with multiple branches  
**I want to** see revenue broken down by branch  
**So that** I can compare performance across locations

**Acceptance Criteria:**
- Revenue report includes branch filter option
- Admin can view revenue for all branches combined or individual branches
- Branch filter works with time period filters
- Revenue totals are calculated correctly per branch

### US-005: Filter Revenue by Payment Method
**As an** Admin  
**I want to** see revenue broken down by payment method  
**So that** I can understand which payment methods are most common

**Acceptance Criteria:**
- Revenue report includes payment method filter
- Admin can filter by: Cash, Credit Card, Bank Transfer, Check, Other
- Payment method filter works with time period and branch filters
- Report shows totals per payment method

### US-006: Correct Payment Mistakes
**As an** Admin  
**I want to** correct mistakes in payment records  
**So that** I can maintain accurate financial records while preserving audit trail

**Acceptance Criteria:**
- Admin can edit payment amount, date, payment method, or note
- Original payment record is preserved (not deleted)
- Correction creates new payment record linked to original
- Corrected payments are clearly marked in payment history
- Revenue reports use corrected amounts (not original incorrect amounts)
- Audit trail shows who made the correction and when

### US-007: Tenant Data Isolation
**As an** Admin  
**I want to** see only my tenant's payment data  
**So that** my financial information remains private and secure

**Acceptance Criteria:**
- Admin cannot see payments from other tenants
- All payment queries are automatically filtered by tenantId
- Revenue reports only include data from admin's tenant
- Member selection dropdown only shows members from admin's tenant

---

## Workflows

### Workflow 1: Record a New Payment

1. Admin navigates to Members page or Member detail page
2. Admin clicks "Record Payment" button
3. System displays payment entry form with:
   - Member selector (pre-filled if accessed from member detail page)
   - Payment amount field (required, numeric, positive)
   - Payment date field (required, defaults to today, can select past date)
   - Payment method dropdown (Cash, Credit Card, Bank Transfer, Check, Other)
   - Optional note field (text area)
4. Admin fills in payment details
5. Admin clicks "Save Payment"
6. System validates:
   - Member exists and belongs to admin's tenant
   - Amount is positive number
   - Date is not in the future
   - Payment method is valid
7. System creates Payment record with:
   - Member association
   - Branch association (from member's branch)
   - Tenant association (from member's tenant)
   - Amount, date, payment method, note
   - Created timestamp
   - Created by user ID
8. System returns success response
9. Payment appears in member's payment history
10. Revenue reports update to include new payment

### Workflow 2: View Member Payment History

1. Admin navigates to Member detail page
2. Admin clicks "Payment History" tab or section
3. System fetches all payments for the member (filtered by tenantId)
4. System displays payment list with:
   - Date column (formatted as DD/MM/YYYY)
   - Amount column (formatted with currency symbol)
   - Payment method column
   - Note column (if present)
   - Correction indicator (if payment was corrected)
5. Payments sorted by date descending (newest first)
6. If more than 20 payments, system paginates results
7. Admin can filter by date range using date picker
8. Admin can click on payment to view details or correct

### Workflow 3: View Revenue Report

1. Admin navigates to Revenue/Reports page
2. Admin selects time period: Daily, Weekly, or Monthly
3. Admin selects date range (start date and end date)
4. Admin optionally selects branch filter (All Branches or specific branch)
5. Admin optionally selects payment method filter (All Methods or specific method)
6. Admin clicks "Generate Report"
7. System queries payments matching:
   - Tenant ID (from authenticated user)
   - Date range
   - Branch filter (if specified)
   - Payment method filter (if specified)
   - Excludes corrected payments (uses corrected amounts instead)
8. System aggregates revenue:
   - Groups by date within period
   - Sums amounts per date
   - Calculates total for period
9. System displays report with:
   - Total revenue for period
   - Daily/weekly/monthly breakdown (depending on period selection)
   - Chart visualization (optional, future enhancement)
   - Export to CSV option (optional, future enhancement)

### Workflow 4: Correct a Payment

1. Admin views member payment history
2. Admin identifies incorrect payment record
3. Admin clicks "Correct Payment" button on payment record
4. System displays payment correction form pre-filled with original values
5. Admin modifies incorrect fields (amount, date, payment method, or note)
6. Admin enters correction reason in note field (optional but recommended)
7. Admin clicks "Save Correction"
8. System validates:
   - Original payment exists and belongs to admin's tenant
   - Corrected amount is positive (if amount changed)
   - Corrected date is not in the future (if date changed)
9. System creates new Payment record with:
   - Same member, branch, tenant associations
   - Corrected values (amount, date, payment method, note)
   - Links to original payment via `correctedPaymentId`
   - `isCorrection` flag set to true
   - Created timestamp
   - Created by user ID
10. System marks original payment with `isCorrected` flag set to true
11. System updates `correctedPaymentId` on original payment
12. System returns success response
13. Payment history shows both original and corrected payment
14. Revenue reports use corrected amount (not original)

---

## Domain Model

### Core Concepts

**What is a Payment?**

A Payment represents a single financial transaction where money was collected from a member. Each payment is associated with a member, branch, and tenant. Payments can be recorded for past dates (backdated) and can be corrected if mistakes are discovered. The system maintains a complete audit trail of all payment transactions and corrections.

**Payment Correction Semantics:**

- When a payment is corrected, the original payment record is preserved (not deleted)
- A new payment record is created with corrected values
- The new payment is linked to the original via `correctedPaymentId`
- Revenue calculations use the corrected payment amount (not the original)
- Both original and corrected payments appear in payment history
- The correction preserves audit trail: who made the correction, when, and why

**Revenue Calculation Rules:**

- Revenue includes corrected payment amounts (`isCorrection = true`)
- Revenue excludes original payments that have been corrected (`isCorrection = false` AND `isCorrected = true`)
- Revenue includes regular payments that have not been corrected (`isCorrection = false` AND `isCorrected = false`)
- Revenue can be filtered by branch (member's branch determines payment branch)
- Revenue can be filtered by payment method
- Revenue calculations are tenant-scoped (only includes payments from admin's tenant)
- Revenue calculations use `paidOn` for time period filtering

### Entities

#### Payment

```typescript
interface Payment {
  id: string; // CUID primary key
  tenantId: string; // Foreign key to Tenant (REQUIRED)
  branchId: string; // Foreign key to Branch (from member's branch)
  memberId: string; // Foreign key to Member (REQUIRED)
  
  // Payment details
  amount: Decimal; // Payment amount (positive number, 2 decimal places)
  paidOn: Date; // Date payment was received (date-only, no time component; can be in the past)
  paymentMethod: PaymentMethod; // Enum: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER
  note: string | null; // Optional note about the payment
  
  // Correction tracking
  isCorrection: boolean; // True if this payment corrects another payment
  correctedPaymentId: string | null; // Reference to original payment if this is a correction
  isCorrected: boolean; // True if this payment has been corrected
  
  // Optimistic locking
  version: number; // Version number for optimistic locking (increments on each update)
  
  // Audit fields
  createdBy: string; // User ID who created the payment
  createdAt: Date; // Timestamp when payment was recorded
  updatedAt: Date; // Timestamp when payment was last updated
}
```

#### PaymentMethod Enum

```typescript
enum PaymentMethod {
  CASH = 'CASH',                    // Cash payment
  CREDIT_CARD = 'CREDIT_CARD',      // Credit or debit card
  BANK_TRANSFER = 'BANK_TRANSFER',  // Bank transfer/wire transfer
  CHECK = 'CHECK',                   // Check payment
  OTHER = 'OTHER'                    // Other payment methods
}
```

### Relationships

```
Tenant (1) ──< (many) Payment
Branch (1) ──< (many) Payment
Member (1) ──< (many) Payment
Payment (1) ──< (1) Payment (correction relationship)
```

- A Payment MUST belong to exactly one Tenant
- A Payment MUST belong to exactly one Branch (inherited from member)
- A Payment MUST belong to exactly one Member
- A Payment CAN correct another Payment (one-to-one relationship via `correctedPaymentId`)
- A Payment CAN be corrected by another Payment (one-to-one relationship via `correctedPaymentId`)

### Business Rules

**Rule 1: Payment Recording**
- Payment amount MUST be positive (greater than zero)
- `paidOn` is a DATE-ONLY business date (represents the date payment was received)
- `paidOn` is stored as DateTime set to start-of-day UTC (00:00:00Z)
- Tenant timezone is used for date selection/display in UI
- `createdAt`/`updatedAt` are audit timestamps only, never used for reporting windows
- `paidOn` CAN be in the past (backdated payments allowed)
- `paidOn` CANNOT be in the future
- Member MUST exist and belong to the same tenant as the admin
- Payments ARE allowed for archived/inactive members (UI shows non-blocking warning)
- Payments ARE allowed if member's branch is archived (UI shows non-blocking warning)
- Branch is automatically set from member's branch (cannot be changed independently)
- Revenue reporting uses `paidOn` date and stored `branchId`/`memberId` for historical reporting accuracy

**Rule 2: Payment Correction**
- Only payments that have NOT been corrected can be corrected (`isCorrected = false`)
- **Correction chain is DISALLOWED:** If `isCorrected = true`, correction endpoint returns 400 BadRequest
- Correction uses optimistic locking: Payment model includes `version` field that increments on each update
- When correcting, system checks `version` matches expected value; if mismatch detected, correction fails with conflict error
- Corrections are allowed at any time (no time restrictions)
- If payment is older than 90 days, system displays warning message but allows correction to proceed
- Correction creates a new Payment record (original is preserved)
- Corrected payment MUST have `isCorrection = true` and `correctedPaymentId` set
- Original payment MUST have `isCorrected = true` and `correctedPaymentId` set to new payment's ID
- Correction can modify: amount, paidOn, paymentMethod, or note
- Correction preserves member, branch, and tenant associations (cannot be changed)

**Rule 3: Revenue Calculation**
- Revenue includes corrected payment amounts (`isCorrection = true`)
- Revenue excludes original payments that have been corrected (`isCorrection = false` AND `isCorrected = true`)
- Revenue includes regular payments that have not been corrected (`isCorrection = false` AND `isCorrected = false`)
- Revenue calculations MUST be filtered by `tenantId` (tenant isolation)
- Revenue can be filtered by `branchId` (optional)
- Revenue can be filtered by `paymentMethod` (optional)
- Revenue calculations use `paidOn` for time period filtering

**Rule 4: Tenant Isolation**
- All payment queries MUST filter by `tenantId` automatically
- Admin can only see payments from their own tenant
- Admin can only record payments for members from their own tenant
- Payment corrections can only be made on payments from admin's tenant

**Rule 5: Payment Method Validation**
- Payment method MUST be one of: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER
- Payment method cannot be null or empty

**Rule 6: Audit Trail**
- Every payment MUST record `createdBy` (user ID who created the payment)
- Every payment MUST record `createdAt` (timestamp when payment was recorded)
- Corrections preserve original `createdAt` timestamp (correction has its own `createdAt`)
- Payment history shows both original and corrected payments with clear indicators

---

## API Specification

**Note on `paidOn` Field Semantics:**
- `paidOn` is a DATE-ONLY business date (represents the date payment was received)
- Stored as DateTime set to start-of-day UTC (00:00:00Z)
- Tenant timezone is used for date selection/display in UI
- `createdAt`/`updatedAt` are audit timestamps only, never used for reporting windows

### Endpoints

#### POST /api/v1/payments

**Purpose:** Record a new payment for a member

**Authorization:** ADMIN role required

**Request:**
```typescript
interface CreatePaymentRequest {
  memberId: string; // CUID of member
  amount: number; // Positive number, 2 decimal places
  paidOn: string; // ISO 8601 date string (YYYY-MM-DD, date-only, no time component), can be in the past
  paymentMethod: PaymentMethod; // Enum: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER
  note?: string | null; // Optional note (max 500 characters)
}
```

**Response:**
```typescript
interface PaymentResponse {
  id: string;
  tenantId: string;
  branchId: string;
  memberId: string;
  amount: string; // Decimal as string (e.g., "100.00")
  paidOn: string; // ISO 8601 date string (YYYY-MM-DD, date-only, no time component)
  paymentMethod: PaymentMethod;
  note: string | null;
  isCorrection: boolean;
  correctedPaymentId: string | null;
  isCorrected: boolean;
  version: number; // Version number for optimistic locking
  createdBy: string;
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string; // ISO 8601 datetime string
  member: {
    id: string;
    firstName: string;
    lastName: string;
  };
  branch: {
    id: string;
    name: string;
  };
}
```

**Status Codes:**
- 201: Payment created successfully
- 400: Validation error (invalid amount, date in future, member not found, etc.)
- 401: Unauthorized (not authenticated)
- 403: Forbidden (member belongs to different tenant)
- 404: Member not found
- 429: Too Many Requests (rate limit exceeded)
- 500: Server error

**Validation Rules:**
- `memberId`: Required, must exist and belong to authenticated user's tenant
- `amount`: Required, must be positive number, max 2 decimal places, max value 999999.99
- `paidOn`: Required, must be valid date (YYYY-MM-DD format, date-only), cannot be in the future, uses tenant timezone for validation
- `paymentMethod`: Required, must be valid PaymentMethod enum value
- `note`: Optional, max 500 characters if provided

**Error Responses:**
```typescript
// Validation error
{
  statusCode: 400,
  message: "Validation failed",
  errors: [
    {
      field: "amount",
      message: "Amount must be a positive number"
    }
  ]
}

// Member not found or belongs to different tenant
{
  statusCode: 403,
  message: "Member not found or access denied"
}
```

---

#### GET /api/v1/payments

**Purpose:** List payments with filtering and pagination

**Authorization:** ADMIN role required

**Query Parameters:**
- `memberId` (optional): Filter by member ID
- `branchId` (optional): Filter by branch ID
- `paymentMethod` (optional): Filter by payment method
- `startDate` (optional): Filter payments from this date (inclusive, ISO 8601)
- `endDate` (optional): Filter payments to this date (inclusive, ISO 8601)
- `includeCorrections` (optional): Include corrected payments in results (default: true)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response:**
```typescript
interface PaymentListResponse {
  data: PaymentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Status Codes:**
- 200: Success
- 400: Invalid query parameters
- 401: Unauthorized
- 500: Server error

**Behavior:**
- All queries automatically filtered by `tenantId` from authenticated user
- Results sorted by `paidOn` descending (newest first)
- Pagination applies to filtered results
- `includeCorrections` controls whether to include payments that have been corrected (original payments)

---

#### GET /api/v1/payments/:id

**Purpose:** Get a single payment by ID

**Authorization:** ADMIN role required

**URL Parameters:**
- `id`: Payment ID (CUID)

**Response:**
```typescript
interface PaymentResponse {
  // Same as POST /api/v1/payments response
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 403: Forbidden (payment belongs to different tenant)
- 404: Payment not found
- 500: Server error

---

#### GET /api/v1/members/:memberId/payments

**Purpose:** Get all payments for a specific member (payment history)

**Authorization:** ADMIN role required

**URL Parameters:**
- `memberId`: Member ID (CUID)

**Query Parameters:**
- `startDate` (optional): Filter payments from this date (inclusive)
- `endDate` (optional): Filter payments to this date (inclusive)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response:**
```typescript
interface PaymentListResponse {
  // Same as GET /api/v1/payments response
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 403: Forbidden (member belongs to different tenant)
- 404: Member not found
- 500: Server error

**Behavior:**
- Returns all payments for the specified member
- Automatically filtered by tenantId
- Includes both original and corrected payments
- Sorted by paidOn descending (newest first)

---

#### POST /api/v1/payments/:id/correct

**Purpose:** Correct a payment that contains mistakes

**Authorization:** ADMIN role required

**URL Parameters:**
- `id`: Payment ID to correct (CUID)

**Request:**
```typescript
interface CorrectPaymentRequest {
  amount?: number; // New amount (if correcting amount)
  paidOn?: string; // New date (if correcting date, ISO 8601)
  paymentMethod?: PaymentMethod; // New payment method (if correcting method)
  note?: string | null; // Updated note (optional)
  correctionReason?: string | null; // Reason for correction (optional, max 500 chars)
  version: number; // Current version of payment (for optimistic locking)
}
```

**Response:**
```typescript
interface PaymentResponse {
  // Same as POST /api/v1/payments response
  // This is the NEW corrected payment record
}

// Response includes warning if payment is older than 90 days
interface CorrectPaymentResponse {
  payment: PaymentResponse;
  warning?: string; // Warning message if payment is older than 90 days (e.g., "This payment is over 90 days old. Please verify the correction is accurate.")
}
```

**Status Codes:**
- 201: Correction created successfully
- 400: Validation error (payment already corrected, invalid values, etc.)
- 401: Unauthorized
- 403: Forbidden (payment belongs to different tenant)
- 404: Payment not found
- 409: Conflict (version mismatch - payment was modified by another user)
- 429: Too Many Requests (rate limit exceeded)
- 500: Server error

**Validation Rules:**
- Original payment MUST exist and belong to authenticated user's tenant
- Original payment MUST NOT already be corrected (`isCorrected = false`)
- `version` MUST match current payment version (optimistic locking check)
- At least one field must be provided (amount, paidOn, paymentMethod, or note)
- If `amount` provided: must be positive number, max 2 decimal places
- If `paidOn` provided: must be valid date, cannot be in the future
- If `paymentMethod` provided: must be valid PaymentMethod enum value
- `correctionReason`: Optional, max 500 characters

**Behavior:**
- Validates payment version matches expected value (optimistic locking)
- If version mismatch detected, returns 409 Conflict error
- If payment is older than 90 days, includes warning message in response (correction still proceeds)
- Creates new Payment record with corrected values
- Links new payment to original via `correctedPaymentId`
- Sets `isCorrection = true` on new payment
- Sets `isCorrected = true` on original payment and increments version
- Sets `correctedPaymentId` on original payment to new payment's ID
- Preserves member, branch, tenant associations from original payment

**Error Responses:**
```typescript
// Payment already corrected
{
  statusCode: 400,
  message: "This payment has already been corrected"
}

// No fields provided
{
  statusCode: 400,
  message: "At least one field must be provided for correction"
}

// Version conflict (optimistic locking)
{
  statusCode: 409,
  message: "Payment was modified by another user. Please refresh and try again."
}
```

---

#### GET /api/v1/revenue

**Purpose:** Get revenue report aggregated by time period

**Authorization:** ADMIN role required

**Query Parameters:**
- `startDate` (required): Start date for revenue period (ISO 8601)
- `endDate` (required): End date for revenue period (ISO 8601)
- `branchId` (optional): Filter by branch ID
- `paymentMethod` (optional): Filter by payment method
- `groupBy` (optional): Grouping period - "day", "week", or "month" (default: "day")

**Response:**
```typescript
interface RevenueReportResponse {
  totalRevenue: string; // Total revenue as decimal string
  currency: string; // Tenant's default currency
  period: {
    startDate: string; // ISO 8601 date
    endDate: string; // ISO 8601 date
  };
  breakdown: Array<{
    period: string; // Period identifier (date, week, or month)
    revenue: string; // Revenue for this period as decimal string
    paymentCount: number; // Number of payments in this period
  }>;
  filters: {
    branchId: string | null;
    paymentMethod: PaymentMethod | null;
  };
}
```

**Status Codes:**
- 200: Success
- 400: Invalid query parameters (missing dates, invalid date range, etc.)
- 401: Unauthorized
- 500: Server error

**Validation Rules:**
- `startDate`: Required, must be valid date
- `endDate`: Required, must be valid date, must be after or equal to startDate
- `branchId`: Optional, must exist and belong to authenticated user's tenant if provided
- `paymentMethod`: Optional, must be valid PaymentMethod enum value if provided
- `groupBy`: Optional, must be "day", "week", or "month"

**Behavior:**
- Revenue includes corrected payment amounts (`isCorrection = true`)
- Revenue excludes original payments that have been corrected (`isCorrection = false` AND `isCorrected = true`)
- Revenue includes regular payments that have not been corrected (`isCorrection = false` AND `isCorrected = false`)
- All queries automatically filtered by `tenantId`
- Breakdown groups payments by selected period (day, week, or month)
- Revenue calculations use `paidOn` for time period filtering

**Example Response:**
```json
{
  "totalRevenue": "15000.00",
  "currency": "USD",
  "period": {
    "startDate": "2025-12-01",
    "endDate": "2025-12-31"
  },
  "breakdown": [
    {
      "period": "2025-12-01",
      "revenue": "500.00",
      "paymentCount": 5
    },
    {
      "period": "2025-12-02",
      "revenue": "750.00",
      "paymentCount": 7
    }
  ],
  "filters": {
    "branchId": null,
    "paymentMethod": null
  }
}
```

---

## Data Model (Prisma Schema)

```prisma
// Payment method enum
enum PaymentMethod {
  CASH
  CREDIT_CARD
  BANK_TRANSFER
  CHECK
  OTHER
}

// Payment model
model Payment {
  id                 String        @id @default(cuid())
  tenantId           String
  branchId           String
  memberId           String
  
  // Payment details
  amount             Decimal       @db.Decimal(10, 2)
  paidOn             DateTime      // DATE-ONLY business date: stored as DateTime set to start-of-day UTC (00:00:00Z); tenant timezone used for date selection/display
  paymentMethod      PaymentMethod
  note               String?      @db.VarChar(500)
  
  // Correction tracking
  isCorrection       Boolean      @default(false)
  correctedPaymentId String?
  isCorrected        Boolean      @default(false)
  
  // Optimistic locking
  version            Int          @default(0)
  
  // Audit fields
  createdBy          String       // User ID
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  
  // Relations
  tenant             Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch             Branch       @relation(fields: [branchId], references: [id], onDelete: Restrict)
  member             Member       @relation(fields: [memberId], references: [id], onDelete: Restrict)
  correctedPayment   Payment?     @relation("PaymentCorrection", fields: [correctedPaymentId], references: [id])
  correctingPayment  Payment?     @relation("PaymentCorrection")
  
  @@index([tenantId])
  @@index([tenantId, branchId])
  @@index([tenantId, memberId])
  @@index([tenantId, paidOn])
  @@index([tenantId, paymentMethod])
  @@index([tenantId, paidOn, branchId])
  @@index([tenantId, paidOn, paymentMethod])
  @@index([memberId])
  @@index([branchId])
  @@index([correctedPaymentId])
  @@index([tenantId, isCorrection])
  @@index([tenantId, isCorrected])
}
```

### Migration Considerations

**Initial Migration:**

- Creates `PaymentMethod` enum with values: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER
- Creates `Payment` table with all fields and indexes
- Adds foreign key constraints to Tenant, Branch, and Member tables
- Adds self-referential foreign key for correction relationship
- Sets up indexes for efficient querying by tenant, branch, member, date, and payment method

**Backward Compatibility:**

- No existing tables modified (additive change only)
- No breaking changes to existing API contracts
- Member and Branch models remain unchanged

**Index Strategy:**

- `@@index([tenantId])`: Base tenant isolation index
- `@@index([tenantId, branchId])`: Branch-filtered revenue queries
- `@@index([tenantId, memberId])`: Member payment history queries
- `@@index([tenantId, paidOn])`: Time-period revenue queries
- `@@index([tenantId, paymentMethod])`: Payment method filtering
- `@@index([tenantId, paidOn, branchId])`: Branch-filtered revenue by date
- `@@index([tenantId, paidOn, paymentMethod])`: Payment method filtered revenue by date
- `@@index([memberId])`: Member payment history (without tenant filter for performance)
- `@@index([branchId])`: Branch payment queries
- `@@index([correctedPaymentId])`: Correction relationship queries
- `@@index([tenantId, isCorrection])`: Filtering corrected payments
- `@@index([tenantId, isCorrected])`: Filtering payments that have been corrected

---

## Frontend Specification

### User Interface

#### Screens/Views

**1. Payment Recording Form**
- Modal or dedicated page for recording new payments
- Member selector (searchable dropdown or autocomplete)
- Payment amount input (numeric, currency formatted)
- Payment date picker (defaults to today in tenant timezone, can select past dates, date-only selection)
- Payment method dropdown (CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER)
- Optional note textarea (max 500 characters)
- Non-blocking warning banner displayed if member is archived/inactive or branch is archived (informational only, does not prevent submission)
- Save and Cancel buttons

**2. Member Payment History View**
- Tab or section on member detail page
- Table displaying payment history with columns:
  - Date (formatted as DD/MM/YYYY using tenant timezone)
  - Amount (formatted with currency symbol)
  - Payment Method (badge or icon)
  - Note (truncated if long, expandable)
  - Status (indicator if payment was corrected)
  - Actions (Correct Payment button)
- Pagination controls
- Date range filter (optional)
- Export to CSV button (optional, future enhancement)

**3. Revenue Report Page**
- Time period selector (Daily, Weekly, Monthly)
- Date range picker (start date and end date)
- Branch filter dropdown (All Branches or specific branch)
- Payment method filter dropdown (All Methods or specific method)
- Generate Report button
- Report display area showing:
  - Total revenue for period (large, prominent)
  - Currency indicator
  - Breakdown table (period, revenue, payment count)
  - Chart visualization (optional, future enhancement)
- Export to CSV button (optional, future enhancement)

**4. Payment Correction Form**
- Modal or inline form for correcting payments
- Pre-filled with original payment values
- Editable fields: amount, payment date, payment method, note
- Correction reason field (optional textarea)
- Original payment details displayed (read-only, for reference)
- Warning banner displayed if payment is older than 90 days (e.g., "This payment is over 90 days old. Please verify the correction is accurate.")
- Non-blocking warning banner displayed if member is archived/inactive or branch is archived (informational only, does not block correction)
- Warning is informational only (does not block correction)
- Save Correction and Cancel buttons

#### User Flows

**Flow 1: Record Payment from Member Detail Page**
1. Admin navigates to member detail page
2. Admin clicks "Record Payment" button
3. Payment form opens as modal with member pre-selected
4. Admin enters payment details
5. Admin clicks "Save Payment"
6. Modal closes, success toast notification appears
7. Payment history section updates to show new payment

**Flow 2: Record Payment from Payments Page**
1. Admin navigates to Payments page
2. Admin clicks "Record New Payment" button
3. Payment form opens (full page or modal)
4. Admin selects member from dropdown
5. Admin enters payment details
6. Admin clicks "Save Payment"
7. Success notification appears
8. Payments list updates to show new payment

**Flow 3: View Revenue Report**
1. Admin navigates to Revenue/Reports page
2. Admin selects "Monthly" time period
3. Admin selects date range (e.g., December 2025)
4. Admin selects specific branch from dropdown
5. Admin clicks "Generate Report"
6. Report displays with total revenue and daily breakdown
7. Admin can adjust filters and regenerate report

**Flow 4: Correct Payment**
1. Admin views member payment history
2. Admin identifies incorrect payment (wrong amount)
3. Admin clicks "Correct Payment" button
4. Correction form opens with original values pre-filled
5. If payment is older than 90 days, warning banner displays (does not block correction)
6. Admin changes amount to correct value
7. Admin enters correction reason: "Amount was entered incorrectly"
8. Admin clicks "Save Correction"
9. Success notification appears (includes warning if payment was old)
10. Payment history shows both original (marked as corrected) and new corrected payment
11. Revenue reports update to use corrected amount

#### Components

**New Components Needed:**
- `PaymentForm`: Reusable form for recording and correcting payments
- `PaymentHistoryTable`: Table component for displaying payment history
- `RevenueReport`: Component for displaying revenue reports with filters
- `PaymentMethodBadge`: Badge component for displaying payment method with icon
- `CorrectionIndicator`: Component for showing correction status on payments

**Existing Components to Extend:**
- Member detail page: Add payment history tab/section
- Navigation: Add "Revenue" or "Reports" menu item

### State Management

**Payment State:**
- Payment list cached in React Query with tenant-scoped cache key
- Payment history cached per member with cache invalidation on new payment
- Revenue reports cached with cache key based on filters (date range, branch, payment method)
- Cache invalidation: Invalidate payment list cache when new payment created or corrected

**Optimistic Updates:**
- When recording payment, optimistically add to payment list
- If API call fails, rollback optimistic update and show error
- When correcting payment, optimistically update payment history
- Revenue reports can use optimistic updates but should refetch after payment changes

### Performance Considerations

**Loading States:**
- Show skeleton loaders for payment history table while fetching
- Show loading spinner for revenue report generation
- Disable form submit button while payment is being saved

**Pagination:**
- Payment history paginated (20 items per page default)
- Payment list paginated (20 items per page default)
- Load more or infinite scroll for payment history (optional enhancement)

**Data Fetching:**
- Use React Query for automatic caching and refetching
- Prefetch payment history when member detail page loads
- Debounce revenue report generation (wait for user to finish selecting filters)

---

## Security & Tenant Isolation

### Tenant Scoping

**Database Queries:**
- All Payment queries MUST include `WHERE tenantId = ?` filter
- Payment service methods automatically inject tenantId from authenticated user
- No raw queries that bypass tenant filtering

**API Endpoints:**
- All payment endpoints extract `tenantId` from JWT token
- Member validation ensures member belongs to authenticated user's tenant
- Branch validation ensures branch belongs to authenticated user's tenant
- Payment ID lookups verify payment belongs to authenticated user's tenant before returning

**UI State:**
- Member selector dropdown only shows members from authenticated user's tenant
- Branch filter only shows branches from authenticated user's tenant
- Revenue reports automatically scoped to authenticated user's tenant

### Authorization

**Current Role: ADMIN**
- ADMIN users can record payments for any member in their tenant
- ADMIN users can view all payments in their tenant
- ADMIN users can correct any payment in their tenant
- ADMIN users can view revenue reports for their tenant

**Future Roles (Out of Scope):**
- COACH role: May have read-only access to payment history (future enhancement)
- ACCOUNTANT role: May have full access plus export capabilities (future enhancement)
- STAFF role: May have limited access (future enhancement)

### Rate Limiting

**Payment Endpoints:**
- Payment recording endpoint (POST /api/v1/payments): 100 requests per 15 minutes per user
- Payment correction endpoint (POST /api/v1/payments/:id/correct): 30-50 requests per 15 minutes per user (stricter than creation)
- Rate limiting applies per authenticated user (tracked by user ID from JWT token)
- When rate limit exceeded, return 429 Too Many Requests with clear error message
- Rate limit hits logged for monitoring and abuse detection
- Read-only endpoints (GET /api/v1/payments, GET /api/v1/revenue) do not require rate limiting (pagination provides natural limits)

**Note on MVP Scope:** Rate limiting and idempotency are REQUIRED features for production readiness. If MVP scope is constrained, these may be delivered in Phase 2, but they must be implemented before production deployment. See plan.md for MVP scope decisions.

### Data Sensitivity

**Payment Data:**
- Payment amounts are sensitive financial data and MUST NOT be logged in application logs
- Payment notes may contain PII or sensitive information and MUST NOT be logged
- Structured event logging implemented for payment operations (created, corrected events)
- Logged events include: event type, payment ID, member ID, tenant ID, branch ID, payment method, user ID, timestamp
- Logged events exclude: payment amounts, payment notes, any PII
- Payment corrections preserve audit trail but should not expose sensitive data in error messages

**Audit Trail:**
- `createdBy` field stores user ID for audit purposes
- Payment corrections preserve original payment record for compliance
- Payment history shows who created each payment (if user information available)
- Structured logs provide searchable audit trail for payment operations (without sensitive data)

---

## Testing Requirements

### Unit Tests

**Payment Service:**
- [ ] `createPayment()` validates member belongs to tenant
- [ ] `createPayment()` validates amount is positive
- [ ] `createPayment()` validates payment date is not in future
- [ ] `createPayment()` truncates `paidOn` to start-of-day UTC before storing
- [ ] `createPayment()` sets branch from member's branch automatically
- [ ] `createPayment()` sets tenant from authenticated user
- [ ] `correctPayment()` validates original payment belongs to tenant
- [ ] `correctPayment()` validates original payment is not already corrected
- [ ] `correctPayment()` validates version matches (optimistic locking)
- [ ] `correctPayment()` throws conflict error when version mismatch detected
- [ ] `correctPayment()` creates new payment record with corrected values
- [ ] `correctPayment()` links new payment to original payment
- [ ] `correctPayment()` marks original payment as corrected and increments version
- [ ] `getRevenueReport()` excludes corrected original payments
- [ ] `getRevenueReport()` includes corrected payment amounts
- [ ] `getRevenueReport()` filters by tenant automatically
- [ ] `getRevenueReport()` filters by branch when provided
- [ ] `getRevenueReport()` filters by payment method when provided

**Payment Validation:**
- [ ] Amount validation: rejects negative amounts
- [ ] Amount validation: rejects zero amounts
- [ ] Amount validation: accepts positive amounts with 2 decimal places
- [ ] Payment date validation: rejects future dates
- [ ] Payment date validation: accepts past dates
- [ ] Payment date validation: accepts today's date
- [ ] Payment method validation: rejects invalid enum values
- [ ] Payment method validation: accepts all valid enum values
- [ ] Note validation: accepts null or empty string
- [ ] Note validation: rejects notes longer than 500 characters

### Integration Tests

**API Endpoints:**
- [ ] POST /api/v1/payments creates payment successfully
- [ ] POST /api/v1/payments returns 400 for invalid amount
- [ ] POST /api/v1/payments returns 400 for future date
- [ ] POST /api/v1/payments returns 403 for member from different tenant
- [ ] GET /api/v1/payments returns only payments from authenticated user's tenant
- [ ] GET /api/v1/payments filters by memberId correctly
- [ ] GET /api/v1/payments filters by branchId correctly
- [ ] GET /api/v1/payments filters by paymentMethod correctly
- [ ] GET /api/v1/payments filters by date range correctly
- [ ] GET /api/v1/members/:memberId/payments returns payment history for member
- [ ] GET /api/v1/members/:memberId/payments returns 403 for member from different tenant
- [ ] POST /api/v1/payments/:id/correct creates correction successfully
- [ ] POST /api/v1/payments/:id/correct returns 400 for already corrected payment
- [ ] POST /api/v1/payments/:id/correct returns 403 for payment from different tenant
- [ ] POST /api/v1/payments/:id/correct returns 409 for version mismatch (concurrent correction attempt)
- [ ] POST /api/v1/payments/:id/correct includes warning in response for payments older than 90 days
- [ ] POST /api/v1/payments returns 429 when rate limit exceeded
- [ ] POST /api/v1/payments/:id/correct returns 429 when rate limit exceeded
- [ ] GET /api/v1/revenue calculates total revenue correctly
- [ ] GET /api/v1/revenue excludes corrected original payments
- [ ] GET /api/v1/revenue includes corrected payment amounts
- [ ] GET /api/v1/revenue filters by branch correctly
- [ ] GET /api/v1/revenue filters by payment method correctly
- [ ] GET /api/v1/revenue groups by day correctly
- [ ] GET /api/v1/revenue groups by week correctly
- [ ] GET /api/v1/revenue groups by month correctly

**Tenant Isolation:**
- [ ] Tenant A cannot see Tenant B's payments
- [ ] Tenant A cannot record payment for Tenant B's member
- [ ] Tenant A cannot correct Tenant B's payment
- [ ] Tenant A's revenue report only includes Tenant A's payments
- [ ] Cross-tenant payment queries return empty results

**Logging & Observability:**
- [ ] Payment creation logs structured event (excludes amount and note)
- [ ] Payment correction logs structured event (excludes amount and note)
- [ ] Logged events include: event type, payment ID, member ID, tenant ID, branch ID, payment method, user ID, timestamp
- [ ] Logged events exclude: payment amounts, payment notes, PII
- [ ] Error logs exclude sensitive payment data

### Edge Cases

- [ ] Payment with amount exactly 0.01 (minimum positive amount)
- [ ] Payment with very large amount (999999.99)
- [ ] Payment recorded on same day as today (edge case for date validation)
- [ ] Payment recorded many years in the past (backdated payment)
- [ ] Payment correction where all fields are changed
- [ ] Payment correction where only note is changed
- [ ] Revenue report with no payments in date range (returns zero revenue)
- [ ] Revenue report with date range spanning multiple years
- [ ] Payment history for member with no payments (empty list)
- [ ] Payment history for member with 100+ payments (pagination)
- [ ] Payment correction chain DISALLOWED: Attempting to correct an already-corrected payment (`isCorrected = true`) returns 400 BadRequest
- [ ] Concurrent payment corrections (two admins correcting same payment simultaneously) - Optimistic locking prevents conflicts, second correction returns 409 Conflict
- [ ] Payment correction for payment older than 90 days (warning displayed but correction allowed)
- [ ] Payment recorded for archived member - See Open Questions Q2
- [ ] Payment recorded for archived branch - See Open Questions Q3
- [ ] Revenue report with branch filter for branch with no payments
- [ ] Revenue report with payment method filter that has no payments

---

## Performance & Scalability

### Expected Load

**Typical Usage Patterns:**
- Small gym (single branch, 100-500 members): 10-50 payments per day
- Medium gym (2-5 branches, 500-2000 members): 50-200 payments per day
- Large gym (5+ branches, 2000+ members): 200-1000 payments per day

**Data Volume Expectations:**
- Payment records: ~30,000 per year for medium gym (100 payments/day × 300 days)
- Payment history queries: Most members have 1-12 payments (monthly memberships)
- Revenue reports: Typically generated monthly or weekly, not real-time

**Query Performance Targets:**
- Payment list query: < 100ms for 20 items with filters
- Member payment history: < 50ms for member with 50 payments
- Revenue report generation: < 500ms for monthly report with 1000 payments
- Payment creation: < 50ms including validation and database write

### Database Indexes

Required indexes for performance:
- [ ] `@@index([tenantId])`: Base tenant isolation (critical for all queries)
- [ ] `@@index([tenantId, branchId])`: Branch-filtered revenue queries
- [ ] `@@index([tenantId, memberId])`: Member payment history queries
- [ ] `@@index([tenantId, paidOn])`: Time-period revenue queries (most important for reports)
- [ ] `@@index([tenantId, paymentMethod])`: Payment method filtering
- [ ] `@@index([tenantId, paidOn, branchId])`: Branch-filtered revenue by date (composite for common query pattern)
- [ ] `@@index([tenantId, paidOn, paymentMethod])`: Payment method filtered revenue by date (composite for common query pattern)
- [ ] `@@index([memberId])`: Member payment history (without tenant filter for performance)
- [ ] `@@index([branchId])`: Branch payment queries
- [ ] `@@index([correctedPaymentId])`: Correction relationship queries

### Query Optimization

**N+1 Query Concerns:**
- Payment list queries should include member and branch relations in single query
- Use Prisma `include` to load related data: `include: { member: true, branch: true }`
- Revenue report aggregation should use database aggregation functions (SUM, COUNT) rather than loading all payments

**Revenue Report Optimization:**
- Use database GROUP BY for period breakdown rather than application-level grouping
- Consider materialized views for monthly revenue summaries (future enhancement)
- Cache revenue reports for common date ranges (e.g., current month)

**Pagination:**
- Use cursor-based pagination for very large payment lists (future enhancement)
- Limit maximum page size to prevent performance issues (max 100 items per page)

---

## Implementation Checklist

### Backend

- [ ] Add `PaymentMethod` enum to Prisma schema
- [ ] Add `Payment` model to Prisma schema with all fields and indexes
- [ ] Create migration for Payment table
- [ ] Create `PaymentService` with business logic methods
- [ ] Create `PaymentsController` with HTTP endpoints
- [ ] Create `CreatePaymentDto` with validation
- [ ] Create `CorrectPaymentDto` with validation
- [ ] Create `RevenueReportDto` for query parameters
- [ ] Implement tenant isolation in all service methods
- [ ] Implement payment correction logic with audit trail
- [ ] Implement revenue calculation logic (excluding corrected originals)
- [ ] Implement structured event logging for payment operations (exclude amounts and notes)
- [ ] Configure rate limiting for payment endpoints (100 requests per 15 minutes per user)
- [ ] Add unit tests for PaymentService
- [ ] Add integration tests for all API endpoints
- [ ] Add E2E tests for payment workflows

### Frontend

- [ ] Add `PaymentMethod` enum to shared TypeScript types
- [ ] Add `Payment` interface to shared TypeScript types
- [ ] Create API client methods for payment endpoints
- [ ] Create `PaymentForm` component
- [ ] Create `PaymentHistoryTable` component
- [ ] Create `RevenueReport` component
- [ ] Create `PaymentMethodBadge` component
- [ ] Create `CorrectionIndicator` component
- [ ] Add payment history section to member detail page
- [ ] Add "Record Payment" button to member detail page
- [ ] Add "Revenue" or "Reports" page to navigation
- [ ] Implement payment recording workflow
- [ ] Implement payment correction workflow
- [ ] Implement revenue report generation workflow
- [ ] Add loading states for all async operations
- [ ] Add error handling and user-friendly error messages
- [ ] Add success notifications for payment operations
- [ ] Test payment workflows end-to-end

### Documentation

- [ ] Update API documentation with payment endpoints
- [ ] Document payment correction workflow
- [ ] Document revenue calculation rules
- [ ] Add inline code comments for complex payment logic
- [ ] Create user guide for recording payments (optional)

---

## Open Questions

**Q1: Payment Correction Chain**
- **Question:** Should a payment that has been corrected be allowed to be corrected again (creating a chain of corrections)?
- **Decision:** Correction chain is DISALLOWED. If `isCorrected = true`, correction endpoint returns 400 BadRequest. This is enforced by invariant in Rule 2: Payment Correction.
- **Rationale:** Simplifies logic and prevents confusion. If multiple corrections needed, admin can create new payment manually.

**Q2: Payments for Archived Members**
- **Question:** Should payments be allowed for members with status ARCHIVED or INACTIVE?
- **Decision:** Payments ARE allowed for archived/inactive members (supports backdated payments and historical accuracy).
- **Behavior:** UI displays a non-blocking warning banner when recording or correcting a payment if the member is archived/inactive. Payment submission is still allowed.
- **Rationale:** Historical record-keeping and backdated payment support require allowing payments regardless of member status. Revenue reporting uses `paidOn` date and stored `memberId`/`branchId` for historical reporting accuracy.

**Q3: Payments for Archived Branches**
- **Question:** Should payments be allowed for members whose branch is archived?
- **Decision:** Payments ARE allowed even if the member's branch is archived (historical accuracy).
- **Behavior:** UI displays a non-blocking warning banner when recording or correcting a payment if the branch is archived. Payment submission is still allowed.
- **Rationale:** Historical accuracy is important. Revenue reporting uses `paidOn` date and stored `branchId`/`memberId` for historical reporting, regardless of current branch status.

---

## Future Enhancements

**Invoice Generation:**
- Generate PDF invoices for payments
- Email invoices to members automatically
- Invoice templates customizable per tenant

**Payment Provider Integration:**
- Integrate with Stripe, PayPal, or local payment providers
- Process online payments directly through system
- Automatic payment recording from provider webhooks

**Recurring Payment Automation:**
- Automatic payment processing for recurring memberships
- Payment reminders before due date
- Failed payment retry logic

**Advanced Reporting:**
- Revenue trends and forecasting
- Comparison reports (this month vs last month)
- Member lifetime value calculations
- Payment method distribution charts

**Multi-Currency Support:**
- Support multiple currencies per tenant
- Currency conversion for reporting
- Payment recording in different currencies

**Refund Processing:**
- Explicit refund workflow (separate from corrections)
- Refund reason tracking
- Refund approval workflows

**Export Capabilities:**
- Export payment history to CSV/Excel
- Export revenue reports to PDF
- Scheduled report generation and email delivery

**Payment Reconciliation:**
- Import bank statements
- Match payments with bank transactions
- Reconciliation reports

---

**Approval**

- [ ] Domain model reviewed and approved
- [ ] API design reviewed and approved
- [ ] Security implications reviewed
- [ ] Performance implications reviewed
- [ ] Ready for implementation

---

**End of Specification**
