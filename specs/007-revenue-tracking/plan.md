# Implementation Plan: Collections & Revenue Tracking

**Version:** 1.0.0  
**Created:** 2025-12-18  
**Updated:** 2025-12-18  
**Status:** Planning

---

## Overview

### Feature Summary
The Collections & Revenue Tracking module enables gym owners and managers to record payments collected from members and track revenue over time. This feature provides essential financial tracking capabilities, allowing gym administrators to monitor income by branch, payment method, and time period. The system maintains a complete audit trail of all payment transactions, supporting corrections while preserving historical accuracy.

### Related Specification
- `/specs/007-revenue-tracking/spec.md`

### Estimated Effort
- Backend: 5-6 person-days
- Frontend: 4-5 person-days
- Testing: 2-3 person-days
- Total: 11-14 person-days

---

## Constitution Compliance Check

Before proceeding, verify alignment with core constitutional principles:

- [x] **Long-Term Maintainability:** Payment correction logic uses explicit optimistic locking pattern, well-documented and maintainable. Revenue calculation logic is clear and testable.

- [x] **Security & Correctness:** Tenant isolation enforced at all layers. Payment amounts excluded from application logs (security requirement). Optimistic locking prevents concurrent correction conflicts. Rate limiting prevents abuse.

- [x] **Explicit Domain Rules:** Payment recording rules, correction workflows, and revenue calculation logic are explicit in service layer with comprehensive unit tests. Business rules documented in spec.

- [x] **Layered Architecture:** Business logic in PaymentService, controllers handle HTTP only. React components handle presentation only. No business logic in controllers or UI.

- [x] **Multi-Tenant Isolation:** All payment queries filter by tenantId automatically. Payment creation validates member belongs to tenant. Revenue reports scoped to tenant.

- [x] **Data Integrity:** Migration creates new Payment table (additive, backward compatible). Foreign keys enforce referential integrity. Optimistic locking via version field prevents concurrent conflicts.

- [x] **Professional UI/UX:** Payment recording form optimized for fast entry (<30 seconds). Payment history with clear correction indicators. Revenue reports with intuitive filters. Loading states and error handling.

- [x] **Performance & Scalability:** Comprehensive indexes for tenant-scoped queries, date filtering, branch filtering, and payment method filtering. Pagination on all list endpoints. Revenue aggregation uses database GROUP BY.

- [x] **Testing Coverage:** Unit tests for payment validation, correction logic, revenue calculation. Integration tests for all API endpoints. E2E tests for payment workflows including conflict scenarios.

---

## Technical Context

### Current State
- Member model exists with tenantId and branchId relationships
- Branch model exists with tenantId relationship
- Tenant model exists
- Authentication and authorization infrastructure exists (JWT with tenantId)
- No payment tracking system exists
- No revenue reporting exists

### Required Changes

**Database:**
- Create PaymentMethod enum (CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER)
- Create Payment model with all fields including version for optimistic locking
- Add indexes for efficient querying

**Backend:**
- Create PaymentService with business logic
- Create PaymentsController with REST endpoints
- Implement optimistic locking for payment corrections
- Implement structured event logging (exclude amounts)
- Implement rate limiting for payment endpoints
- Implement idempotency for payment creation
- Implement revenue calculation logic (exclude corrected originals)

**Frontend:**
- Create PaymentForm component
- Create PaymentHistoryTable component
- Create RevenueReport component
- Add payment recording to member detail page
- Add revenue reports page

### Technical Unknowns (Resolved in research.md)

1. **Optimistic Locking in Prisma:**
   - How to implement version field updates with conflict detection
   - Pattern for handling Prisma P2002 (unique constraint) vs version mismatch
   - Decision: Use version field with explicit check in transaction

2. **Rate Limiting in NestJS:**
   - Which library to use (throttler vs custom)
   - Per-user vs per-IP rate limiting
   - Decision: Use @nestjs/throttler with per-user tracking

3. **Idempotency for Payment Creation:**
   - Idempotency key storage strategy
   - Idempotency key expiration
   - Decision: Store idempotency keys in database with TTL

4. **Structured Event Logging:**
   - Logger library choice (Winston vs Pino vs NestJS Logger)
   - Event schema design
   - Decision: Use NestJS Logger with structured JSON format

5. **Date-Only Storage in Prisma:**
   - How to store date-only (no time component) in PostgreSQL
   - Timezone handling for date selection
   - Decision: Use DateTime type, truncate time component, use tenant timezone for display

### Dependencies

**External:**
- @nestjs/throttler (for rate limiting)
- No additional external dependencies required

**Internal:**
- Member model and service (for member validation)
- Branch model (for branch association)
- Tenant model (for tenant isolation)
- Authentication infrastructure (JWT guards)
- Existing error handling patterns

### Integration Points

- PaymentService integrates with MemberService for member validation
- PaymentService uses Prisma for database access
- PaymentsController uses JWT authentication guards
- Frontend integrates with existing member detail page
- Frontend uses existing API client patterns

---

## Implementation Phases

### Phase 0: Research & Design

**Goal:** Resolve all technical unknowns and finalize design decisions

