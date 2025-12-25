# Tasks: Collections & Revenue Tracking

**Feature:** 007-revenue-tracking  
**Generated:** 2025-12-18  
**Based on:** plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

---

## Overview

This document contains the complete task list for implementing Collections & Revenue Tracking feature. Tasks are organized by implementation phase and must be completed sequentially unless marked as parallelizable `[P]`.

**Total Tasks:** 130  
**Estimated Effort:** 11-14 person-days

---

## Pre-Implementation: Artifact Consistency Verification

**Goal:** Ensure all artifacts use `paidOn` consistently before implementation  
**Dependencies:** None  
**Blockers:** None

### Tasks

- [ ] T000 Verify all artifacts (spec.md, data-model.md, tasks.md, contracts) use `paidOn` consistently; update any drift

**Done when:** `grep -R "paymentDate" specs/007-revenue-tracking/ || true` returns no matches (ensures no drift back to paymentDate naming)

---

## Phase 1: Database Schema & Migration

**Goal:** Create Payment model, PaymentMethod enum, IdempotencyKey model, and migration  
**Dependencies:** None  
**Blockers:** None

### Tasks

- [X] T001 Add `PaymentMethod` enum to Prisma schema in `backend/prisma/schema.prisma`
- [X] T002 Add `Payment` model with all fields including `paidOn` (DATE-only semantics) in `backend/prisma/schema.prisma`
- [X] T003 Add `version` field to Payment model for optimistic locking in `backend/prisma/schema.prisma`
- [X] T004 Add `isCorrected` and `isCorrection` fields to Payment model in `backend/prisma/schema.prisma`
- [X] T005 Add all Payment indexes (tenantId, branchId, memberId, paidOn, paymentMethod, etc.) in `backend/prisma/schema.prisma`
- [X] T006 Add Payment relations to Tenant, Branch, and Member models in `backend/prisma/schema.prisma`
- [X] T007 Add self-referential Payment correction relation in `backend/prisma/schema.prisma`
- [X] T008 Add `IdempotencyKey` model with TTL support in `backend/prisma/schema.prisma`
- [X] T009 Generate Prisma migration in `backend/prisma/migrations/`
- [X] T010 Test migration on development database
- [X] T011 Verify rollback procedure works correctly

**Acceptance Criteria:**

- Prisma schema includes `PaymentMethod` enum with values: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER
- Payment model includes all fields: id, tenantId, branchId, memberId, amount, `paidOn` (DateTime), paymentMethod, note, isCorrection, correctedPaymentId, isCorrected, version, createdBy, createdAt, updatedAt
- `paidOn` field represents DATE-ONLY business date (stored as start-of-day UTC DateTime)
- All indexes created: tenantId, tenantId+branchId, tenantId+memberId, tenantId+paidOn, tenantId+paymentMethod, tenantId+paidOn+branchId, tenantId+paidOn+paymentMethod, memberId, branchId, correctedPaymentId, tenantId+isCorrection, tenantId+isCorrected
- Foreign key constraints created: tenant (CASCADE), branch (RESTRICT), member (RESTRICT), correctedPayment (SET NULL)
- IdempotencyKey model includes: id, key (unique), tenantId, userId, response (Json), createdAt, expiresAt
- Migration runs successfully on clean database and database with existing data
- Rollback tested and documented

---

## Phase 2: Backend Service Layer - Core Domain Logic

**Goal:** Implement PaymentService with business logic, validation, and revenue calculation  
**Dependencies:** Phase 1  
**Blockers:** T001-T011 must be complete

### Tasks

- [X] T012 Create `PaymentService` class in `backend/src/payments/payments.service.ts`
- [X] T013 Implement `createPayment()` method with member validation in `backend/src/payments/payments.service.ts`
- [X] T014 Implement `paidOn` date validation (not future, DATE-only semantics) in `backend/src/payments/payments.service.ts`
- [X] T015 Implement `paidOn` date truncation (start-of-day UTC) in `backend/src/payments/payments.service.ts`
- [X] T016 Implement amount validation (positive, max 999999.99, 2 decimal places) in `backend/src/payments/payments.service.ts`
- [X] T017 Implement tenant timezone handling for date validation in `backend/src/payments/payments.service.ts`
- [X] T018 Implement `correctPayment()` method with optimistic locking in `backend/src/payments/payments.service.ts`
- [X] T019 Implement single-correction rule enforcement (hard-fail if `isCorrected = true`) in `backend/src/payments/payments.service.ts`
- [X] T020 Implement version check and conflict detection in `correctPayment()` in `backend/src/payments/payments.service.ts`
- [X] T021 Implement atomic correction transaction (create corrected payment + update original) in `backend/src/payments/payments.service.ts`
- [X] T022 Implement `getPaymentById()` with tenant validation in `backend/src/payments/payments.service.ts`
- [X] T023 Implement `listPayments()` with filtering and pagination in `backend/src/payments/payments.service.ts`
- [X] T024 Implement `getMemberPayments()` method in `backend/src/payments/payments.service.ts`
- [X] T025 Implement `getRevenueReport()` with corrected originals exclusion in `backend/src/payments/payments.service.ts`
- [X] T026 Implement revenue aggregation using database GROUP BY in `backend/src/payments/payments.service.ts`
- [X] T027 Implement tenant timezone handling for revenue date range queries in `backend/src/payments/payments.service.ts`

