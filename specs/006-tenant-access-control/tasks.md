# Tasks: Tenant Access Control (Manual Billing)

**Feature:** 006-tenant-access-control  
**Generated:** 2025-12-17  
**Based on:** plan.md, spec.md

---

## Overview

This document contains the complete task list for implementing Tenant Access Control feature. Tasks are organized by implementation phase and must be completed sequentially unless marked as parallelizable `[P]`.

**Total Tasks:** 89  
**Estimated Effort:** 9.5-12.5 person-days

---

## Phase 1: Database Schema & Migration

**Goal:** Update Prisma schema and create migration with backfill logic  
**Dependencies:** None  
**Blockers:** None

### Tasks

- [x] T001 Add `BillingStatus` enum to Prisma schema in `backend/prisma/schema.prisma`
- [x] T002 Add `billingStatus` field to Tenant model in `backend/prisma/schema.prisma`
- [x] T003 Add `billingStatusUpdatedAt` field to Tenant model in `backend/prisma/schema.prisma`
- [x] T004 Add index on `billingStatus` field in `backend/prisma/schema.prisma`
- [x] T005 Generate Prisma migration in `backend/prisma/migrations/`
- [x] T006 Add backfill logic to migration: set existing tenants to `ACTIVE` in `backend/prisma/migrations/`
- [x] T007 Test migration on development database
- [x] T008 Verify rollback procedure works correctly

**Acceptance Criteria:**

- Prisma schema includes `BillingStatus` enum with values: TRIAL, ACTIVE, PAST_DUE, SUSPENDED
- Tenant model includes `billingStatus` with default `TRIAL` and `billingStatusUpdatedAt` nullable DateTime
- Index created on `billingStatus` field
- Migration backfills all existing tenants to `ACTIVE` status
- Migration sets `billingStatusUpdatedAt = createdAt` for existing tenants
- Migration runs successfully on clean database and database with existing tenants
- Rollback tested and documented

---

## Phase 2: Backend - Core Infrastructure

**Goal:** Create billing status guard, constants, and logging infrastructure  
**Dependencies:** Phase 1  
**Blockers:** T001-T008 must be complete

### Tasks

- [x] T009 Create billing error code constants in `backend/src/common/constants/billing-messages.ts`
- [x] T010 Create billing error message constants (server-side only) in `backend/src/common/constants/billing-messages.ts`
- [x] T011 Create `BillingStatusGuard` class implementing `CanActivate` in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T012 Implement tenantId extraction from JWT in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T013 Implement billing status query logic in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T014 Implement PAST_DUE read-only logic (allow GET, block POST/PATCH/DELETE) in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T015 Implement SUSPENDED full blocking logic (block all requests) in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T016 Add error response formatting with error code `TENANT_BILLING_LOCKED` in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T017 Add guard execution time logging (warn if >10ms) in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T018 Add 403 response logging with billing status and endpoint in `backend/src/auth/guards/billing-status.guard.ts`
- [x] T019 Register `BillingStatusGuard` as `APP_GUARD` provider in `backend/src/app.module.ts`
- [x] T020 Exclude auth routes and tenant info routes from guard in `backend/src/app.module.ts`
  - Auth routes: `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/refresh`, `/api/v1/auth/me`
  - Tenant info: `/api/v1/tenants/current` (GET only - needed for frontend to display billing status)
- [x] T021 Create structured logging utility for billing status changes in `backend/src/common/utils/billing-logger.ts`
- [x] T022 Implement billing status change logging function in `backend/src/common/utils/billing-logger.ts`
- [x] T023 Integrate billing logger with existing logging infrastructure in `backend/src/common/utils/billing-logger.ts`

**Acceptance Criteria:**

- `BILLING_ERROR_CODES` object exported with `TENANT_BILLING_LOCKED` code
- `BILLING_ERROR_MESSAGES` object exported with Turkish server-side messages only (no UI strings)
- Guard extracts `tenantId` from `request.user.tenantId`
- Guard queries Tenant table to fetch `billingStatus`
- Guard allows GET requests for PAST_DUE tenants
- Guard blocks POST/PATCH/DELETE requests for PAST_DUE tenants with 403 and appropriate message
- Guard blocks all requests for SUSPENDED tenants with 403 and error code `TENANT_BILLING_LOCKED`
- Guard allows all requests for TRIAL/ACTIVE tenants
- Guard logs execution time if >10ms
- Guard logs 403 responses with billing status and endpoint
- Guard applied globally via `APP_GUARD` provider
- Auth routes (login, register, refresh token) excluded from guard
- Structured logging utility logs billing status changes with timestamp, tenantId, oldStatus, newStatus, correlationId
- Log level: INFO for normal transitions, WARN for SUSPENDED transitions