**Tasks:**
1. [x] Research optimistic locking patterns in Prisma
   - **Finding:** Prisma doesn't have built-in optimistic locking, need explicit version check in transaction
   - **Decision:** Use version field with `updateMany` pattern to detect conflicts

2. [x] Research rate limiting libraries for NestJS
   - **Finding:** @nestjs/throttler is standard, supports per-user tracking
   - **Decision:** Use @nestjs/throttler with Redis or in-memory store

3. [x] Research idempotency key patterns
   - **Finding:** Store idempotency keys in database with unique constraint
   - **Decision:** Create IdempotencyKey model with TTL cleanup

4. [x] Research structured logging patterns
   - **Finding:** NestJS Logger supports structured logging, can use Pino for production
   - **Decision:** Use NestJS Logger with JSON formatter, exclude amounts from logs

5. [x] Research date-only storage in PostgreSQL
   - **Finding:** PostgreSQL DATE type vs DateTime truncation
   - **Decision:** Use DateTime, truncate time component, validate at application layer

**Deliverables:**
- research.md (detailed findings)
- All technical decisions documented

**Review Points:**
- Optimistic locking approach approved
- Rate limiting strategy validated
- Idempotency mechanism approved
- Logging strategy approved

---

### Phase 1: Database Schema & Migration

**Goal:** Create Payment model and migration

**Tasks:**
1. [ ] Add PaymentMethod enum to Prisma schema
   - Estimated effort: 15 minutes
   - Dependencies: None
   - Files affected: `backend/prisma/schema.prisma`
   - Add enum: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER

2. [ ] Add Payment model to Prisma schema
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/prisma/schema.prisma`
   - Add all fields: id, tenantId, branchId, memberId, amount, paymentDate, paymentMethod, note, isCorrection, correctedPaymentId, isCorrected, version, createdBy, createdAt, updatedAt
   - Add relations: tenant, branch, member, correctedPayment, correctingPayment
   - Add all indexes as specified in spec

3. [ ] Create migration
   - Estimated effort: 1 hour
   - Dependencies: Task 2
   - Files affected: `backend/prisma/migrations/`
   - Create PaymentMethod enum
   - Create Payment table with all fields
   - Add foreign key constraints
   - Add all indexes
   - Add self-referential foreign key for correction relationship

4. [ ] Test migration on development database
   - Estimated effort: 30 minutes
   - Dependencies: Task 3
   - Verify table created correctly
   - Verify indexes created correctly
   - Verify foreign keys work correctly
   - Test rollback if needed

**Deliverables:**
- Updated Prisma schema
- Migration file
- Migration tested successfully

**Testing:**
- Migration runs successfully on clean database
- Migration runs successfully on database with existing data
- Rollback works correctly
- Indexes are created and optimized

**Review Points:**
- Schema changes reviewed
- Index strategy validated
- Foreign key constraints reviewed

---

### Phase 2: Backend Service Layer

**Goal:** Implement PaymentService with business logic

**Tasks:**
1. [ ] Create PaymentService class
   - Estimated effort: 2 hours
   - Dependencies: Phase 1
   - Files affected: `backend/src/payments/payments.service.ts`
   - Implement createPayment method with validation
   - Implement correctPayment method with optimistic locking
   - Implement getPaymentById method with tenant validation
   - Implement listPayments method with filtering
   - Implement getMemberPayments method
   - Implement getRevenueReport method with aggregation

2. [ ] Implement payment validation logic
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.service.ts`
   - Validate amount is positive
   - Validate payment date is not in future
   - Validate member belongs to tenant
   - Validate payment method is valid enum

3. [ ] Implement optimistic locking for corrections
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.service.ts`
   - Check version field matches expected value
   - Use Prisma transaction for atomic update
   - Throw ConflictException on version mismatch
   - Increment version on successful correction

4. [ ] Implement revenue calculation logic
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.service.ts`
   - Exclude corrected original payments
   - Include corrected payment amounts
   - Filter by tenant, branch, payment method, date range
   - Use database aggregation (GROUP BY) for performance