**Acceptance Criteria:**

- `createPayment()` validates member belongs to tenant
- `createPayment()` validates amount is positive (0.01 minimum)
- `createPayment()` validates `paidOn` date is not in future (using tenant timezone)
- `createPayment()` truncates `paidOn` to start-of-day UTC before storing
- `createPayment()` sets branchId from member's branch automatically
- `correctPayment()` validates original payment belongs to tenant
- `correctPayment()` hard-fails with BadRequestException if `isCorrected = true` (single-correction rule)
- `correctPayment()` validates version matches expected value
- `correctPayment()` throws ConflictException on version mismatch
- `correctPayment()` creates new payment record with corrected values
- `correctPayment()` marks original payment as corrected and increments version atomically
- `getRevenueReport()` excludes corrected original payments (isCorrection=false AND isCorrected=true)
- `getRevenueReport()` includes corrected payment amounts (isCorrection=true)
- `getRevenueReport()` filters by tenant automatically
- `getRevenueReport()` uses database GROUP BY for period breakdown
- All date operations use tenant timezone for validation and display

---

## Phase 3: Backend Service Layer - Observability (Logging)

**Goal:** Implement structured event logging excluding sensitive data  
**Dependencies:** Phase 2  
**Blockers:** T012-T027 must be complete

### Tasks

- [X] T028 Add structured logging to `createPayment()` (exclude amount and note) in `backend/src/payments/payments.service.ts`
- [X] T029 Add structured logging to `correctPayment()` (exclude amount and note) in `backend/src/payments/payments.service.ts`
- [X] T030 Implement correlation ID generation/retrieval in `backend/src/payments/payments.service.ts`
- [X] T031 Log payment.created event with metadata (tenantId, branchId, paymentId, memberId, paymentMethod, actorUserId, result, correlationId) in `backend/src/payments/payments.service.ts`
- [X] T032 Log payment.corrected event with metadata (exclude amounts/notes) in `backend/src/payments/payments.service.ts`
- [X] T033 Verify logs exclude payment amounts in `backend/src/payments/payments.service.ts`
- [X] T034 Verify logs exclude payment notes in `backend/src/payments/payments.service.ts`

**Acceptance Criteria:**

- Payment creation logs structured JSON event: `payment.created`
- Payment correction logs structured JSON event: `payment.corrected`
- Logged events include: event type, paymentId, tenantId, branchId, memberId, paymentMethod, paidOn, actorUserId, result, correlationId, timestamp
- Logged events explicitly exclude: payment amounts, payment notes, PII
- Log format is JSON for parsing and searchability
- Correlation ID included for request tracing

---

## Phase 4: Backend DTOs & Validation

**Goal:** Create DTOs with validation decorators using `paidOn` naming  
**Dependencies:** Phase 2  
**Blockers:** T012-T027 must be complete

### Tasks

- [X] T035 Create `CreatePaymentDto` with `paidOn` field (not paymentDate) in `backend/src/payments/dto/create-payment.dto.ts`
- [X] T036 Add validation decorators to `CreatePaymentDto` (IsString, IsPositive, IsDateString, IsEnum, MaxLength) in `backend/src/payments/dto/create-payment.dto.ts`
- [X] T037 Add custom validation for `paidOn` date (not future) in `backend/src/payments/dto/create-payment.dto.ts`
- [X] T038 Create `CorrectPaymentDto` with `paidOn` field and version field in `backend/src/payments/dto/correct-payment.dto.ts`
- [X] T039 Add validation decorators to `CorrectPaymentDto` in `backend/src/payments/dto/correct-payment.dto.ts`
- [X] T040 Create `PaymentListQueryDto` with filtering options in `backend/src/payments/dto/payment-list-query.dto.ts`
- [X] T041 Create `RevenueReportQueryDto` with date range and filters in `backend/src/payments/dto/revenue-report-query.dto.ts`
- [X] T042 Create `PaymentResponseDto` mapping Prisma Payment to response in `backend/src/payments/dto/payment-response.dto.ts`
- [X] T043 Ensure all DTOs use `paidOn` naming consistently (not paymentDate) in `backend/src/payments/dto/`

**Acceptance Criteria:**

- `CreatePaymentDto` includes: memberId, amount, `paidOn` (not paymentDate), paymentMethod, note
- `CreatePaymentDto` validates amount is positive, `paidOn` is date string, paymentMethod is enum
- `CorrectPaymentDto` includes: optional amount, `paidOn`, paymentMethod, note, correctionReason, required version
- `PaymentListQueryDto` includes: optional memberId, branchId, paymentMethod, startDate, endDate, includeCorrections, page, limit
- `RevenueReportQueryDto` includes: required startDate, endDate, optional branchId, paymentMethod, groupBy
- `PaymentResponseDto` maps Prisma Payment to response format with `paidOn` field
- All DTOs use `paidOn` naming consistently (not paymentDate)
- Validation decorators applied correctly
- Error messages are clear and helpful

---

## Phase 5: Backend Controller & API Endpoints

**Goal:** Create REST API endpoints with rate limiting and idempotency  
**Dependencies:** Phase 3, Phase 4  
**Blockers:** T028-T043 must be complete

### Tasks