---

## Phase 3: Backend - Authentication Flow Updates

**Goal:** Update login and `/auth/me` endpoints to include billing status checks  
**Dependencies:** Phase 1, Phase 2  
**Blockers:** T009-T023 must be complete

### Tasks

- [x] T024 Update `AuthService.login()` to query Tenant billing status in `backend/src/auth/auth.service.ts`
- [x] T025 Add SUSPENDED tenant login rejection logic in `backend/src/auth/auth.service.ts`
- [x] T026 Add PAST_DUE tenant login allowance with billing status in response in `backend/src/auth/auth.service.ts`
- [x] T027 Include billing status in login response in `backend/src/auth/auth.service.ts`
- [x] T028 Install `@nestjs/throttler` package if not already installed
- [x] T029 Configure throttler module in `backend/src/app.module.ts`
- [x] T030 Apply throttler guard to login endpoint in `backend/src/auth/auth.controller.ts`
- [x] T031 Configure general rate limiting (5 attempts per 15 minutes per IP/email) in `backend/src/auth/auth.controller.ts`
- [x] T032 Add rate limit error response with `BILLING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED` in `backend/src/auth/auth.controller.ts`
- [x] T033 Add rate limit hit logging in `backend/src/auth/auth.controller.ts`
- [x] T034 Add `getCurrentUser()` method to `AuthService` in `backend/src/auth/auth.service.ts`
- [x] T035 Update `/auth/me` endpoint to query Tenant billing status in `backend/src/auth/auth.service.ts`
- [x] T036 Include billing status and `billingStatusUpdatedAt` in `/auth/me` response in `backend/src/auth/auth.controller.ts`
- [x] T037 Add SUSPENDED check to `/auth/me` endpoint (return 403 with error code) in `backend/src/auth/auth.service.ts`
- [x] T038 Update `UpdateTenantDto` to exclude `billingStatus` field in `backend/src/tenants/dto/update-tenant.dto.ts`
- [x] T039 Add service-level check to reject `billingStatus` updates in `backend/src/tenants/tenants.service.ts`
- [x] T040 Add 403 Forbidden response for billing status update attempts in `backend/src/tenants/tenants.service.ts`

**Acceptance Criteria:**

- `login()` method queries Tenant table for `billingStatus` after credential validation
- SUSPENDED tenant login returns 403 with error code `TENANT_BILLING_LOCKED` and message `BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN`
- PAST_DUE tenant login succeeds and includes billing status in response
- TRIAL/ACTIVE tenant login proceeds normally
- Login response includes `tenant.billingStatus` field
- General rate limiting applied to login endpoint (5 attempts per 15 minutes per IP/email)
- Rate limit exceeded returns 429 with `BILLING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED`
- Rate limit hits logged for monitoring
- `/auth/me` endpoint includes `tenant.billingStatus` and `tenant.billingStatusUpdatedAt` in response
- `/auth/me` returns 403 with error code `TENANT_BILLING_LOCKED` if tenant is SUSPENDED
- `UpdateTenantDto` does not include `billingStatus` field
- `TenantsService.update()` rejects `billingStatus` field with 403 Forbidden and `BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN`
- DTO validation rejects `billingStatus` field via `forbidNonWhitelisted: true`

---

## Phase 4: Backend - Testing

**Goal:** Comprehensive test coverage for billing status enforcement  
**Dependencies:** Phase 2, Phase 3  
**Blockers:** T011-T040 must be complete

### Tasks