5. [ ] Implement structured event logging
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.service.ts`
   - Log payment.created event (exclude amount and note)
   - Log payment.corrected event (exclude amount and note)
   - Log payment.voided event (if implemented)
   - Include metadata: tenantId, branchId, paymentId, memberId, paymentMethod, actorUserId, result, correlationId

**Deliverables:**
- PaymentService with all business logic
- Validation logic implemented
- Optimistic locking implemented
- Revenue calculation implemented
- Structured logging implemented

**Testing:**
- Unit tests for payment validation
- Unit tests for optimistic locking
- Unit tests for revenue calculation
- Unit tests for tenant isolation

**Review Points:**
- Business logic covers all edge cases
- Optimistic locking prevents conflicts correctly
- Revenue calculation excludes corrected originals correctly
- Logging excludes sensitive data

---

### Phase 3: Backend DTOs & Validation

**Goal:** Create DTOs with validation decorators

**Tasks:**
1. [ ] Create CreatePaymentDto
   - Estimated effort: 30 minutes
   - Dependencies: Phase 2
   - Files affected: `backend/src/payments/dto/create-payment.dto.ts`
   - Add memberId, amount, paymentDate, paymentMethod, note fields
   - Add validation decorators (IsString, IsPositive, IsDateString, IsEnum, MaxLength)
   - Add custom validation for payment date (not future)

2. [ ] Create CorrectPaymentDto
   - Estimated effort: 30 minutes
   - Dependencies: Phase 2
   - Files affected: `backend/src/payments/dto/correct-payment.dto.ts`
   - Add optional amount, paymentDate, paymentMethod, note, correctionReason fields
   - Add required version field
   - Add validation decorators

3. [ ] Create PaymentListQueryDto
   - Estimated effort: 30 minutes
   - Dependencies: Phase 2
   - Files affected: `backend/src/payments/dto/payment-list-query.dto.ts`
   - Add optional filters: memberId, branchId, paymentMethod, startDate, endDate, includeCorrections
   - Add pagination: page, limit
   - Add validation decorators

4. [ ] Create RevenueReportQueryDto
   - Estimated effort: 30 minutes
   - Dependencies: Phase 2
   - Files affected: `backend/src/payments/dto/revenue-report-query.dto.ts`
   - Add required startDate, endDate fields
   - Add optional branchId, paymentMethod, groupBy fields
   - Add validation decorators

5. [ ] Create PaymentResponseDto
   - Estimated effort: 30 minutes
   - Dependencies: Phase 2
   - Files affected: `backend/src/payments/dto/payment-response.dto.ts`
   - Map Prisma Payment to response DTO
   - Include member and branch relations
   - Format amounts as strings

**Deliverables:**
- All DTOs created with validation
- Validation decorators applied
- Response DTOs for API contracts

**Testing:**
- Unit tests for DTO validation
- Test invalid inputs return 400 errors

**Review Points:**
- DTO validation covers all cases
- Error messages are clear and helpful

---

### Phase 4: Backend Controller & API

**Goal:** Create REST API endpoints

**Tasks:**
1. [ ] Create PaymentsController
   - Estimated effort: 2 hours
   - Dependencies: Phase 3
   - Files affected: `backend/src/payments/payments.controller.ts`
   - Implement POST /api/v1/payments (create payment)
   - Implement GET /api/v1/payments (list payments)
   - Implement GET /api/v1/payments/:id (get payment)
   - Implement GET /api/v1/members/:memberId/payments (member payment history)
   - Implement POST /api/v1/payments/:id/correct (correct payment)
   - Implement GET /api/v1/revenue (revenue report)

2. [ ] Add rate limiting guards
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.controller.ts`
   - Apply @Throttle decorator to POST /api/v1/payments (100 requests per 15 minutes)
   - Apply @Throttle decorator to POST /api/v1/payments/:id/correct (100 requests per 15 minutes)
   - Configure throttler module

3. [ ] Add idempotency support
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.controller.ts`, `backend/src/payments/payments.service.ts`
   - Create IdempotencyKey model
   - Check idempotency key in createPayment
   - Return cached response if key exists
   - Store idempotency key with TTL

4. [ ] Add error handling
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.controller.ts`
   - Handle 409 Conflict for version mismatch
   - Handle 429 Too Many Requests for rate limit
   - Handle 400 Validation errors
   - Handle 403 Forbidden for tenant violations
   - Return Turkish error messages where applicable

5. [ ] Add authorization guards
   - Estimated effort: 30 minutes
   - Dependencies: Task 1
   - Files affected: `backend/src/payments/payments.controller.ts`
   - Apply @UseGuards(JwtAuthGuard, RolesGuard)
   - Require ADMIN role for all endpoints

**Deliverables:**
- PaymentsController with all endpoints
- Rate limiting configured
- Idempotency support implemented
- Error handling implemented
- Authorization guards applied

**Testing:**
- Integration tests for all endpoints
- Test rate limiting returns 429
- Test idempotency returns cached response
- Test optimistic locking returns 409
- Test tenant isolation returns 403

**Review Points:**
- All endpoints match API spec
- Rate limiting works correctly
- Idempotency works correctly
- Error messages are user-friendly

---

### Phase 5: Backend Testing

**Goal:** Comprehensive test coverage

**Tasks:**
1. [ ] Unit tests for PaymentService
   - Estimated effort: 4 hours
   - Dependencies: Phase 2
   - Files affected: `backend/src/payments/payments.service.spec.ts`
   - Test createPayment validation
   - Test correctPayment optimistic locking
   - Test revenue calculation logic
   - Test tenant isolation
   - Test payment date validation

2. [ ] Integration tests for API endpoints
   - Estimated effort: 6 hours
   - Dependencies: Phase 4
   - Files affected: `backend/test/payments.e2e-spec.ts`
   - Test POST /api/v1/payments (happy path, validation errors, tenant violations)
   - Test GET /api/v1/payments (filtering, pagination, tenant isolation)
   - Test GET /api/v1/payments/:id (success, not found, tenant violation)
   - Test GET /api/v1/members/:memberId/payments (success, tenant violation)
   - Test POST /api/v1/payments/:id/correct (happy path, version conflict, tenant violation)
   - Test GET /api/v1/revenue (aggregation, filtering, tenant isolation)
   - Test rate limiting (429 responses)
   - Test idempotency (cached responses)