- [X] T044 Create `PaymentsController` class in `backend/src/payments/payments.controller.ts`
- [X] T045 Implement POST /api/v1/payments endpoint in `backend/src/payments/payments.controller.ts`
- [X] T046 Implement GET /api/v1/payments endpoint with filtering in `backend/src/payments/payments.controller.ts`
- [X] T047 Implement GET /api/v1/payments/:id endpoint in `backend/src/payments/payments.controller.ts`
- [X] T048 Implement GET /api/v1/members/:memberId/payments endpoint in `backend/src/payments/payments.controller.ts`
- [X] T049 Implement POST /api/v1/payments/:id/correct endpoint in `backend/src/payments/payments.controller.ts`
- [X] T050 Implement GET /api/v1/revenue endpoint in `backend/src/payments/payments.controller.ts`
- [X] T051 Add authorization guards (@UseGuards(JwtAuthGuard, RolesGuard)) to all endpoints in `backend/src/payments/payments.controller.ts`
- [X] T052 Add error handling for 400 Validation errors in `backend/src/payments/payments.controller.ts`
- [X] T053 Add error handling for 403 Forbidden (tenant violations) in `backend/src/payments/payments.controller.ts`
- [X] T054 Add error handling for 404 Not Found in `backend/src/payments/payments.controller.ts`
- [X] T055 Add error handling for 409 Conflict (version mismatch) in `backend/src/payments/payments.controller.ts`
- [X] T056 Add error handling for 400 BadRequest (already corrected payment) in `backend/src/payments/payments.controller.ts`

**Acceptance Criteria:**

- All endpoints require ADMIN role
- POST /api/v1/payments creates payment and returns 201 Created
- GET /api/v1/payments returns paginated payment list filtered by tenant
- GET /api/v1/payments/:id returns single payment with tenant validation
- GET /api/v1/members/:memberId/payments returns member payment history
- POST /api/v1/payments/:id/correct creates correction and returns 201 Created
- GET /api/v1/revenue returns revenue report with aggregation
- 400 errors return clear validation messages
- 403 errors return tenant violation messages
- 404 errors return not found messages
- 409 errors return conflict messages for version mismatch
- 400 errors return "already corrected" message for single-correction rule violation

---

## Phase 6: Backend Security - Rate Limiting

**Goal:** Implement rate limiting for payment endpoints  
**Dependencies:** Phase 5  
**Blockers:** T044-T056 must be complete

### Tasks

- [X] T057 Install `@nestjs/throttler` package
- [X] T058 Configure ThrottlerModule in `backend/src/app.module.ts`
- [X] T059 Apply @Throttle decorator to POST /api/v1/payments (100 requests per 15 minutes per user) in `backend/src/payments/payments.controller.ts`
- [X] T060 Apply @Throttle decorator to POST /api/v1/payments/:id/correct (30-50 requests per 15 minutes per user) in `backend/src/payments/payments.controller.ts`
- [X] T061 Add error handling for 429 Too Many Requests in `backend/src/payments/payments.controller.ts`
- [X] T062 Add rate limit hit logging in `backend/src/payments/payments.controller.ts`
- [X] T063 Configure per-user rate limiting (not per-IP) in `backend/src/app.module.ts`

**Acceptance Criteria:**

- @nestjs/throttler installed and configured
- ThrottlerModule configured with per-user tracking
- POST /api/v1/payments rate limited to 100 requests per 15 minutes per user
- POST /api/v1/payments/:id/correct rate limited to 30-50 requests per 15 minutes per user (stricter than creation)
- 429 errors return clear rate limit messages with retry guidance
- Rate limit hits logged for monitoring
- Rate limiting tracks by user ID (not IP address)

---

## Phase 7: Backend Security - Idempotency

**Goal:** Implement idempotency for payment creation  
**Dependencies:** Phase 5  
**Blockers:** T044-T056 must be complete

### Tasks

- [X] T064 Implement idempotency key extraction from request header in `backend/src/payments/payments.controller.ts`
- [X] T065 Implement idempotency key check in `createPayment()` method in `backend/src/payments/payments.service.ts`
- [X] T066 Implement cached response return if idempotency key exists in `backend/src/payments/payments.service.ts`
- [X] T067 Implement idempotency key storage with TTL (24 hours) in `backend/src/payments/payments.service.ts`
- [X] T068 Handle race conditions in idempotency key creation in `backend/src/payments/payments.service.ts`
- [X] T069 Verify idempotency returns same response on retries in `backend/src/payments/payments.service.ts`

**Acceptance Criteria:**

- Idempotency key extracted from `Idempotency-Key` header
- If key exists and not expired, return cached response immediately
- If key doesn't exist, create payment and store key with response
- Idempotency keys expire after 24 hours
- Race conditions handled gracefully (unique constraint prevents duplicates)
- Same idempotency key returns same response (idempotent behavior)
- Idempotency keys stored in IdempotencyKey table

---

## Phase 8: Backend Testing - Unit Tests

**Goal:** Comprehensive unit test coverage for PaymentService  
**Dependencies:** Phase 2, Phase 3  
**Blockers:** T012-T034 must be complete

### Tasks