- [x] T041 Create unit test file for `BillingStatusGuard` in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T042 Test guard allows ACTIVE tenant requests in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T043 Test guard allows TRIAL tenant requests in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T044 Test guard blocks PAST_DUE tenant POST/PATCH/DELETE requests with 403 in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T045 Test guard allows PAST_DUE tenant GET requests in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T046 Test guard blocks SUSPENDED tenant all requests with 403 in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T047 Test guard extracts tenantId from JWT correctly in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T048 Test guard handles missing tenantId gracefully (returns 401) in `backend/src/auth/guards/billing-status.guard.spec.ts`
- [x] T049 Update `AuthService` unit tests for billing status checks in `backend/src/auth/auth.service.spec.ts`
- [x] T050 Test `login()` rejects SUSPENDED tenant with 403 and error code in `backend/src/auth/auth.service.spec.ts`
- [x] T051 Test `login()` allows PAST_DUE tenant (returns billing status) in `backend/src/auth/auth.service.spec.ts`
- [x] T052 Test `login()` allows ACTIVE/TRIAL tenant normally in `backend/src/auth/auth.service.spec.ts`
- [x] T053 Test rate limiting blocks login attempts after threshold in `backend/src/auth/auth.service.spec.ts`
- [x] T054 Update `TenantsService` unit tests for billing status rejection in `backend/src/tenants/tenants.service.spec.ts`
- [x] T055 Test `update()` rejects `billingStatus` field in update data in `backend/src/tenants/tenants.service.spec.ts`
- [x] T056 Test `update()` throws 403 Forbidden if `billingStatus` included in `backend/src/tenants/tenants.service.spec.ts`
- [x] T057 Test `update()` allows `name` and `defaultCurrency` updates normally in `backend/src/tenants/tenants.service.spec.ts`
- [x] T058 Create E2E test file for billing status in `backend/test/billing-status.e2e-spec.ts`
- [x] T059 Test POST /api/v1/members returns 403 for PAST_DUE tenant in `backend/test/billing-status.e2e-spec.ts`
- [x] T060 Test GET /api/v1/members returns 200 for PAST_DUE tenant (read-only) in `backend/test/billing-status.e2e-spec.ts`
- [x] T061 Test PATCH /api/v1/members/:id returns 403 for PAST_DUE tenant in `backend/test/billing-status.e2e-spec.ts`
- [x] T062 Test DELETE /api/v1/members/:id returns 403 for PAST_DUE tenant in `backend/test/billing-status.e2e-spec.ts`
- [x] T063 Test all mutation endpoints return 403 with error code `TENANT_BILLING_LOCKED` for SUSPENDED tenant in `backend/test/billing-status.e2e-spec.ts`
- [x] T064 Test GET endpoints return 403 with error code `TENANT_BILLING_LOCKED` for SUSPENDED tenant in `backend/test/billing-status.e2e-spec.ts`
- [x] T065 Test POST /api/v1/auth/login returns 403 with error code `TENANT_BILLING_LOCKED` for SUSPENDED tenant in `backend/test/billing-status.e2e-spec.ts`
- [x] T066 Test POST /api/v1/auth/login returns 200 for PAST_DUE tenant (with billing status) in `backend/test/billing-status.e2e-spec.ts`
- [x] T067 Test PUT /api/v1/tenants/:id rejects billingStatus field with 403 in `backend/test/billing-status.e2e-spec.ts`
- [x] T068 Test tenant isolation maintained (billing status restrictions do not bypass tenant scoping) in `backend/test/billing-status.e2e-spec.ts`
- [x] T069 Test E2E-001: PAST_DUE tenant can view members but cannot create new member in `backend/test/billing-status.e2e-spec.ts`
- [x] T070 Test E2E-002: PAST_DUE tenant can view plans but cannot update plan in `backend/test/billing-status.e2e-spec.ts`
- [x] T071 Test E2E-003: SUSPENDED tenant cannot login (403 on login endpoint) in `backend/test/billing-status.e2e-spec.ts`
- [x] T072 Test E2E-004: SUSPENDED tenant sees error message on login page in `backend/test/billing-status.e2e-spec.ts`
- [x] T073 Test E2E-005: ACTIVE tenant can perform all CRUD operations normally in `backend/test/billing-status.e2e-spec.ts`
- [x] T074 Test E2E-006: TRIAL tenant can perform all CRUD operations normally in `backend/test/billing-status.e2e-spec.ts`
- [x] T075 Test E2E-007: Tenant cannot update own billingStatus via API (403 Forbidden) in `backend/test/billing-status.e2e-spec.ts`
- [x] T076 Test E2E-008: Database update of billingStatus (PAST_DUE → ACTIVE) immediately allows mutations in `backend/test/billing-status.e2e-spec.ts`
- [x] T077 Test E2E-009: Database update of billingStatus (ACTIVE → SUSPENDED) blocks next login attempt in `backend/test/billing-status.e2e-spec.ts`
- [x] T078 Test E2E-010: Mid-session billing status change (ACTIVE → PAST_DUE) blocks next mutation request in `backend/test/billing-status.e2e-spec.ts`

**Acceptance Criteria:**

- Unit tests for `BillingStatusGuard` cover all state combinations (ACTIVE, TRIAL, PAST_DUE, SUSPENDED)
- Unit tests verify guard excludes auth routes correctly
- Unit tests for `AuthService.login()` cover all billing states
- Unit tests for rate limiting logic pass
- Unit tests for `TenantsService.update()` billing status rejection pass
- Integration tests for all API endpoints with billing restrictions pass
- E2E tests for all user flows pass (minimum 10 test cases)
- Test coverage >80% for billing status logic
- All tests pass

---

## Phase 5: Frontend - Core Infrastructure