3. [ ] Edge case tests
   - Estimated effort: 2 hours
   - Dependencies: Phase 2
   - Files affected: `backend/src/payments/payments.service.spec.ts`
   - Test payment with amount 0.01
   - Test payment with very large amount
   - Test payment date exactly today
   - Test payment date many years in past
   - Test correction of corrected payment (if restriction implemented)
   - Test concurrent corrections (optimistic locking)
   - Test revenue report with no payments
   - Test revenue report spanning multiple years

**Deliverables:**
- Unit test suite with >90% coverage
- Integration test suite covering all endpoints
- Edge case tests

**Testing:**
- All tests passing
- Coverage meets requirements

**Review Points:**
- Test coverage meets requirements
- Tests are maintainable and clear
- Edge cases covered

---

### Phase 6: Frontend Types & API Client

**Goal:** Create TypeScript types and API client methods

**Tasks:**
1. [ ] Add Payment types to shared types
   - Estimated effort: 30 minutes
   - Dependencies: Phase 4
   - Files affected: `frontend/src/types/payment.ts`
   - Add PaymentMethod enum
   - Add Payment interface
   - Add CreatePaymentRequest interface
   - Add CorrectPaymentRequest interface
   - Add PaymentListResponse interface
   - Add RevenueReportResponse interface

2. [ ] Create payment API client methods
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `frontend/src/api/payments.ts`
   - Implement createPayment method
   - Implement getPayments method
   - Implement getPaymentById method
   - Implement getMemberPayments method
   - Implement correctPayment method
   - Implement getRevenueReport method
   - Add error handling for 409, 429, 400, 403

**Deliverables:**
- Payment types defined
- API client methods implemented

**Testing:**
- Test API client methods with mock responses
- Test error handling

**Review Points:**
- Types match backend contracts
- API client follows existing patterns

---

### Phase 7: Frontend Components

**Goal:** Create UI components for payment management

**Tasks:**
1. [ ] Create PaymentForm component
   - Estimated effort: 3 hours
   - Dependencies: Phase 6
   - Files affected: `frontend/src/components/payments/PaymentForm.tsx`
   - Member selector (searchable dropdown)
   - Amount input (currency formatted)
   - Payment date picker (date-only, tenant timezone)
   - Payment method dropdown
   - Note textarea (optional, max 500 chars)
   - Form validation
   - Loading states
   - Error handling

2. [ ] Create PaymentHistoryTable component
   - Estimated effort: 2 hours
   - Dependencies: Phase 6
   - Files affected: `frontend/src/components/payments/PaymentHistoryTable.tsx`
   - Table with columns: date, amount, payment method, note, status, actions
   - Correction indicator badge
   - Pagination controls
   - Date range filter
   - Loading skeleton

3. [ ] Create RevenueReport component
   - Estimated effort: 3 hours
   - Dependencies: Phase 6
   - Files affected: `frontend/src/components/payments/RevenueReport.tsx`
   - Time period selector (daily, weekly, monthly)
   - Date range picker
   - Branch filter dropdown
   - Payment method filter dropdown
   - Generate report button
   - Report display (total revenue, breakdown table)
   - Loading states
   - Error handling

4. [ ] Create PaymentMethodBadge component
   - Estimated effort: 30 minutes
   - Dependencies: Phase 6
   - Files affected: `frontend/src/components/payments/PaymentMethodBadge.tsx`
   - Badge with payment method icon/color
   - Accessible labels

5. [ ] Create CorrectionIndicator component
   - Estimated effort: 30 minutes
   - Dependencies: Phase 6
   - Files affected: `frontend/src/components/payments/CorrectionIndicator.tsx`
   - Badge indicating correction status
   - Link to original/corrected payment

**Deliverables:**
- All payment components created
- Components follow design system
- Components are accessible

**Testing:**
- Component unit tests
- Visual regression tests (optional)

**Review Points:**
- Components match design spec
- Components are accessible
- Components handle loading/error states

---

### Phase 8: Frontend Integration

**Goal:** Integrate payment components into existing pages

**Tasks:**
1. [ ] Add payment history to member detail page
   - Estimated effort: 1 hour
   - Dependencies: Phase 7
   - Files affected: `frontend/src/pages/MemberDetailPage.tsx`
   - Add "Payment History" tab
   - Integrate PaymentHistoryTable component
   - Add "Record Payment" button

2. [ ] Add payment recording modal to member detail page
   - Estimated effort: 1 hour
   - Dependencies: Phase 7
   - Files affected: `frontend/src/pages/MemberDetailPage.tsx`
   - Open PaymentForm modal on button click
   - Pre-fill member in form
   - Refresh payment history on success

3. [ ] Create revenue reports page
   - Estimated effort: 1 hour
   - Dependencies: Phase 7
   - Files affected: `frontend/src/pages/RevenuePage.tsx`
   - Create new route `/revenue`
   - Integrate RevenueReport component
   - Add to navigation menu

4. [ ] Add payment correction workflow
   - Estimated effort: 2 hours
   - Dependencies: Phase 7
   - Files affected: `frontend/src/components/payments/PaymentHistoryTable.tsx`, `frontend/src/components/payments/PaymentForm.tsx`
   - Add "Correct Payment" button to payment row
   - Open correction form modal
   - Pre-fill original payment values
   - Show warning if payment >90 days old
   - Handle 409 Conflict error (show refresh message)
   - Handle 429 Rate Limit error (show retry message)