- [ ] T070 Create unit test file for `PaymentService` in `backend/src/payments/payments.service.spec.ts`
- [ ] T071 Test `createPayment()` validates member belongs to tenant in `backend/src/payments/payments.service.spec.ts`
- [ ] T072 Test `createPayment()` validates amount is positive in `backend/src/payments/payments.service.spec.ts`
- [ ] T073 Test `createPayment()` validates `paidOn` date is not in future in `backend/src/payments/payments.service.spec.ts`
- [ ] T074 Test `createPayment()` truncates `paidOn` to start-of-day UTC in `backend/src/payments/payments.service.spec.ts`
- [ ] T075 Test `createPayment()` sets branchId from member's branch in `backend/src/payments/payments.service.spec.ts`
- [ ] T076 Test `correctPayment()` validates original payment belongs to tenant in `backend/src/payments/payments.service.spec.ts`
- [ ] T077 Test `correctPayment()` hard-fails if payment is already corrected (`isCorrected = true`) in `backend/src/payments/payments.service.spec.ts`
- [ ] T078 Test `correctPayment()` validates version matches (optimistic locking) in `backend/src/payments/payments.service.spec.ts`
- [ ] T079 Test `correctPayment()` throws ConflictException on version mismatch in `backend/src/payments/payments.service.spec.ts`
- [ ] T080 Test `correctPayment()` creates new payment record with corrected values in `backend/src/payments/payments.service.spec.ts`
- [ ] T081 Test `correctPayment()` marks original payment as corrected and increments version in `backend/src/payments/payments.service.spec.ts`
- [ ] T082 Test `getRevenueReport()` excludes corrected original payments in `backend/src/payments/payments.service.spec.ts`
- [ ] T083 Test `getRevenueReport()` includes corrected payment amounts in `backend/src/payments/payments.service.spec.ts`
- [ ] T084 Test `getRevenueReport()` filters by tenant automatically in `backend/src/payments/payments.service.spec.ts`
- [ ] T085 Test structured logging excludes amounts and notes in `backend/src/payments/payments.service.spec.ts`

**Acceptance Criteria:**

- Unit tests cover all PaymentService methods
- Tests verify validation logic (amount, date, member, tenant)
- Tests verify optimistic locking (version check, conflict detection)
- Tests verify single-correction rule (hard-fail if isCorrected=true)
- Tests verify revenue calculation (excludes corrected originals, includes corrected amounts)
- Tests verify tenant isolation
- Tests verify structured logging excludes sensitive data
- Test coverage >90% for PaymentService

---

## Phase 9: Backend Testing - Integration Tests

**Goal:** Comprehensive integration test coverage for API endpoints  
**Dependencies:** Phase 5, Phase 6, Phase 7  
**Blockers:** T044-T069 must be complete

### Tasks

- [ ] T086 Create integration test file for payments API in `backend/test/payments.e2e-spec.ts`
- [ ] T087 Test POST /api/v1/payments creates payment successfully in `backend/test/payments.e2e-spec.ts`
- [ ] T088 Test POST /api/v1/payments returns 400 for invalid amount in `backend/test/payments.e2e-spec.ts`
- [ ] T089 Test POST /api/v1/payments returns 400 for future `paidOn` date in `backend/test/payments.e2e-spec.ts`
- [ ] T090 Test POST /api/v1/payments returns 403 for member from different tenant in `backend/test/payments.e2e-spec.ts`
- [ ] T091 Test GET /api/v1/payments returns only payments from authenticated user's tenant in `backend/test/payments.e2e-spec.ts`
- [ ] T092 Test GET /api/v1/payments filters by memberId correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T093 Test GET /api/v1/payments filters by branchId correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T094 Test GET /api/v1/payments filters by paymentMethod correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T095 Test GET /api/v1/payments filters by date range correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T096 Test GET /api/v1/members/:memberId/payments returns payment history for member in `backend/test/payments.e2e-spec.ts`
- [ ] T097 Test GET /api/v1/members/:memberId/payments returns 403 for member from different tenant in `backend/test/payments.e2e-spec.ts`
- [ ] T098 Test POST /api/v1/payments/:id/correct creates correction successfully in `backend/test/payments.e2e-spec.ts`
- [ ] T099 Test POST /api/v1/payments/:id/correct returns 400 for already corrected payment (single-correction rule) in `backend/test/payments.e2e-spec.ts`
- [ ] T100 Test POST /api/v1/payments/:id/correct returns 403 for payment from different tenant in `backend/test/payments.e2e-spec.ts`
- [ ] T101 Test POST /api/v1/payments/:id/correct returns 409 for version mismatch (concurrent correction attempt) in `backend/test/payments.e2e-spec.ts`
- [ ] T102 Test POST /api/v1/payments/:id/correct includes warning in response for payments older than 90 days in `backend/test/payments.e2e-spec.ts`
- [ ] T103 Test POST /api/v1/payments returns 429 when rate limit exceeded in `backend/test/payments.e2e-spec.ts`
- [ ] T104 Test POST /api/v1/payments/:id/correct returns 429 when rate limit exceeded in `backend/test/payments.e2e-spec.ts`
- [ ] T105 Test POST /api/v1/payments returns cached response on idempotency key retry in `backend/test/payments.e2e-spec.ts`
- [ ] T106 Test GET /api/v1/revenue calculates total revenue correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T107 Test GET /api/v1/revenue excludes corrected original payments in `backend/test/payments.e2e-spec.ts`
- [ ] T108 Test GET /api/v1/revenue includes corrected payment amounts in `backend/test/payments.e2e-spec.ts`
- [ ] T109 Test GET /api/v1/revenue filters by branch correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T110 Test GET /api/v1/revenue filters by payment method correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T111 Test GET /api/v1/revenue groups by day correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T112 Test GET /api/v1/revenue groups by week correctly in `backend/test/payments.e2e-spec.ts`
- [ ] T113 Test GET /api/v1/revenue groups by month correctly in `backend/test/payments.e2e-spec.ts`