**Goal:** Create billing status constants, types, and error handling infrastructure  
**Dependencies:** Phase 1  
**Blockers:** T001-T008 must be complete

### Tasks

- [x] T079 Add `BillingStatus` enum to shared TypeScript types in `frontend/src/types/billing.ts`
- [x] T080 Export `AuthMeResponse` type with billing status fields in `frontend/src/types/billing.ts`
- [x] T081 Export `LoginResponse` type with billing status fields in `frontend/src/types/billing.ts`
- [x] T082 Create frontend-owned billing constants file in `frontend/src/lib/constants/billing-messages.ts`
- [x] T083 Export `BILLING_ERROR_CODES` object matching backend values in `frontend/src/lib/constants/billing-messages.ts`
- [x] T084 Export `BILLING_BANNER_MESSAGES` for banner component in `frontend/src/lib/constants/billing-messages.ts`
- [x] T085 Export `BILLING_TOOLTIP_MESSAGES` for tooltip component in `frontend/src/lib/constants/billing-messages.ts`
- [x] T086 Update `LoginResponse` type in API client to include `tenant.billingStatus` in `frontend/src/api/auth.ts`
- [x] T087 Update `AuthMeResponse` type in API client to include billing status fields in `frontend/src/api/auth.ts`
- [x] T088 Create global API error handler utility in `frontend/src/lib/api-error-handler.ts`
- [x] T089 Implement error interceptor for React Query in `frontend/src/lib/api-error-handler.ts`
- [x] T090 Implement billing lock detection via structured error code (`code === "TENANT_BILLING_LOCKED"`) in `frontend/src/lib/api-error-handler.ts`
- [x] T091 Implement redirect to `/billing-locked` (not `/login`) for SUSPENDED status in `frontend/src/lib/api-error-handler.ts`
- [x] T092 Implement JWT preservation for PAST_DUE status in `frontend/src/lib/api-error-handler.ts`
- [x] T093 Implement toast notification for other billing errors (PAST_DUE mutation attempts) in `frontend/src/lib/api-error-handler.ts`
- [x] T094 Integrate error handler with existing error handling infrastructure in `frontend/src/lib/api-error-handler.ts`
- [x] T095 Update user context/state management to include billing status in `frontend/src/features/auth/types.ts`
- [x] T096 Update auth hooks to fetch and store billing status in `frontend/src/hooks/use-auth.ts`
- [x] T097 Implement billing status refresh strategy (app boot, login, optional focus/interval - NOT per API call) in `frontend/src/hooks/use-auth.ts`

**Acceptance Criteria:**

- `BillingStatus` enum matches backend enum values
- `AuthMeResponse` type includes `tenant.billingStatus` and `tenant.billingStatusUpdatedAt`
- `LoginResponse` type includes `tenant.billingStatus`
- Frontend constants file exports `BILLING_ERROR_CODES` matching backend values
- Frontend constants file exports `BILLING_BANNER_MESSAGES` and `BILLING_TOOLTIP_MESSAGES` (frontend-owned UI strings)
- API client types updated to include billing status fields
- Error interceptor detects billing lock ONLY via structured error code `code === "TENANT_BILLING_LOCKED"`
- Error handler does NOT use message text for detection (error code is authoritative)
- Error handler redirects SUSPENDED tenants to `/billing-locked` (not `/login`)
- Error handler preserves JWT token for PAST_DUE status
- Error handler shows toast notification for PAST_DUE mutation attempts
- User context includes `billingStatus` field
- Auth hooks fetch and store billing status
- Billing status fetched on app boot (or initial auth hydrate) via `/auth/me` endpoint
- Billing status fetched after successful login
- OPTIONAL: Billing status refreshes on window focus or on an interval (e.g., every 5–10 minutes)
- Billing status does NOT refresh on each API call
- Types compile correctly

---

## Phase 6: Frontend - UI Components

**Goal:** Create billing banner, locked screen, and read-only mode indicators  
**Dependencies:** Phase 5  
**Blockers:** T079-T097 must be complete

### Tasks