5. [ ] Add React Query integration
   - Estimated effort: 1 hour
   - Dependencies: Phase 6
   - Files affected: `frontend/src/hooks/usePayments.ts`, `frontend/src/hooks/useRevenue.ts`
   - Create usePayments hook
   - Create useCreatePayment hook
   - Create useCorrectPayment hook
   - Create useRevenueReport hook
   - Configure cache invalidation
   - Configure optimistic updates

**Deliverables:**
- Payment features integrated into member detail page
- Revenue reports page created
- Payment correction workflow implemented
- React Query hooks implemented

**Testing:**
- E2E tests for payment recording
- E2E tests for payment correction
- E2E tests for revenue reports
- Test 409 Conflict handling
- Test 429 Rate Limit handling

**Review Points:**
- User flows work correctly
- Error handling is user-friendly
- Loading states are clear
- Cache invalidation works correctly

---

## Dependencies

### External Dependencies
- @nestjs/throttler (for rate limiting)
- No additional external dependencies required

### Internal Dependencies
- Member model and service (for member validation)
- Branch model (for branch association)
- Tenant model (for tenant isolation)
- Authentication infrastructure (JWT guards, tenant guards)
- Existing error handling patterns
- Existing API client patterns
- Existing React Query setup

### Blocking Issues
- None identified

---

## Database Changes

### New Tables/Models

**Payment Model:**
```prisma
model Payment {
  id                 String        @id @default(cuid())
  tenantId           String
  branchId           String
  memberId           String
  
  // Payment details
  amount             Decimal       @db.Decimal(10, 2)
  paymentDate        DateTime      // Date-only (time component ignored)
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
  @@index([tenantId, paymentDate])
  @@index([tenantId, paymentMethod])
  @@index([tenantId, paymentDate, branchId])
  @@index([tenantId, paymentDate, paymentMethod])
  @@index([memberId])
  @@index([branchId])
  @@index([correctedPaymentId])
  @@index([tenantId, isCorrection])
  @@index([tenantId, isCorrected])
}
```

**PaymentMethod Enum:**
```prisma
enum PaymentMethod {
  CASH
  CREDIT_CARD
  BANK_TRANSFER
  CHECK
  OTHER
}
```

**IdempotencyKey Model (for idempotency support):**
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

### Schema Modifications
- No modifications to existing models
- Additive changes only (backward compatible)

### Migrations

**Migration: Add Payment and PaymentMethod**

1. **Create PaymentMethod enum:**
   ```sql
   CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER');
   ```

2. **Create Payment table:**
   ```sql
   CREATE TABLE "Payment" (
     "id" TEXT NOT NULL,
     "tenantId" TEXT NOT NULL,
     "branchId" TEXT NOT NULL,
     "memberId" TEXT NOT NULL,
     "amount" DECIMAL(10,2) NOT NULL,
     "paymentDate" TIMESTAMP(3) NOT NULL,
     "paymentMethod" "PaymentMethod" NOT NULL,
     "note" VARCHAR(500),
     "isCorrection" BOOLEAN NOT NULL DEFAULT false,
     "correctedPaymentId" TEXT,
     "isCorrected" BOOLEAN NOT NULL DEFAULT false,
     "version" INTEGER NOT NULL DEFAULT 0,
     "createdBy" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     PRIMARY KEY ("id")
   );
   ```

3. **Add foreign key constraints:**
   ```sql
   ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" 
     FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" 
     FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   ALTER TABLE "Payment" ADD CONSTRAINT "Payment_memberId_fkey" 
     FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   ALTER TABLE "Payment" ADD CONSTRAINT "Payment_correctedPaymentId_fkey" 
     FOREIGN KEY ("correctedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
   ```

4. **Add indexes:**
   ```sql
   CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");
   CREATE INDEX "Payment_tenantId_branchId_idx" ON "Payment"("tenantId", "branchId");
   CREATE INDEX "Payment_tenantId_memberId_idx" ON "Payment"("tenantId", "memberId");
   CREATE INDEX "Payment_tenantId_paymentDate_idx" ON "Payment"("tenantId", "paymentDate");
   CREATE INDEX "Payment_tenantId_paymentMethod_idx" ON "Payment"("tenantId", "paymentMethod");
   CREATE INDEX "Payment_tenantId_paymentDate_branchId_idx" ON "Payment"("tenantId", "paymentDate", "branchId");
   CREATE INDEX "Payment_tenantId_paymentDate_paymentMethod_idx" ON "Payment"("tenantId", "paymentDate", "paymentMethod");
   CREATE INDEX "Payment_memberId_idx" ON "Payment"("memberId");
   CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");
   CREATE INDEX "Payment_correctedPaymentId_idx" ON "Payment"("correctedPaymentId");
   CREATE INDEX "Payment_tenantId_isCorrection_idx" ON "Payment"("tenantId", "isCorrection");
   CREATE INDEX "Payment_tenantId_isCorrected_idx" ON "Payment"("tenantId", "isCorrected");
   ```