**Acceptance Criteria:**

- Integration tests cover all API endpoints
- Tests verify happy paths (successful operations)
- Tests verify validation errors (400)
- Tests verify authorization errors (403)
- Tests verify not found errors (404)
- Tests verify conflict errors (409 for version mismatch)
- Tests verify single-correction rule (400 for already corrected)
- Tests verify rate limiting (429)
- Tests verify idempotency (cached responses)
- Tests verify tenant isolation
- Tests verify revenue calculation logic
- All tests passing

---

## Phase 10: Frontend Types & API Client

**Goal:** Create TypeScript types and API client methods using `paidOn` naming  
**Dependencies:** Phase 5  
**Blockers:** T044-T056 must be complete

### Tasks

- [ ] T114 Add Payment types to shared types in `frontend/src/types/payment.ts`
- [ ] T115 Ensure Payment interface uses `paidOn` field (not paymentDate) in `frontend/src/types/payment.ts`
- [ ] T116 Add PaymentMethod enum to frontend types in `frontend/src/types/payment.ts`
- [ ] T117 Add CreatePaymentRequest interface with `paidOn` field in `frontend/src/types/payment.ts`
- [ ] T118 Add CorrectPaymentRequest interface with version field in `frontend/src/types/payment.ts`
- [ ] T119 Add PaymentListResponse interface in `frontend/src/types/payment.ts`
- [ ] T120 Add RevenueReportResponse interface in `frontend/src/types/payment.ts`
- [ ] T121 Create payment API client methods in `frontend/src/api/payments.ts`
- [ ] T122 Implement createPayment method with error handling in `frontend/src/api/payments.ts`
- [ ] T123 Implement getPayments method in `frontend/src/api/payments.ts`
- [ ] T124 Implement getPaymentById method in `frontend/src/api/payments.ts`
- [ ] T125 Implement getMemberPayments method in `frontend/src/api/payments.ts`
- [ ] T126 Implement correctPayment method with error handling in `frontend/src/api/payments.ts`
- [ ] T127 Implement getRevenueReport method in `frontend/src/api/payments.ts`
- [ ] T128 Add error handling for 409 Conflict in API client in `frontend/src/api/payments.ts`
- [ ] T129 Add error handling for 429 Rate Limit in API client in `frontend/src/api/payments.ts`
- [ ] T130 Add error handling for 400 BadRequest in API client in `frontend/src/api/payments.ts`
- [ ] T131 Add error handling for 403 Forbidden in API client in `frontend/src/api/payments.ts`

**Acceptance Criteria:**

- Payment types match backend contracts
- All types use `paidOn` naming consistently (not paymentDate)
- PaymentMethod enum matches backend enum
- API client methods implemented for all endpoints
- Error handling covers 400, 403, 404, 409, 429 errors
- API client follows existing patterns
- Types are type-safe and match backend DTOs

---

## Phase 11: Frontend Components - Payment Form

**Goal:** Create PaymentForm component with `paidOn` date picker  
**Dependencies:** Phase 10  
**Blockers:** T114-T131 must be complete

### Tasks

- [ ] T132 Create `PaymentForm` component in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T133 Add member selector (searchable dropdown) to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T134 Add amount input (currency formatted) to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T135 Add `paidOn` date picker (date-only, tenant timezone) to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T136 Add payment method dropdown to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T137 Add note textarea (optional, max 500 chars) to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T138 Add form validation to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T139 Add loading states to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T140 Add error handling to PaymentForm in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T141 Ensure PaymentForm uses `paidOn` naming consistently in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T142 Add non-blocking warning banner in PaymentForm when member is archived/inactive or branch is archived in `frontend/src/components/payments/PaymentForm.tsx`

**Acceptance Criteria:**

- PaymentForm component created and functional
- Member selector allows searching and selecting members
- Amount input formats currency correctly
- `paidOn` date picker uses tenant timezone for date selection
- `paidOn` date picker allows past dates (backdated payments)
- Payment method dropdown shows all enum values
- Note textarea limits to 500 characters
- Form validation prevents invalid submissions
- Loading states shown during API calls
- Error messages displayed clearly
- Component uses `paidOn` naming (not paymentDate)
- Verify request payload uses `paidOn` matching backend DTOs
- Warning banner displayed (non-blocking) when member is archived/inactive or branch is archived

---

## Phase 12: Frontend Components - Payment History Table

**Goal:** Create PaymentHistoryTable component with correction indicators  
**Dependencies:** Phase 10  
**Blockers:** T114-T131 must be complete

### Tasks

- [ ] T208 Create `PaymentHistoryTable` component in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T143 Add table columns (date, amount, payment method, note, status, actions) to PaymentHistoryTable in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T144 Add correction indicator badge to PaymentHistoryTable in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T145 Add pagination controls to PaymentHistoryTable in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T146 Add date range filter to PaymentHistoryTable in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T147 Add loading skeleton to PaymentHistoryTable in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T148 Display `paidOn` date using tenant timezone in PaymentHistoryTable in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T149 Ensure PaymentHistoryTable uses `paidOn` naming consistently in `frontend/src/components/payments/PaymentHistoryTable.tsx`