- [x] T098 Create `BillingStatusBanner` component in `frontend/src/components/billing/BillingStatusBanner.tsx`
- [x] T099 Implement yellow/orange warning banner for PAST_DUE status in `frontend/src/components/billing/BillingStatusBanner.tsx`
- [x] T100 Implement red error banner for SUSPENDED status in `frontend/src/components/billing/BillingStatusBanner.tsx`
- [x] T101 Display message from `BILLING_BANNER_MESSAGES` in `frontend/src/components/billing/BillingStatusBanner.tsx`
- [x] T102 Make banner persistent (does not dismiss automatically) in `frontend/src/components/billing/BillingStatusBanner.tsx`
- [x] T103 Create `LockedScreen` component in `frontend/src/components/billing/LockedScreen.tsx`
- [x] T104 Implement full-screen overlay with SUSPENDED message in `frontend/src/components/billing/LockedScreen.tsx`
- [x] T105 Prevent all UI interactions (buttons, forms, navigation disabled) in `frontend/src/components/billing/LockedScreen.tsx`
- [x] T106 Show logout button and support contact information in `frontend/src/components/billing/LockedScreen.tsx`
- [x] T107 Create `useBillingStatus()` hook in `frontend/src/hooks/use-billing-status.ts`
- [x] T108 Create `useIsReadOnly()` hook to check if tenant is in read-only mode (PAST_DUE) in `frontend/src/hooks/use-billing-status.ts`
- [x] T109 Create `useIsSuspended()` hook to check if tenant is suspended in `frontend/src/hooks/use-billing-status.ts`
- [x] T110 Update layout to show billing banner when needed in `frontend/src/layouts/MainLayout.tsx`
- [x] T111 Add `BillingStatusBanner` component to layout in `frontend/src/layouts/MainLayout.tsx`
- [x] T112 Show banner when `billingStatus = PAST_DUE` or `SUSPENDED` in `frontend/src/layouts/MainLayout.tsx`
- [x] T113 Update all mutation buttons to disable in PAST_DUE mode (use `useIsReadOnly()` hook) in all pages with create/update/delete buttons
- [x] T114 Add tooltip on hover for disabled buttons: `BILLING_TOOLTIP_MESSAGES.PAST_DUE_READ_ONLY` in all pages with mutation buttons
- [x] T115 Add read-only styling to forms in PAST_DUE mode (use `useIsReadOnly()` hook) in all form components
- [x] T116 Disable form inputs (read-only styling) in `frontend/src/components/**/*Form.tsx` components
- [x] T117 Hide or disable action buttons in forms in `frontend/src/components/**/*Form.tsx` components
- [x] T118 Create route `/billing-locked` (or `/locked`) in `frontend/src/App.tsx` or router configuration
- [x] T119 Implement billing status check on route change in `frontend/src/App.tsx`
- [x] T120 Redirect to `/billing-locked` if `billingStatus = SUSPENDED` in `frontend/src/App.tsx`
- [x] T121 Ensure all routes redirect to `/billing-locked` for SUSPENDED tenants in `frontend/src/App.tsx`
- [x] T122 Ensure locked screen route is accessible without redirecting to login in `frontend/src/App.tsx`

**Acceptance Criteria:**

- `BillingStatusBanner` component displays yellow/orange warning for PAST_DUE status
- `BillingStatusBanner` component displays red error banner for SUSPENDED status
- Banner shows message from `BILLING_BANNER_MESSAGES`
- Banner is persistent (does not dismiss automatically)
- Banner includes contact information or support link (if available)
- `LockedScreen` component displays full-screen overlay with SUSPENDED message
- Locked screen prevents all UI interactions (buttons, forms, navigation disabled)
- Locked screen shows logout button and support contact information
- `useBillingStatus()` hook returns current billing status
- `useIsReadOnly()` hook returns true for PAST_DUE tenants
- `useIsSuspended()` hook returns true for SUSPENDED tenants
- Layout shows billing banner when `billingStatus = PAST_DUE` or `SUSPENDED`
- Banner appears on all pages (below header, above main content)
- All mutation buttons (Create, Update, Delete, Archive) are disabled when read-only
- Tooltip displays `BILLING_TOOLTIP_MESSAGES.PAST_DUE_READ_ONLY` on hover for disabled buttons
- All form inputs are disabled (read-only styling) when read-only
- Action buttons in forms are hidden or disabled when read-only
- Route `/billing-locked` exists and displays `LockedScreen` component
- All routes redirect to `/billing-locked` for SUSPENDED tenants
- Locked screen route is accessible without redirecting to login

---

## Phase 7: Frontend - Error Handling & State Management

**Goal:** Implement mid-session billing status change handling and error display  
**Dependencies:** Phase 5, Phase 6  
**Blockers:** T088-T140 must be complete

### Tasks