5. **Create IdempotencyKey table (optional, for idempotency support):**
   ```sql
   CREATE TABLE "IdempotencyKey" (
     "id" TEXT NOT NULL,
     "key" TEXT NOT NULL UNIQUE,
     "tenantId" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "response" JSONB NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "expiresAt" TIMESTAMP(3) NOT NULL,
     PRIMARY KEY ("id")
   );
   
   CREATE INDEX "IdempotencyKey_key_idx" ON "IdempotencyKey"("key");
   CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
   ```

- **Backward compatible:** Yes (additive changes only)
- **Data migration required:** No
- **Risks:** 
  - Foreign key constraints prevent deleting tenants/branches/members with payments (onDelete: Restrict)
  - Index creation may take time on large databases (but no existing Payment data)

### Index Strategy

Required indexes and rationale:

- `Payment(tenantId)`: Base tenant isolation (critical for all queries)
- `Payment(tenantId, branchId)`: Branch-filtered revenue queries
- `Payment(tenantId, memberId)`: Member payment history queries
- `Payment(tenantId, paymentDate)`: Time-period revenue queries (most important for reports)
- `Payment(tenantId, paymentMethod)`: Payment method filtering
- `Payment(tenantId, paymentDate, branchId)`: Branch-filtered revenue by date (composite for common query pattern)
- `Payment(tenantId, paymentDate, paymentMethod)`: Payment method filtered revenue by date (composite for common query pattern)
- `Payment(memberId)`: Member payment history (without tenant filter for performance)
- `Payment(branchId)`: Branch payment queries
- `Payment(correctedPaymentId)`: Correction relationship queries
- `Payment(tenantId, isCorrection)`: Filtering corrected payments
- `Payment(tenantId, isCorrected)`: Filtering payments that have been corrected

---

## API Changes

### New Endpoints

**POST /api/v1/payments**
- Create a new payment
- Request: CreatePaymentRequest
- Response: PaymentResponse (201 Created)
- Errors: 400 (validation), 401 (unauthorized), 403 (member from different tenant), 429 (rate limit)

**GET /api/v1/payments**
- List payments with filtering and pagination
- Query params: memberId?, branchId?, paymentMethod?, startDate?, endDate?, includeCorrections?, page?, limit?
- Response: PaymentListResponse (200 OK)
- Errors: 400 (invalid params), 401 (unauthorized)

**GET /api/v1/payments/:id**
- Get a single payment by ID
- Response: PaymentResponse (200 OK)
- Errors: 401 (unauthorized), 403 (payment from different tenant), 404 (not found)

**GET /api/v1/members/:memberId/payments**
- Get all payments for a specific member
- Query params: startDate?, endDate?, page?, limit?
- Response: PaymentListResponse (200 OK)
- Errors: 401 (unauthorized), 403 (member from different tenant), 404 (member not found)

**POST /api/v1/payments/:id/correct**
- Correct a payment
- Request: CorrectPaymentRequest (includes version for optimistic locking)
- Response: CorrectPaymentResponse (201 Created, includes warning if payment >90 days old)
- Errors: 400 (validation, already corrected), 401 (unauthorized), 403 (payment from different tenant), 404 (not found), 409 (version conflict), 429 (rate limit)

**GET /api/v1/revenue**
- Get revenue report aggregated by time period
- Query params: startDate (required), endDate (required), branchId?, paymentMethod?, groupBy?
- Response: RevenueReportResponse (200 OK)
- Errors: 400 (invalid params), 401 (unauthorized)

### Modified Endpoints
- None (all new endpoints)

### Contract Updates

**New Types:**
- PaymentMethod enum
- Payment interface
- CreatePaymentRequest interface
- CorrectPaymentRequest interface
- PaymentListQuery interface
- RevenueReportQuery interface
- PaymentResponse interface
- PaymentListResponse interface
- RevenueReportResponse interface
- CorrectPaymentResponse interface (includes warning field)

**Shared Contracts:**
- Types should be defined in shared types package or frontend types folder
- Backend DTOs should match frontend types

---

## Frontend Changes

### New Components

**PaymentForm:**
- Reusable form for recording and correcting payments
- Props: memberId (optional, pre-filled), initialValues (for corrections), onSubmit, onCancel
- Features: member selector, amount input, date picker, payment method dropdown, note textarea, validation, loading states

**PaymentHistoryTable:**
- Table component for displaying payment history
- Props: memberId (optional), filters, pagination
- Features: columns (date, amount, payment method, note, status, actions), correction indicator, pagination, date range filter, loading skeleton

**RevenueReport:**
- Component for displaying revenue reports with filters
- Props: None (manages own state)
- Features: time period selector, date range picker, branch filter, payment method filter, report display (total, breakdown table), loading states

**PaymentMethodBadge:**
- Badge component for displaying payment method with icon
- Props: paymentMethod
- Features: color-coded badges, icons, accessible labels

**CorrectionIndicator:**
- Component for showing correction status on payments
- Props: isCorrected, isCorrection, correctedPaymentId, originalPaymentId
- Features: badge indicating correction status, link to original/corrected payment

### Modified Components

**MemberDetailPage:**
- Add "Payment History" tab
- Add "Record Payment" button
- Integrate PaymentHistoryTable component
- Integrate PaymentForm modal

### New Routes

**/revenue:**
- Revenue reports page
- Integrates RevenueReport component
- Add to navigation menu

