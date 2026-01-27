# Data Model: Collections & Revenue Tracking

**Feature:** Collections & Revenue Tracking (Feature 007)  
**Version:** 1.0.0  
**Date:** 2025-12-18

---

## Overview

This document defines the data model for the Collections & Revenue Tracking module, including Prisma schema definitions, relationships, validation rules, and indexing strategy.

---

## Entities

### Payment

Represents a single financial transaction where money was collected from a member.

**Prisma Model:**
```prisma
model Payment {
  id                 String        @id @default(cuid())
  tenantId           String
  branchId           String
  memberId           String
  
  // Payment details
  amount             Decimal       @db.Decimal(10, 2)
  paidOn             DateTime      // DATE-ONLY business date: stored as DateTime set to start-of-day UTC (00:00:00Z); tenant timezone used for date selection/display
  paymentMethod      PaymentMethod
  note               String?       @db.VarChar(500)
  
  // Correction tracking
  isCorrection       Boolean       @default(false)
  correctedPaymentId String?
  isCorrected        Boolean       @default(false)
  
  // Optimistic locking
  version            Int           @default(0)
  
  // Audit fields
  createdBy          String        // User ID
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  
  // Relations
  tenant             Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch             Branch        @relation(fields: [branchId], references: [id], onDelete: Restrict)
  member             Member        @relation(fields: [memberId], references: [id], onDelete: Restrict)
  correctedPayment   Payment?      @relation("PaymentCorrection", fields: [correctedPaymentId], references: [id])
  correctingPayment  Payment?      @relation("PaymentCorrection")
  
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

**Field Descriptions:**

- `id`: CUID primary key
- `tenantId`: Foreign key to Tenant (REQUIRED, for tenant isolation)
- `branchId`: Foreign key to Branch (inherited from member's branch, REQUIRED)
- `memberId`: Foreign key to Member (REQUIRED)
- `amount`: Payment amount in tenant's currency (Decimal(10,2), positive, 2 decimal places)
- `paidOn`: DATE-ONLY business date (DateTime, stored as start-of-day UTC 00:00:00Z, tenant timezone used for date selection/display, can be in the past)
- `paymentMethod`: Payment method enum (CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER)
- `note`: Optional note about the payment (max 500 characters)
- `isCorrection`: True if this payment corrects another payment
- `correctedPaymentId`: Reference to original payment if this is a correction (nullable)
- `isCorrected`: True if this payment has been corrected
- `version`: Version number for optimistic locking (increments on each update)
- `createdBy`: User ID who created the payment (for audit trail)
- `createdAt`: Timestamp when payment was recorded
- `updatedAt`: Timestamp when payment was last updated

**Validation Rules:**

1. **Amount:**
   - Must be positive (greater than zero)
   - Maximum value: 999999.99
   - Precision: 2 decimal places

2. **Payment Date (`paidOn`):**
   - `paidOn` is a DATE-ONLY business date (represents the date payment was received)
   - Stored as DateTime set to start-of-day UTC (00:00:00Z)
   - Tenant timezone is used for date selection/display in UI
   - `createdAt`/`updatedAt` are audit timestamps only, never used for reporting windows
   - Cannot be in the future
   - Can be in the past (backdated payments allowed)

3. **Member:**
   - Must exist and belong to the same tenant as authenticated user
   - Branch is automatically set from member's branch (cannot be changed independently)

4. **Correction:**
   - Only payments with `isCorrected = false` can be corrected
   - Correction uses optimistic locking (version field)
   - Correction creates new Payment record (original preserved)
   - Corrected payment MUST have `isCorrection = true` and `correctedPaymentId` set
   - Original payment MUST have `isCorrected = true` and `correctedPaymentId` set to new payment's ID

---

### PaymentMethod Enum

Enumeration of supported payment methods.

**Prisma Enum:**
```prisma
enum PaymentMethod {
  CASH            // Cash payment
  CREDIT_CARD     // Credit or debit card
  BANK_TRANSFER   // Bank transfer/wire transfer
  CHECK           // Check payment
  OTHER           // Other payment methods
}
```

**Values:**
- `CASH`: Cash payment
- `CREDIT_CARD`: Credit or debit card payment
- `BANK_TRANSFER`: Bank transfer or wire transfer
- `CHECK`: Check payment
- `OTHER`: Other payment methods not covered above

---

### IdempotencyKey (Optional)

Stores idempotency keys for payment creation to prevent duplicate payments on retries.

**Prisma Model:**
```prisma
model IdempotencyKey {
  id           String    @id @default(cuid())
  key          String    @unique
  tenantId     String
  userId       String
  response     Json      // Cached response
  createdAt    DateTime  @default(now())
  expiresAt    DateTime  // TTL: 24 hours
  
  @@index([key])
  @@index([expiresAt]) // For cleanup job
}
```

**Field Descriptions:**

- `id`: CUID primary key
- `key`: Unique idempotency key (from client request header)
- `tenantId`: Tenant ID (for tenant isolation)
- `userId`: User ID who created the payment
- `response`: Cached payment response (JSON)
- `createdAt`: Timestamp when key was created
- `expiresAt`: Expiration timestamp (24 hours after creation)

**Usage:**
- Client sends `Idempotency-Key` header with unique value
- Server checks if key exists, returns cached response if found
- Server stores key with payment response if new
- Keys expire after 24 hours (cleanup job removes expired keys)

---

## Relationships

### Payment Relationships

```
Tenant (1) ──< (many) Payment
Branch (1) ──< (many) Payment
Member (1) ──< (many) Payment
Payment (1) ──< (1) Payment (correction relationship)
```

**Relationship Details:**

1. **Payment → Tenant (Many-to-One):**
   - Every payment belongs to exactly one tenant
   - Foreign key: `tenantId`
   - Cascade delete: If tenant is deleted, all payments are deleted
   - Index: `@@index([tenantId])` for tenant isolation queries

2. **Payment → Branch (Many-to-One):**
   - Every payment belongs to exactly one branch (inherited from member)
   - Foreign key: `branchId`
   - Restrict delete: Cannot delete branch if payments exist
   - Index: `@@index([branchId])`, `@@index([tenantId, branchId])` for branch-filtered queries

3. **Payment → Member (Many-to-One):**
   - Every payment belongs to exactly one member
   - Foreign key: `memberId`
   - Restrict delete: Cannot delete member if payments exist
   - Index: `@@index([memberId])`, `@@index([tenantId, memberId])` for member payment history

4. **Payment → Payment (Self-Referential, One-to-One):**
   - Correction relationship: One payment can correct another payment
   - Foreign key: `correctedPaymentId` (nullable)
   - Self-relation: `correctedPayment` and `correctingPayment`
   - Index: `@@index([correctedPaymentId])` for correction queries

---

## Indexes

### Index Strategy

Indexes are designed to optimize common query patterns while maintaining tenant isolation.

**Base Tenant Isolation:**
- `@@index([tenantId])`: Base tenant isolation index (critical for all queries)

**Branch Filtering:**
- `@@index([tenantId, branchId])`: Branch-filtered revenue queries
- `@@index([tenantId, paidOn, branchId])`: Branch-filtered revenue by date (composite)

**Member Payment History:**
- `@@index([tenantId, memberId])`: Member payment history queries
- `@@index([memberId])`: Member payment history (without tenant filter for performance)

**Date-Based Queries:**
- `@@index([tenantId, paidOn])`: Time-period revenue queries (most important for reports)
- `@@index([tenantId, paidOn, branchId])`: Branch-filtered revenue by date
- `@@index([tenantId, paidOn, paymentMethod])`: Payment method filtered revenue by date

**Payment Method Filtering:**
- `@@index([tenantId, paymentMethod])`: Payment method filtering

**Correction Queries:**
- `@@index([correctedPaymentId])`: Correction relationship queries
- `@@index([tenantId, isCorrection])`: Filtering corrected payments
- `@@index([tenantId, isCorrected])`: Filtering payments that have been corrected

**Performance Considerations:**
- Composite indexes starting with `tenantId` optimize tenant-scoped queries
- Date indexes support efficient date range queries for revenue reports
- Member and branch indexes support fast member payment history and branch filtering

---

## Business Rules

### Payment Recording Rules

1. **Amount Validation:**
   - Amount MUST be positive (greater than zero)
   - Amount precision: 2 decimal places
   - Maximum amount: 999999.99

2. **Date Validation (`paidOn`):**
   - `paidOn` is a DATE-ONLY business date (represents the date payment was received)
   - Stored as DateTime set to start-of-day UTC (00:00:00Z)
   - Tenant timezone is used for date selection/display in UI
   - `createdAt`/`updatedAt` are audit timestamps only, never used for reporting windows
   - Payment date CAN be in the past (backdated payments allowed)
   - Payment date CANNOT be in the future

3. **Member Validation:**
   - Member MUST exist and belong to the same tenant as authenticated user
   - Branch is automatically set from member's branch (cannot be changed independently)

4. **Payment Method Validation:**
   - Payment method MUST be one of: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER
   - Payment method cannot be null or empty

### Payment Correction Rules

1. **Correction Eligibility:**
   - Only payments with `isCorrected = false` can be corrected
   - Correction chain is DISALLOWED: If `isCorrected = true`, correction endpoint returns 400 BadRequest
   - Correction uses optimistic locking (version field)

2. **Optimistic Locking:**
   - Payment model includes `version` field that increments on each update
   - When correcting, system checks `version` matches expected value
   - If version mismatch detected, correction fails with 409 Conflict error

3. **Correction Process:**
   - Correction creates a new Payment record (original is preserved)
   - Corrected payment MUST have `isCorrection = true` and `correctedPaymentId` set
   - Original payment MUST have `isCorrected = true` and `correctedPaymentId` set to new payment's ID
   - Correction chain is DISALLOWED: If `isCorrected = true`, correction endpoint returns 400 BadRequest
   - Correction can modify: amount, paidOn, paymentMethod, or note
   - Correction preserves member, branch, and tenant associations (cannot be changed)

4. **Time Restrictions:**
   - Corrections are allowed at any time (no time restrictions)
   - If payment is older than 90 days, system displays warning but allows correction

### Revenue Calculation Rules

1. **Payment Inclusion:**
   - Revenue includes corrected payment amounts (`isCorrection = true`)
   - Revenue excludes original payments that have been corrected (`isCorrection = false` AND `isCorrected = true`)
   - Revenue includes regular payments that have not been corrected (`isCorrection = false` AND `isCorrected = false`)

2. **Filtering:**
   - Revenue calculations MUST be filtered by `tenantId` (tenant isolation)
   - Revenue can be filtered by `branchId` (optional)
   - Revenue can be filtered by `paymentMethod` (optional)
   - Revenue calculations use `paidOn` for time period filtering

3. **Aggregation:**
   - Revenue calculations use database aggregation (GROUP BY) for performance
   - Breakdown by day/week/month uses database date functions

### Tenant Isolation Rules

1. **Query Filtering:**
   - All payment queries MUST filter by `tenantId` automatically
   - Admin can only see payments from their own tenant
   - Admin can only record payments for members from their own tenant

2. **Validation:**
   - Payment corrections can only be made on payments from admin's tenant
   - Revenue reports only include data from admin's tenant

---

## Data Integrity

### Foreign Key Constraints

1. **Payment → Tenant:**
   - `ON DELETE CASCADE`: If tenant is deleted, all payments are deleted
   - `ON UPDATE CASCADE`: If tenant ID changes, payment tenantId updates

2. **Payment → Branch:**
   - `ON DELETE RESTRICT`: Cannot delete branch if payments exist
   - `ON UPDATE CASCADE`: If branch ID changes, payment branchId updates

3. **Payment → Member:**
   - `ON DELETE RESTRICT`: Cannot delete member if payments exist
   - `ON UPDATE CASCADE`: If member ID changes, payment memberId updates

4. **Payment → Payment (Correction):**
   - `ON DELETE SET NULL`: If corrected payment is deleted, correctedPaymentId set to null
   - `ON UPDATE CASCADE`: If payment ID changes, correctedPaymentId updates

### Unique Constraints

- `IdempotencyKey.key`: Unique constraint ensures idempotency keys are unique

### Check Constraints

- Amount validation (positive, max 999999.99) enforced at application layer
- Payment date validation (not future) enforced at application layer
- Payment method validation (enum) enforced at database and application layer

---

## Migration Strategy

### Initial Migration

**Migration Name:** `add_payment_tracking`

**Steps:**

1. Create `PaymentMethod` enum:
   ```sql
   CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER');
   ```

2. Create `Payment` table with all fields and indexes

3. Create `IdempotencyKey` table (optional, for idempotency support)

4. Add foreign key constraints

5. Add all indexes

**Backward Compatibility:**
- No existing tables modified (additive change only)
- No breaking changes to existing API contracts
- Member and Branch models remain unchanged

**Rollback:**
- Drop `Payment` table
- Drop `IdempotencyKey` table (if created)
- Drop `PaymentMethod` enum

---

## Performance Considerations

### Query Optimization

1. **Tenant Isolation:**
   - All queries start with `tenantId` filter (uses base index)
   - Composite indexes optimize common query patterns

2. **Date Range Queries:**
   - Use `@@index([tenantId, paidOn])` for efficient date filtering
   - Composite indexes support branch and payment method filtering with dates

3. **Member Payment History:**
   - Use `@@index([tenantId, memberId])` for member-specific queries
   - Pagination limits result size

4. **Revenue Aggregation:**
   - Use database GROUP BY for period breakdown (not application-level grouping)
   - Indexes support efficient aggregation queries

### N+1 Query Prevention

- Payment list queries include member and branch relations in single query
- Use Prisma `include` to load related data: `include: { member: true, branch: true }`
- Revenue report aggregation uses database aggregation functions (SUM, COUNT) rather than loading all payments

---

**End of Data Model Document**