- [x] T123 Update error handling to show billing-specific messages in `frontend/src/lib/api-error-handler.ts`
- [x] T124 Intercept 403 responses from mutation endpoints in `frontend/src/lib/api-error-handler.ts`
- [x] T125 Detect billing lock ONLY via structured response code (`code === "TENANT_BILLING_LOCKED"`) in `frontend/src/lib/api-error-handler.ts`
- [x] T126 Show toast notification for other billing-related errors (PAST_DUE mutation attempts) in `frontend/src/lib/api-error-handler.ts`
- [x] T127 Implement mid-session billing status change detection (relies on backend authority) in `frontend/src/lib/api-error-handler.ts`
- [x] T128 When any API request returns 403 with `code === "TENANT_BILLING_LOCKED"`, detect via error code only and redirect to `/billing-locked` with correct JWT behavior in `frontend/src/lib/api-error-handler.ts`
- [x] T129 For SUSPENDED status: optionally clear JWT token and redirect to `/billing-locked` (not `/login`) in `frontend/src/lib/api-error-handler.ts`
- [x] T130 For PAST_DUE status: preserve JWT token (for read-only access) and show toast notification in `frontend/src/lib/api-error-handler.ts`
- [x] T131 Invalidate user session cache (React Query cache, user context) as needed in `frontend/src/lib/api-error-handler.ts`
- [x] T132 Update React Query cache invalidation on logout in `frontend/src/features/auth/AuthContext.tsx`
- [x] T133 Invalidate billing status cache on logout in `frontend/src/features/auth/AuthContext.tsx`
- [x] T134 Clear billing status from user context on logout in `frontend/src/features/auth/AuthContext.tsx`
- [x] T135 Implement billing status refresh strategy (app boot, login, optional focus/interval - NOT per API call) in `frontend/src/features/auth/AuthContext.tsx`
- [x] T136 Fetch billing status on app boot (or initial auth hydrate) via `/auth/me` endpoint in `frontend/src/features/auth/AuthContext.tsx`
- [x] T137 Fetch billing status after successful login (from login response) in `frontend/src/features/auth/AuthContext.tsx`
- [x] T138 OPTIONAL: Implement refresh on window focus or on an interval (e.g., every 5–10 minutes) in `frontend/src/features/auth/AuthContext.tsx`
- [x] T139 Store billing status in user context after fetch in `frontend/src/features/auth/AuthContext.tsx`
- [x] T140 Trigger appropriate UI (banner, locked screen) based on status in `frontend/src/features/auth/AuthContext.tsx`

**Acceptance Criteria:**

- Error handler intercepts 403 responses from mutation endpoints
- Error handler detects billing lock ONLY via structured error code `code === "TENANT_BILLING_LOCKED"`
- Error handler does NOT check message text or keywords (error code is authoritative)
- Mid-session enforcement relies on backend authority: when any API request returns 403 with `code === "TENANT_BILLING_LOCKED"`, redirect to `/billing-locked` and apply correct JWT behavior
- Error handler redirects SUSPENDED tenants to `/billing-locked` (not `/login`)
- Error handler preserves JWT token for PAST_DUE status (user remains logged in for read-only access)
- Error handler shows toast notification for PAST_DUE mutation attempts
- Mid-session status change detection works for both PAST_DUE and SUSPENDED transitions
- User session cache invalidated when billing status changes mid-session
- Billing status cache invalidated on logout
- Billing status cleared from user context on logout
- Billing status fetched on app boot (or initial auth hydrate) via `/auth/me` endpoint
- Billing status fetched after successful login
- OPTIONAL: Billing status refreshes on window focus or on an interval (e.g., every 5–10 minutes)
- Billing status does NOT refresh on each API call
- Appropriate UI (banner, locked screen) triggered based on status

---

## Phase 8: Frontend - Testing

**Goal:** Test frontend billing status UI and error handling  
**Dependencies:** All frontend phases  
**Blockers:** T098-T140 must be complete

**Note:** Automated tests deferred. All scenarios verified manually.

### Tasks

- [x] T141 Test PAST_DUE tenant UI: login and verify warning banner displays  
  Completed via manual QA and smoke testing
- [x] T142 Test PAST_DUE tenant UI: verify create/update/delete buttons are disabled  
  Completed via manual QA and smoke testing
- [x] T143 Test PAST_DUE tenant UI: verify forms are read-only  
  Completed via manual QA and smoke testing
- [x] T144 Test PAST_DUE tenant UI: verify tooltips display correctly  
  Completed via manual QA and smoke testing
- [x] T145 Test SUSPENDED tenant UI: attempt login and verify login is rejected with error message  
  Completed via manual QA and smoke testing
- [x] T146 Test SUSPENDED tenant UI: verify locked screen displays if somehow logged in  
  Completed via manual QA and smoke testing
- [x] T147 Test mid-session status change flow: login as ACTIVE tenant  
  Completed via manual QA and smoke testing
- [x] T148 Test mid-session status change flow: update billing status to PAST_DUE in database  
  Completed via manual QA and smoke testing