**Acceptance Criteria:**

- PaymentHistoryTable component created and functional
- Table displays all payment columns correctly
- Correction indicator shows when payment is corrected
- Pagination works correctly
- Date range filter filters payments correctly
- Loading skeleton shown while fetching
- Dates displayed using tenant timezone
- Component uses `paidOn` naming (not paymentDate)

---

## Phase 13: Frontend Components - Revenue Report

**Goal:** Create RevenueReport component with filters  
**Dependencies:** Phase 10  
**Blockers:** T114-T131 must be complete

### Tasks

- [ ] T150 Create `RevenueReport` component in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T151 Add time period selector (daily, weekly, monthly) to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T152 Add date range picker to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T153 Add branch filter dropdown to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T154 Add payment method filter dropdown to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T155 Add generate report button to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T156 Add report display (total revenue, breakdown table) to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T157 Add loading states to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`
- [ ] T158 Add error handling to RevenueReport in `frontend/src/components/payments/RevenueReport.tsx`

**Acceptance Criteria:**

- RevenueReport component created and functional
- Time period selector works correctly
- Date range picker uses tenant timezone
- Branch filter filters correctly
- Payment method filter filters correctly
- Report displays total revenue and breakdown
- Loading states shown during API calls
- Error messages displayed clearly

---

## Phase 14: Frontend Components - Helper Components

**Goal:** Create helper components for payment display  
**Dependencies:** Phase 10  
**Blockers:** T114-T131 must be complete

### Tasks

- [ ] T159 Create `PaymentMethodBadge` component in `frontend/src/components/payments/PaymentMethodBadge.tsx`
- [ ] T160 Create `CorrectionIndicator` component in `frontend/src/components/payments/CorrectionIndicator.tsx`
- [ ] T161 Add badge with payment method icon/color to PaymentMethodBadge in `frontend/src/components/payments/PaymentMethodBadge.tsx`
- [ ] T162 Add accessible labels to PaymentMethodBadge in `frontend/src/components/payments/PaymentMethodBadge.tsx`
- [ ] T163 Add badge indicating correction status to CorrectionIndicator in `frontend/src/components/payments/CorrectionIndicator.tsx`
- [ ] T164 Add link to original/corrected payment to CorrectionIndicator in `frontend/src/components/payments/CorrectionIndicator.tsx`

**Acceptance Criteria:**

- PaymentMethodBadge component created and functional
- CorrectionIndicator component created and functional
- Badges display payment methods with icons/colors
- Correction indicators show correction status clearly
- Links to original/corrected payments work correctly
- Components are accessible

---

## Phase 15: Frontend Integration - Member Detail Page

**Goal:** Integrate payment features into member detail page  
**Dependencies:** Phase 11, Phase 12  
**Blockers:** T132-T149 must be complete

### Tasks

- [ ] T165 Add "Payment History" tab to member detail page in `frontend/src/pages/MemberDetailPage.tsx`
- [ ] T166 Integrate PaymentHistoryTable component into member detail page in `frontend/src/pages/MemberDetailPage.tsx`
- [ ] T167 Add "Record Payment" button to member detail page in `frontend/src/pages/MemberDetailPage.tsx`
- [ ] T168 Add payment recording modal to member detail page in `frontend/src/pages/MemberDetailPage.tsx`
- [ ] T169 Pre-fill member in PaymentForm when opened from member detail page in `frontend/src/pages/MemberDetailPage.tsx`
- [ ] T170 Refresh payment history on successful payment creation in `frontend/src/pages/MemberDetailPage.tsx`

**Acceptance Criteria:**

- Payment History tab added to member detail page
- PaymentHistoryTable displays member's payments
- Record Payment button opens PaymentForm modal
- Member pre-filled in form when opened from member detail page
- Payment history refreshes after successful payment creation
- User flow works smoothly

---

## Phase 16: Frontend Integration - Payment Correction Workflow

**Goal:** Implement payment correction workflow with single-correction rule enforcement  
**Dependencies:** Phase 11, Phase 12  
**Blockers:** T132-T149 must be complete

### Tasks

- [ ] T171 Add "Correct Payment" button to payment row (only if `isCorrected = false`) in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T172 Disable or hide "Correct Payment" action when `isCorrected = true` (single-correction rule) in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T173 Open correction form modal on "Correct Payment" click in `frontend/src/components/payments/PaymentHistoryTable.tsx`
- [ ] T174 Pre-fill original payment values in correction form in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T175 Show warning if payment >90 days old in correction form in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T176 Show non-blocking warning if member is archived/inactive or branch is archived in correction form in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T177 Handle 400 BadRequest error for already corrected payment (show appropriate message) in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T178 Handle 409 Conflict error (show refresh message) in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T179 Handle 429 Rate Limit error (show retry message) in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T180 Include version field in correction request in `frontend/src/components/payments/PaymentForm.tsx`
- [ ] T181 Refresh payment data on 409 conflict in `frontend/src/components/payments/PaymentForm.tsx`

**Acceptance Criteria:**

- Correct Payment button only shown when `isCorrected = false`
- Correct Payment button disabled/hidden when `isCorrected = true` (single-correction rule)
- Correction form opens with original values pre-filled
- Warning shown for payments older than 90 days
- Warning shown (non-blocking) if member is archived/inactive or branch is archived
- 400 error handled with clear message for already corrected payment
- 409 error handled with refresh message and data refresh
- 429 error handled with retry message
- Version field included in correction request
- User can refresh and retry after conflicts

---

## Phase 17: Frontend Integration - Revenue Reports Page

**Goal:** Create revenue reports page  
**Dependencies:** Phase 13  
**Blockers:** T150-T158 must be complete

### Tasks

- [ ] T182 Create revenue reports page in `frontend/src/pages/RevenuePage.tsx`
- [ ] T183 Create new route `/revenue` in frontend routing
- [ ] T184 Integrate RevenueReport component into revenue page in `frontend/src/pages/RevenuePage.tsx`
- [ ] T185 Add revenue page to navigation menu

**Acceptance Criteria:**

- Revenue page created and accessible
- Route `/revenue` works correctly
- RevenueReport component integrated
- Page added to navigation menu
- User can navigate to revenue page

---

## Phase 18: Frontend Integration - React Query Hooks

**Goal:** Create React Query hooks for payment operations  
**Dependencies:** Phase 10  
**Blockers:** T114-T131 must be complete

### Tasks

- [ ] T186 Create `usePayments` hook in `frontend/src/hooks/usePayments.ts`
- [ ] T187 Create `useCreatePayment` hook in `frontend/src/hooks/usePayments.ts`
- [ ] T188 Create `useCorrectPayment` hook in `frontend/src/hooks/usePayments.ts`
- [ ] T189 Create `useRevenueReport` hook in `frontend/src/hooks/useRevenue.ts`
- [ ] T190 Create `useMemberPayments` hook in `frontend/src/hooks/usePayments.ts`
- [ ] T191 Configure cache invalidation for payment operations in `frontend/src/hooks/usePayments.ts`
- [ ] T192 Configure optimistic updates for payment creation in `frontend/src/hooks/usePayments.ts`
- [ ] T193 Configure cache invalidation for payment correction in `frontend/src/hooks/usePayments.ts`

**Acceptance Criteria:**

- React Query hooks created for all payment operations
- Cache invalidation configured correctly
- Optimistic updates configured for payment creation
- Cache updates on payment correction
- Hooks follow existing patterns

---

## Phase 19: Frontend Testing - E2E Tests

**Goal:** Comprehensive E2E test coverage for payment workflows  
**Dependencies:** Phase 15, Phase 16, Phase 17  
**Blockers:** T165-T192 must be complete

### Tasks

- [ ] T194 Create E2E test file for payment workflows in `frontend/test/payments.e2e.spec.ts`
- [ ] T195 Test payment recording workflow end-to-end in `frontend/test/payments.e2e.spec.ts`
- [ ] T196 Test payment correction workflow end-to-end in `frontend/test/payments.e2e.spec.ts`
- [ ] T197 Test 409 Conflict handling in frontend (refresh and retry) in `frontend/test/payments.e2e.spec.ts`
- [ ] T198 Test 429 Rate Limit handling in frontend (retry message) in `frontend/test/payments.e2e.spec.ts`
- [ ] T199 Test single-correction rule enforcement in UI (button disabled when isCorrected=true) in `frontend/test/payments.e2e.spec.ts`
- [ ] T200 Test revenue report generation workflow end-to-end in `frontend/test/payments.e2e.spec.ts`

**Acceptance Criteria:**

- E2E tests cover payment recording workflow
- E2E tests cover payment correction workflow
- E2E tests verify 409 conflict handling (refresh and retry)
- E2E tests verify 429 rate limit handling (retry message)
- E2E tests verify single-correction rule (button disabled)
- E2E tests cover revenue report generation
- All E2E tests passing

---

## Phase 20: Documentation Updates

**Goal:** Update documentation with payment tracking features  
**Dependencies:** All phases  
**Blockers:** All tasks must be complete

### Tasks

- [ ] T201 Update API documentation (OpenAPI spec) with payment endpoints in `specs/007-revenue-tracking/contracts/openapi.yaml`
- [ ] T202 Document payment correction workflow in `specs/007-revenue-tracking/spec.md`
- [ ] T203 Document revenue calculation rules in `specs/007-revenue-tracking/spec.md`
- [ ] T204 Add inline code comments for optimistic locking implementation in `backend/src/payments/payments.service.ts`
- [ ] T205 Add inline code comments for single-correction rule enforcement in `backend/src/payments/payments.service.ts`
- [ ] T206 Add inline code comments for revenue calculation logic in `backend/src/payments/payments.service.ts`
- [ ] T207 Add inline code comments for `paidOn` field semantics (DATE-only) in `backend/src/payments/payments.service.ts`
- [ ] T209 Update README with payment tracking features

**Acceptance Criteria:**

- API documentation updated with all payment endpoints
- Payment correction workflow documented
- Revenue calculation rules documented
- Code comments explain complex logic
- README updated with feature overview
- Documentation is clear and helpful

---

## Dependencies

### Story Completion Order

1. **Phase 1** (Database): Must complete first - blocks all other phases
2. **Phase 2** (Backend Service): Blocks Phase 3, 4, 5, 8
3. **Phase 3** (Logging): Blocks Phase 8
4. **Phase 4** (DTOs): Blocks Phase 5
5. **Phase 5** (Controller): Blocks Phase 6, 7, 9
6. **Phase 6** (Rate Limiting): Blocks Phase 9
7. **Phase 7** (Idempotency): Blocks Phase 9
8. **Phase 8** (Unit Tests): Can run in parallel with Phase 9
9. **Phase 9** (Integration Tests): Can run after Phase 5, 6, 7
10. **Phase 10** (Frontend Types): Blocks Phase 11, 12, 13, 14, 18
11. **Phase 11** (Payment Form): Blocks Phase 15, 16
12. **Phase 12** (Payment History): Blocks Phase 15, 16
13. **Phase 13** (Revenue Report): Blocks Phase 17
14. **Phase 14** (Helper Components): Can run in parallel with Phase 11, 12, 13
15. **Phase 15** (Member Detail Integration): Blocks Phase 19
16. **Phase 16** (Correction Workflow): Blocks Phase 19
17. **Phase 17** (Revenue Page): Blocks Phase 19
18. **Phase 18** (React Query): Can run in parallel with Phase 15, 16, 17
19. **Phase 19** (E2E Tests): Requires Phase 15, 16, 17
20. **Phase 20** (Documentation): Can run after all phases

### Parallel Execution Opportunities

- **Phase 8** (Unit Tests) and **Phase 9** (Integration Tests) can run in parallel
- **Phase 11** (Payment Form), **Phase 12** (Payment History), **Phase 13** (Revenue Report), **Phase 14** (Helper Components) can run in parallel
- **Phase 15** (Member Detail), **Phase 16** (Correction Workflow), **Phase 17** (Revenue Page), **Phase 18** (React Query) can run in parallel

---

## Implementation Strategy

### MVP Scope

**Minimum Viable Product (MVP):**
- Phase 1: Database Schema & Migration
- Phase 2: Backend Service Layer - Core Domain Logic
- Phase 3: Backend Service Layer - Observability (Logging)
- Phase 4: Backend DTOs & Validation
- Phase 5: Backend Controller & API Endpoints
- Phase 8: Backend Testing - Unit Tests
- Phase 9: Backend Testing - Integration Tests
- Phase 10: Frontend Types & API Client
- Phase 11: Frontend Components - Payment Form
- Phase 12: Frontend Components - Payment History Table
- Phase 15: Frontend Integration - Member Detail Page

**MVP Excludes:**
- Phase 6: Rate Limiting (can add later)
- Phase 7: Idempotency (can add later)
- Phase 13: Revenue Report (can add later)
- Phase 16: Payment Correction (can add later)
- Phase 17: Revenue Reports Page (can add later)

### Incremental Delivery

1. **Week 1:** Database + Backend Service + DTOs + Controller (Phase 1-5)
2. **Week 2:** Backend Testing + Frontend Types + Payment Form + Payment History (Phase 8-12)
3. **Week 3:** Frontend Integration + E2E Tests + Documentation (Phase 15, 19, 20)
4. **Week 4:** Rate Limiting + Idempotency + Revenue Reports + Payment Correction (Phase 6, 7, 13, 16, 17)

---

## Critical Requirements Checklist

### `paidOn` Naming Consistency

- [ ] Database schema uses `paidOn` field name
- [ ] Backend DTOs use `paidOn` field name
- [ ] Backend service methods use `paidOn` field name
- [ ] Frontend types use `paidOn` field name
- [ ] Frontend components use `paidOn` field name
- [ ] API contracts use `paidOn` field name
- [ ] All documentation uses `paidOn` field name

### Single-Correction Rule Enforcement

- [ ] Backend service hard-fails with 400 if `isCorrected = true`
- [ ] Backend controller returns 400 for already corrected payment
- [ ] Frontend disables/hides "Correct Payment" button when `isCorrected = true`
- [ ] Unit tests verify single-correction rule
- [ ] Integration tests verify single-correction rule
- [ ] E2E tests verify single-correction rule in UI

### Revenue Calculation (Exclude Corrected Originals)

- [ ] Revenue query excludes payments where `isCorrection = false AND isCorrected = true`
- [ ] Revenue query includes payments where `isCorrection = true`
- [ ] Unit tests verify revenue calculation logic
- [ ] Integration tests verify revenue calculation
- [ ] Revenue reports show correct totals

### Idempotency Behavior

- [ ] Idempotency key stored in database with TTL (24h)
- [ ] Same idempotency key returns cached response
- [ ] Integration tests verify idempotency behavior
- [ ] Idempotency keys expire after 24 hours

### 409 Conflict Handling

- [ ] Backend returns 409 Conflict on version mismatch
- [ ] Frontend handles 409 with refresh message
- [ ] Frontend refreshes payment data on 409
- [ ] Integration tests verify 409 conflict handling
- [ ] E2E tests verify 409 conflict handling in UI

### 429 Rate Limit Handling

- [ ] Backend returns 429 Too Many Requests when rate limit exceeded
- [ ] Frontend handles 429 with retry message
- [ ] Integration tests verify 429 rate limit handling
- [ ] E2E tests verify 429 rate limit handling in UI

---

**End of Tasks Document**