### State Management

**React Query Hooks:**
- `usePayments`: List payments with filters
- `useCreatePayment`: Create payment mutation
- `useCorrectPayment`: Correct payment mutation
- `useRevenueReport`: Revenue report query
- `useMemberPayments`: Member payment history query

**Cache Strategy:**
- Payment list cached with tenant-scoped cache key
- Payment history cached per member with cache invalidation on new payment
- Revenue reports cached with cache key based on filters (date range, branch, payment method)
- Cache invalidation: Invalidate payment list cache when new payment created or corrected

**Optimistic Updates:**
- When recording payment, optimistically add to payment list
- If API call fails, rollback optimistic update and show error
- When correcting payment, optimistically update payment history
- Revenue reports can use optimistic updates but should refetch after payment changes

---

## Testing Strategy

### Unit Tests

**PaymentService:**
- `createPayment()` validates member belongs to tenant
- `createPayment()` validates amount is positive
- `createPayment()` validates payment date is not in future
- `createPayment()` sets branch from member's branch automatically
- `createPayment()` sets tenant from authenticated user
- `correctPayment()` validates original payment belongs to tenant
- `correctPayment()` validates original payment is not already corrected
- `correctPayment()` validates version matches (optimistic locking)
- `correctPayment()` throws conflict error when version mismatch detected
- `correctPayment()` creates new payment record with corrected values
- `correctPayment()` links new payment to original payment
- `correctPayment()` marks original payment as corrected and increments version
- `getRevenueReport()` excludes corrected original payments
- `getRevenueReport()` includes corrected payment amounts
- `getRevenueReport()` filters by tenant automatically
- `getRevenueReport()` filters by branch when provided
- `getRevenueReport()` filters by payment method when provided

**Payment Validation:**
- Amount validation: rejects negative amounts
- Amount validation: rejects zero amounts
- Amount validation: accepts positive amounts with 2 decimal places
- Payment date validation: rejects future dates
- Payment date validation: accepts past dates
- Payment date validation: accepts today's date
- Payment method validation: rejects invalid enum values
- Payment method validation: accepts all valid enum values
- Note validation: accepts null or empty string
- Note validation: rejects notes longer than 500 characters

### Integration Tests

**API Endpoints:**
- POST /api/v1/payments creates payment successfully
- POST /api/v1/payments returns 400 for invalid amount
- POST /api/v1/payments returns 400 for future date
- POST /api/v1/payments returns 403 for member from different tenant
- POST /api/v1/payments returns 429 when rate limit exceeded
- GET /api/v1/payments returns only payments from authenticated user's tenant
- GET /api/v1/payments filters by memberId correctly
- GET /api/v1/payments filters by branchId correctly
- GET /api/v1/payments filters by paymentMethod correctly
- GET /api/v1/payments filters by date range correctly
- GET /api/v1/members/:memberId/payments returns payment history for member
- GET /api/v1/members/:memberId/payments returns 403 for member from different tenant
- POST /api/v1/payments/:id/correct creates correction successfully
- POST /api/v1/payments/:id/correct returns 400 for already corrected payment
- POST /api/v1/payments/:id/correct returns 403 for payment from different tenant
- POST /api/v1/payments/:id/correct returns 409 for version mismatch (concurrent correction attempt)
- POST /api/v1/payments/:id/correct includes warning in response for payments older than 90 days
- POST /api/v1/payments/:id/correct returns 429 when rate limit exceeded
- GET /api/v1/revenue calculates total revenue correctly
- GET /api/v1/revenue excludes corrected original payments
- GET /api/v1/revenue includes corrected payment amounts
- GET /api/v1/revenue filters by branch correctly
- GET /api/v1/revenue filters by payment method correctly
- GET /api/v1/revenue groups by day correctly
- GET /api/v1/revenue groups by week correctly
- GET /api/v1/revenue groups by month correctly

**Tenant Isolation:**
- Tenant A cannot see Tenant B's payments
- Tenant A cannot record payment for Tenant B's member
- Tenant A cannot correct Tenant B's payment
- Tenant A's revenue report only includes Tenant A's payments
- Cross-tenant payment queries return empty results

**Logging & Observability:**
- Payment creation logs structured event (excludes amount and note)
- Payment correction logs structured event (excludes amount and note)
- Logged events include: event type, payment ID, member ID, tenant ID, branch ID, payment method, user ID, timestamp
- Logged events exclude: payment amounts, payment notes, PII
- Error logs exclude sensitive payment data

### Edge Cases

- Payment with amount exactly 0.01 (minimum positive amount)
- Payment with very large amount (999999.99)
- Payment recorded on same day as today (edge case for date validation)
- Payment recorded many years in the past (backdated payment)
- Payment correction where all fields are changed
- Payment correction where only note is changed
- Revenue report with no payments in date range (returns zero revenue)
- Revenue report with date range spanning multiple years
- Payment history for member with no payments (empty list)
- Payment history for member with 100+ payments (pagination)
- Concurrent payment corrections (two admins correcting same payment simultaneously) - Optimistic locking prevents conflicts, second correction returns 409 Conflict
- Payment correction for payment older than 90 days (warning displayed but correction allowed)
- Payment recorded for archived member (allowed, supports backdated payments)
- Payment recorded for archived branch (allowed, historical accuracy)
- Revenue report with branch filter for branch with no payments
- Revenue report with payment method filter that has no payments