- [x] T149 Test mid-session status change flow: attempt to create/update record and verify mutation is blocked (403)  
  Completed via manual QA and smoke testing
- [x] T150 Test mid-session status change flow: verify JWT is preserved (user remains logged in, can view data)  
  Completed via manual QA and smoke testing
- [x] T151 Test mid-session status change flow: verify read-only mode indicators appear  
  Completed via manual QA and smoke testing
- [x] T152 Test mid-session status change flow: update billing status to SUSPENDED in database  
  Completed via manual QA and smoke testing
- [x] T153 Test mid-session status change flow: attempt any API request and verify redirects to `/billing-locked` when error code `TENANT_BILLING_LOCKED` is detected (relies on backend authority)  
  Completed via manual QA and smoke testing

**Acceptance Criteria:**

- PAST_DUE tenant sees warning banner on all pages
- PAST_DUE tenant sees disabled buttons and read-only form styling
- PAST_DUE tenant sees tooltips explaining restrictions
- SUSPENDED tenant cannot login (403 on login endpoint)
- SUSPENDED tenant sees error message on login page
- SUSPENDED tenant sees locked screen if somehow logged in
- Mid-session status change (ACTIVE → PAST_DUE) triggers read-only mode indicators (detected via backend error code)
- Mid-session status change (ACTIVE → SUSPENDED) triggers redirect to `/billing-locked` (detected via backend error code `TENANT_BILLING_LOCKED`)
- Mid-session enforcement relies on backend authority (not polling)
- JWT token preserved for PAST_DUE status (user remains logged in)
- All manual tests pass
- UI behaves correctly for all billing states
- Error handling works correctly

---

## Phase 9: Operations Documentation

**Goal:** Create runbook for manual billing state management and rollback procedures  
**Dependencies:** Phase 1  
**Blockers:** T001-T008 must be complete

**Note:** This phase is intentionally deferred and will be handled after MVP release.

### Tasks

- [ ] T154 Create manual DB update runbook in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T155 Document Prisma Studio steps for updating billing status in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T156 Document SQL examples for updating billing status in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T157 Document billing status transition rules in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T158 Include examples for common scenarios (SUSPENDED → ACTIVE, ACTIVE → PAST_DUE, PAST_DUE → SUSPENDED) in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T159 Include safety checks (verify tenant exists, verify current status) in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T160 Document safe rollback considerations in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T161 Document migration rollback steps in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T162 Document data rollback procedures (if billing status needs to be reverted) in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T163 Document impact of rollback on tenant access in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T164 Include SQL scripts for rollback scenarios in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T165 Create troubleshooting guide in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T166 Document common issues and solutions (tenant cannot login, tenant cannot create records, billing status not updating) in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T167 Document how to verify billing status enforcement is working in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)
- [ ] T168 Document how to check logs for billing status changes in `specs/006-tenant-access-control/operations-runbook.md`  
  Deferred (Post-MVP)

**Acceptance Criteria:**

- Runbook includes Prisma Studio steps for updating billing status
- Runbook includes SQL examples for updating billing status
- Runbook documents billing status transition rules
- Runbook includes examples for common scenarios
- Runbook includes safety checks
- Rollback procedures documented with step-by-step instructions
- Migration rollback steps documented
- Data rollback procedures documented
- Impact of rollback on tenant access documented
- SQL scripts for rollback scenarios included
- Troubleshooting guide includes common issues and solutions
- Troubleshooting guide explains how to verify billing status enforcement
- Troubleshooting guide explains how to check logs for billing status changes
- All documentation reviewed and accurate

---

## Dependencies

### Phase Dependencies

```
Phase 1 (Database Schema & Migration)
  └─> Phase 2 (Backend Core Infrastructure)
      └─> Phase 3 (Backend Authentication Flow)
          └─> Phase 4 (Backend Testing)

Phase 1 (Database Schema & Migration)
  └─> Phase 5 (Frontend Core Infrastructure)
      └─> Phase 6 (Frontend UI Components)
          └─> Phase 7 (Frontend Error Handling)
              └─> Phase 8 (Frontend Testing)

Phase 1 (Database Schema & Migration)
  └─> Phase 9 (Operations Documentation)
```

### Critical Path

The critical path for implementation is:

1. **Phase 1** (Database Schema & Migration) - Must complete first
2. **Phase 2** (Backend Core Infrastructure) - Blocks backend work
3. **Phase 3** (Backend Authentication Flow) - Blocks backend testing
4. **Phase 4** (Backend Testing) - Blocks backend completion
5. **Phase 5** (Frontend Core Infrastructure) - Blocks frontend work
6. **Phase 6** (Frontend UI Components) - Blocks frontend testing
7. **Phase 7** (Frontend Error Handling) - Blocks frontend completion
8. **Phase 8** (Frontend Testing) - Blocks feature completion
9. **Phase 9** (Operations Documentation) - Can be done in parallel with frontend work

### Parallel Opportunities

- **Phase 5** (Frontend Core Infrastructure) can start after Phase 1 completes (no dependency on backend implementation)
- **Phase 9** (Operations Documentation) can start after Phase 1 completes
- **Phase 4** (Backend Testing) can run in parallel with Phase 5-7 (Frontend work) once Phase 3 completes

---

## Implementation Strategy

### MVP Scope

**Minimum Viable Product (MVP) includes:**

- Phase 1: Database Schema & Migration
- Phase 2: Backend Core Infrastructure
- Phase 3: Backend Authentication Flow Updates
- Phase 4: Backend Testing (core tests only)
- Phase 5: Frontend Core Infrastructure
- Phase 6: Frontend UI Components (basic banner and locked screen)
- Phase 7: Frontend Error Handling (basic error detection)
- Phase 9: Operations Documentation (basic runbook)

**MVP excludes:**

- Phase 8: Frontend Testing (can be done post-MVP)
- Advanced error handling scenarios
- Comprehensive E2E test coverage (can be added incrementally)

### Incremental Delivery

1. **Week 1:** Complete Phase 1-2 (Database + Backend Infrastructure)
2. **Week 2:** Complete Phase 3-4 (Backend Auth + Testing)
3. **Week 3:** Complete Phase 5-6 (Frontend Infrastructure + UI)
4. **Week 4:** Complete Phase 7-8 (Frontend Error Handling + Testing)
5. **Week 5:** Complete Phase 9 (Operations Documentation) + Polish

---

## Definition of Done

### Backend

- [ ] All database migrations run successfully
- [ ] All existing tenants have `billingStatus = ACTIVE` after migration
- [ ] `BillingStatusGuard` implemented and applied globally
- [ ] Guard excludes auth routes correctly
- [ ] `AuthService.login()` checks billing status
- [ ] General rate limiting implemented for login endpoint
- [ ] `/auth/me` endpoint includes billing status
- [ ] `TenantsService.update()` rejects billing status updates
- [ ] All unit tests pass (>80% coverage for billing logic)
- [ ] All integration tests pass
- [ ] All E2E tests pass (minimum 10 test cases)
- [ ] Structured logging implemented for billing status changes
- [ ] Key metrics logging implemented (403 counts, guard execution time, rate limit hits)
- [ ] No linting errors
- [ ] Code review approved

### Frontend

- [ ] Billing status TypeScript types created
- [ ] Frontend-owned billing constants file created
- [ ] API client types updated
- [ ] Global API error handler implemented (detects via error code only)
- [ ] User context includes billing status
- [ ] `BillingStatusBanner` component created and displayed
- [ ] `LockedScreen` component created and routed
- [ ] Read-only mode utility hooks created
- [ ] All mutation buttons disabled in read-only mode
- [ ] All forms styled for read-only mode
- [ ] Locked screen routing implemented (redirects to `/billing-locked`)
- [ ] Mid-session billing status change detection implemented
- [ ] Error handling shows billing-specific messages
- [ ] All manual tests pass
- [ ] No linting errors
- [ ] Code review approved

### Documentation

- [ ] Operations runbook created
- [ ] Manual DB update procedures documented
- [ ] Rollback procedures documented
- [ ] Troubleshooting guide created
- [ ] All documentation reviewed

### Overall

- [ ] All tests pass (unit + integration + E2E)
- [ ] Billing status check adds <5ms overhead per API request
- [ ] 100% of mutation endpoints enforce billing status restrictions
- [ ] Test coverage >80% for billing status logic
- [ ] Zero tenant self-activation attempts succeed
- [ ] PAST_DUE tenants receive 403 Forbidden on all mutation attempts
- [ ] SUSPENDED tenants receive 403 Forbidden on all API requests (except authentication)
- [ ] ACTIVE and TRIAL tenants have full access to all features
- [ ] SUSPENDED tenants cannot login (403 Forbidden on login endpoint)
- [ ] PAST_DUE tenants can login but see warning banner and read-only restrictions
- [ ] PAST_DUE tenants see persistent warning banner on all pages
- [ ] PAST_DUE tenants see disabled buttons and read-only form styling
- [ ] SUSPENDED tenants see locked screen after login attempt
- [ ] Error messages are clear and in Turkish
- [ ] Frontend gracefully handles billing status changes mid-session
- [ ] Feature ready for production deployment

---

**End of Tasks Document**