---

## Rollout Strategy

### Feature Flags
- Not required (backward compatible changes)
- Can add feature flag if needed for gradual rollout

### Deployment Plan

1. **Backend deployment:**
   - Deploy updated backend code
   - Run migration (creates Payment table, preserves existing data)
   - Verify migration success
   - Monitor for errors

2. **Frontend deployment:**
   - Deploy updated frontend code
   - Verify payment features work correctly
   - Monitor for errors

3. **Rollback plan:**
   - If issues occur, rollback backend code
   - Migration can be reversed (drop Payment table)
   - Existing functionality remains intact

### Monitoring

**Key Metrics:**
- Payment creation rate (payments per day)
- Payment correction rate (corrections per day)
- Revenue report generation rate
- API response times for payment endpoints
- Rate limit hit rate (429 responses)

**Error Rates:**
- 400 Validation errors (should be low)
- 409 Conflict errors (should be low, indicates concurrent corrections)
- 429 Rate limit errors (should be low, indicates abuse or high usage)
- 500 Server errors (should be zero)

**Performance Indicators:**
- Payment list query time (<100ms for 20 items)
- Member payment history query time (<50ms for 50 payments)
- Revenue report generation time (<500ms for monthly report with 1000 payments)
- Payment creation time (<50ms including validation and database write)

---

## Documentation Updates

### Code Documentation

- [ ] Inline comments for complex logic
  - Optimistic locking implementation
  - Revenue calculation logic (excluding corrected originals)
  - Payment correction workflow
  - Tenant isolation validation
- [ ] JSDoc/TSDoc for public APIs
  - All service methods with parameter descriptions
  - DTOs with field descriptions and validation rules
  - API controllers with endpoint documentation
  - React hooks with usage examples

### External Documentation

- [ ] Update API documentation (OpenAPI spec)
- [ ] Update README with payment tracking features
- [ ] Document payment correction workflow
- [ ] Document revenue calculation rules

### Specification Updates

- [ ] Verify spec.md matches implementation
- [ ] Document any deviations from spec
- [ ] Document any deferred enhancements

---

## Risk Assessment

### Technical Risks

**Risk 1: Optimistic locking implementation complexity**
- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:** 
  - Use well-documented pattern (version field with explicit check)
  - Comprehensive unit tests for conflict scenarios
  - Clear error messages for 409 responses

**Risk 2: Revenue calculation performance with large datasets**
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:**
  - Use database aggregation (GROUP BY) instead of application-level grouping
  - Proper indexes on date and tenant fields
  - Pagination for large date ranges
  - Consider materialized views for monthly summaries (future enhancement)

**Risk 3: Concurrent payment corrections causing conflicts**
- **Likelihood:** Low
- **Impact:** Low
- **Mitigation:**
  - Optimistic locking prevents conflicts
  - Clear error messages guide users to refresh and retry
  - UI handles 409 errors gracefully

**Risk 4: Rate limiting false positives**
- **Likelihood:** Low
- **Impact:** Low
- **Mitigation:**
  - Rate limits set appropriately (100 requests per 15 minutes)
  - Clear error messages guide users
  - Monitoring for rate limit hit rate

### Security Risks

**Risk 1: Payment amounts logged in application logs**
- **Mitigation:** Structured logging explicitly excludes amounts and notes. Only metadata logged.

**Risk 2: Cross-tenant payment access**
- **Mitigation:** All queries filter by tenantId. Service layer validates member belongs to tenant. Authorization guards enforce tenant isolation.

**Risk 3: Payment correction without authorization**
- **Mitigation:** Authorization guards require ADMIN role. Service layer validates payment belongs to tenant.

### Performance Risks

**Risk 1: Slow payment list queries with many payments**
- **Mitigation:** Proper indexes on tenantId, date, branchId. Pagination limits result size.

**Risk 2: Slow revenue report generation**
- **Mitigation:** Database aggregation (GROUP BY). Proper indexes on date and tenant fields. Consider caching for common date ranges.

---

## Success Criteria

How will we know this feature is successfully implemented?

- [ ] All acceptance criteria from spec met
- [ ] All tests passing (unit + integration + E2E)
- [ ] No critical security issues
- [ ] Performance requirements met (<100ms payment list, <50ms payment history, <500ms revenue report)
- [ ] Code review approved
- [ ] Documentation complete
- [ ] Migration tested and successful
- [ ] Optimistic locking prevents concurrent conflicts
- [ ] Rate limiting works correctly
- [ ] Idempotency works correctly
- [ ] Structured logging excludes sensitive data
- [ ] Tenant isolation enforced at all layers

---

## Post-Implementation Review

After completion, reflect on:

### What Went Well
- 

### What Could Be Improved
- 

### Lessons Learned
- 

### Follow-Up Items
- [ ] Consider materialized views for monthly revenue summaries (performance optimization)
- [ ] Consider payment export to CSV feature (user request)
- [ ] Consider payment reconciliation with bank statements (future enhancement)
- [ ] Consider payment provider integration (Stripe, PayPal) (future enhancement)

---

**End of Plan**
