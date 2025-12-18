# Implementation Plan: Tenant Access Control (Manual Billing)

**Version:** 1.0.0  
**Created:** 2025-12-17  
**Updated:** 2025-12-17  
**Status:** Planning

---

## Overview

### Feature Summary
Implement billing state-based access restrictions for tenants, enabling manual billing workflows where payments are collected offline and tenant access is controlled via database updates. The feature enforces graduated restrictions: read-only access for PAST_DUE tenants and full blocking for SUSPENDED tenants.

### Related Specification
- `/specs/006-tenant-access-control/spec.md`

### Estimated Effort
- Backend: 4-5 person-days
- Frontend: 3-4 person-days
- Testing: 2-3 person-days
- Operations Documentation: 0.5 person-days
- **Total: 9.5-12.5 person-days**

---

## Constitution Compliance Check

Before proceeding, verify alignment with core constitutional principles:

- [x] **Long-Term Maintainability:** Billing status enforcement implemented as reusable guard pattern, centralized error messages, clear separation of concerns
- [x] **Security & Correctness:** Tenant self-activation prevention, billing status restrictions enforced at guard level, general rate limiting for login endpoint
- [x] **Explicit Domain Rules:** Clear billing status rules documented, testable guard logic, explicit state transitions
- [x] **Layered Architecture:** Guard layer for enforcement, service layer for business logic, controller layer for HTTP handling
- [x] **Multi-Tenant Isolation:** Billing status restrictions are additive (do not bypass tenant scoping), tenant isolation maintained
- [x] **Data Integrity:** Migration strategy preserves existing data, adds new fields with defaults, backfills existing tenants
- [x] **Professional UI/UX:** Clear billing banners, read-only mode indicators, locked screen for SUSPENDED tenants
- [x] **Performance & Scalability:** Guard adds minimal overhead (<5ms), proper indexing for billing status queries
- [x] **Testing Coverage:** Unit tests for guard logic, integration tests for API endpoints, E2E tests for user flows

---

## Technical Context

### Current State
- Tenant model exists without billing status fields
- Authentication flow validates credentials but does not check billing status
- All mutation endpoints protected by `JwtAuthGuard` and `TenantGuard`
- No rate limiting implemented for authentication endpoints
- Frontend has no billing status awareness or restrictions

### Required Changes
- Add `BillingStatus` enum to Prisma schema
- Add `billingStatus` and `billingStatusUpdatedAt` fields to Tenant model
- Create `BillingStatusGuard` implementing `CanActivate` interface
- Apply guard globally to all routes (except auth routes)
- Update `AuthService.login()` to check billing status before allowing login
- Implement general rate limiting for login endpoint (all tenants)
- Update `/auth/me` endpoint to include billing status
- Create centralized billing error code and message constants (backend-only, no UI strings)
- Frontend creates own constants file for UI strings (banners, tooltips)
- Implement structured logging for billing status changes
- Add key metrics tracking (403 counts, guard execution time, rate limit hits)
- Frontend: billing banner, locked screen, read-only mode indicators, mid-session status change handling

### Dependencies
- Existing Tenant model and Prisma schema
- Existing authentication infrastructure (JWT, guards)
- Existing tenant isolation infrastructure
- Frontend state management (React Query, Context API)

### Integration Points
- Auth service (login flow, `/auth/me` endpoint)
- All mutation endpoints (POST/PATCH/DELETE) via global guard
- Tenants service (prevent billing status updates via API)
- Frontend API client (error handling, status detection)
- Frontend layout components (banner display)
- Frontend form components (read-only mode)

---

## Implementation Phases

### Phase 0: Research & Design

**Goal:** Resolve all technical unknowns and finalize design decisions

**Tasks:**
1. [x] Review existing guard implementation patterns
   - **Finding:** Guards use `CanActivate` interface, applied via `@UseGuards()` decorator or globally
   - **Decision:** Create `BillingStatusGuard` implementing `CanActivate`, apply globally via `APP_GUARD` provider

2. [x] Research rate limiting strategies for NestJS
   - **Finding:** Can use `@nestjs/throttler` package or custom implementation with in-memory cache/Redis
   - **Decision:** Use `@nestjs/throttler` for general login endpoint throttling (all tenants, reasonable limits). Future enhancement can add SUSPENDED-specific throttling if needed.

3. [x] Clarify billing status check performance requirements
   - **Finding:** Guard will query Tenant table once per request
   - **Decision:** Use primary key lookup (`tenantId`), expected overhead <5ms per request

4. [x] Review frontend error handling patterns
   - **Finding:** React Query handles errors via `onError` callbacks, can intercept 403 responses with structured error codes
   - **Decision:** Implement global error interceptor to detect billing lock ONLY via structured error code (`code === "TENANT_BILLING_LOCKED"`). Do not use message text for detection. Redirect to `/billing-locked` (not `/login`), preserve JWT for PAST_DUE status.

**Deliverables:**
- All technical unknowns resolved
- Guard implementation pattern confirmed
- Rate limiting approach selected
- Frontend error handling strategy defined

**Review Points:**
- Guard application strategy approved
- Rate limiting implementation approach validated
- Performance impact acceptable

---

### Phase 1: Database Schema & Migration

**Goal:** Update Prisma schema and create migration with backfill logic

**Tasks:**
1. [ ] Add `BillingStatus` enum to Prisma schema
   - Estimated effort: 15 minutes
   - Dependencies: None
   - Files affected: `backend/prisma/schema.prisma`
   - Add enum: `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`

2. [ ] Add billing status fields to Tenant model
   - Estimated effort: 15 minutes
   - Dependencies: Task 1
   - Files affected: `backend/prisma/schema.prisma`
   - Add `billingStatus BillingStatus @default(TRIAL)`
   - Add `billingStatusUpdatedAt DateTime?`
   - Add index: `@@index([billingStatus])`

3. [ ] Create migration with backfill logic
   - Estimated effort: 1 hour
   - Dependencies: Task 2
   - Files affected: `backend/prisma/migrations/`
   - Add `BillingStatus` enum type
   - Add `billingStatus` column with default `TRIAL`
   - Add `billingStatusUpdatedAt` column (nullable)
   - Backfill existing tenants: set `billingStatus = ACTIVE`, `billingStatusUpdatedAt = createdAt`
   - Create index on `billingStatus`

4. [ ] Test migration on development database
   - Estimated effort: 30 minutes
   - Dependencies: Task 3
   - Verify existing tenants are migrated correctly
   - Verify constraints are applied correctly
   - Test rollback if needed

**Deliverables:**
- Updated Prisma schema
- Migration file with backfill logic
- Migration tested successfully

**Testing:**
- Migration runs successfully on clean database
- Migration runs successfully on database with existing tenants
- Rollback works correctly
- All existing tenants have `billingStatus = ACTIVE` after migration

**Review Points:**
- Schema changes reviewed
- Migration strategy validated (backfill to ACTIVE)
- Index strategy optimized for query patterns

**Risks & Mitigation:**
- **Risk:** Migration fails on production with large tenant dataset
  - **Mitigation:** Test migration on staging database with production-like data volume
- **Risk:** Rollback requires manual data cleanup
  - **Mitigation:** Document rollback steps in migration comments, test rollback in staging

---

### Phase 2: Backend - Core Infrastructure

**Goal:** Create billing status guard, constants, and logging infrastructure

**Tasks:**
1. [ ] Create centralized billing error message constants
   - Estimated effort: 30 minutes
   - Dependencies: None
   - Files affected: `backend/src/common/constants/billing-messages.ts`
   - Export `BILLING_ERROR_CODES` object with error codes (e.g., `TENANT_BILLING_LOCKED`)
   - Export `BILLING_ERROR_MESSAGES` object with server-side Turkish error messages only (for API responses/logs)
   - Backend defines ONLY: error codes and server-side messages
   - Do NOT export UI-facing strings (banners, tooltips, locked screen text) - frontend owns all UI copy

2. [ ] Create `BillingStatusGuard` implementing `CanActivate`
   - Estimated effort: 2 hours
   - Dependencies: Task 1 (constants), Phase 1 (schema)
   - Files affected: `backend/src/auth/guards/billing-status.guard.ts`
   - Extract `tenantId` from JWT token (via `request.user.tenantId`)
   - Query Tenant table to fetch `billingStatus`
   - Allow GET requests for PAST_DUE tenants (read-only)
   - Block POST/PATCH/DELETE requests for PAST_DUE tenants (403 Forbidden with appropriate error message)
   - Block all requests for SUSPENDED tenants (403 Forbidden with error code `TENANT_BILLING_LOCKED`)
   - Response format for SUSPENDED: `{ code: "TENANT_BILLING_LOCKED", message: "..." }`
   - Allow all requests for TRIAL/ACTIVE tenants
   - Log guard execution time if >10ms
   - Log 403 responses with billing status and endpoint

3. [ ] Apply guard globally via `APP_GUARD` provider
   - Estimated effort: 30 minutes
   - Dependencies: Task 2
   - Files affected: `backend/src/app.module.ts`
   - Register `BillingStatusGuard` as `APP_GUARD` provider
   - Exclude auth routes from guard (login, register, refresh token)
   - Ensure guard runs after `JwtAuthGuard` and `TenantGuard`

4. [ ] Implement structured logging for billing status changes
   - Estimated effort: 1 hour
   - Dependencies: None
   - Files affected: `backend/src/common/utils/billing-logger.ts` (new utility)
   - Create utility function to log billing status changes
   - Log format: Structured JSON with timestamp, tenantId, oldStatus, newStatus, correlationId
   - Log level: INFO for normal transitions, WARN for SUSPENDED transitions
   - Integrate with existing logging infrastructure

5. [ ] Implement key metrics logging
   - Estimated effort: 1 hour
   - Dependencies: Task 2 (guard)
   - Files affected: `backend/src/auth/guards/billing-status.guard.ts`
   - Log 403 Forbidden responses by billing status (PAST_DUE, SUSPENDED)
   - Log guard execution time (warn if >10ms)
   - Log rate limit hits for login endpoint (general throttling, all tenants)
   - Use structured JSON format with correlation IDs

**Deliverables:**
- Billing error code and message constants file (backend defines ONLY error codes and server-side messages, no UI strings)
- `BillingStatusGuard` implementation
- Guard applied globally (except auth routes)
- Structured logging utilities
- Metrics logging integrated

**Testing:**
- Unit tests for `BillingStatusGuard` (all state combinations)
- Verify guard excludes auth routes correctly
- Verify logging outputs correct format

**Review Points:**
- Guard logic reviewed (correct state handling)
- Error messages reviewed (Turkish, user-friendly)
- Logging format validated (structured JSON)

**Risks & Mitigation:**
- **Risk:** Guard adds significant performance overhead
  - **Mitigation:** Use primary key lookup, cache tenant billing status in request context, monitor execution time
- **Risk:** Guard blocks legitimate requests due to incorrect logic
  - **Mitigation:** Comprehensive unit tests, integration tests for all endpoints, E2E tests for user flows

---

### Phase 3: Backend - Authentication Flow Updates

**Goal:** Update login and `/auth/me` endpoints to include billing status checks

**Tasks:**
1. [ ] Update `AuthService.login()` to check billing status
   - Estimated effort: 1.5 hours
   - Dependencies: Phase 1 (schema), Phase 2 (constants)
   - Files affected: `backend/src/auth/auth.service.ts`
   - After validating credentials, query Tenant table for `billingStatus`
   - If `billingStatus = SUSPENDED`, throw `ForbiddenException` with:
     - Error code: `BILLING_ERROR_CODES.TENANT_BILLING_LOCKED`
     - Error message: `BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN`
     - Response format: `{ code: "TENANT_BILLING_LOCKED", message: "..." }`
   - If `billingStatus = PAST_DUE`, allow login but include billing status in response
   - If `billingStatus = TRIAL/ACTIVE`, proceed normally
   - Include `billingStatus` in login response

2. [ ] Implement rate limiting for login endpoint
   - Estimated effort: 1.5 hours
   - Dependencies: Task 1
   - Files affected: `backend/src/auth/auth.controller.ts`, `backend/src/app.module.ts`
   - Install `@nestjs/throttler` package if not already installed
   - Configure throttler: Apply general throttling to login endpoint (e.g., 5 attempts per 15 minutes per IP/email)
   - Apply throttler guard to login endpoint (all tenants, not just SUSPENDED)
   - Return 429 Too Many Requests with `BILLING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED`
   - Log rate limit hits for monitoring
   - **Note:** Future enhancement could add SUSPENDED-specific throttling with stricter limits

3. [ ] Update `/auth/me` endpoint to include billing status
   - Estimated effort: 1 hour
   - Dependencies: Phase 1 (schema), Phase 2 (constants)
   - Files affected: `backend/src/auth/auth.controller.ts`, `backend/src/auth/auth.service.ts`
   - Add `getCurrentUser()` method to `AuthService`
   - Query Tenant table to fetch `billingStatus` and `billingStatusUpdatedAt`
   - Return billing status in response
   - If `billingStatus = SUSPENDED`, return 403 with error code `TENANT_BILLING_LOCKED`:
     - Response format: `{ code: "TENANT_BILLING_LOCKED", message: "..." }`

4. [ ] Update `TenantsService.update()` to reject billing status updates
   - Estimated effort: 1 hour
   - Dependencies: Phase 2 (constants)
   - Files affected: `backend/src/tenants/tenants.service.ts`, `backend/src/tenants/dto/update-tenant.dto.ts`
   - Update `UpdateTenantDto` to explicitly exclude `billingStatus` field
   - Add service-level check: if `billingStatus` in update data, throw `ForbiddenException` with `BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN`
   - Ensure DTO validation rejects `billingStatus` field (via `forbidNonWhitelisted: true`)

**Deliverables:**
- Updated `AuthService.login()` with billing status check
- General rate limiting for login endpoint (all tenants)
- Updated `/auth/me` endpoint with billing status
- `TenantsService.update()` rejects billing status updates

**Testing:**
- Unit tests for `AuthService.login()` (all billing states)
- Unit tests for rate limiting logic
- Unit tests for `TenantsService.update()` billing status rejection
- Integration tests for login endpoint (SUSPENDED, PAST_DUE, ACTIVE)
- Integration tests for `/auth/me` endpoint

**Review Points:**
- Login flow reviewed (correct billing status handling)
- Rate limiting configuration validated (general throttling, not SUSPENDED-specific)
- Self-activation prevention verified

**Risks & Mitigation:**
- **Risk:** Rate limiting blocks legitimate users during maintenance
  - **Mitigation:** Rate limit applies to all tenants with reasonable limits (5 attempts per 15 minutes). Future enhancement can add SUSPENDED-specific throttling if needed.
- **Risk:** Billing status check adds latency to login flow
  - **Mitigation:** Single database query (primary key lookup), expected overhead <5ms

---

### Phase 4: Backend - Testing

**Goal:** Comprehensive test coverage for billing status enforcement

**Tasks:**
1. [ ] Unit tests for `BillingStatusGuard`
   - Estimated effort: 2 hours
   - Dependencies: Phase 2 (guard)
   - Files affected: `backend/src/auth/guards/billing-status.guard.spec.ts`
   - Test: Guard allows ACTIVE tenant requests to proceed
   - Test: Guard allows TRIAL tenant requests to proceed
   - Test: Guard blocks PAST_DUE tenant POST/PATCH/DELETE requests with 403
   - Test: Guard allows PAST_DUE tenant GET requests to proceed
   - Test: Guard blocks SUSPENDED tenant all requests (except auth) with 403
   - Test: Guard extracts tenantId from JWT correctly
   - Test: Guard handles missing tenantId gracefully (returns 401)

2. [ ] Unit tests for `AuthService` billing status checks
   - Estimated effort: 1.5 hours
   - Dependencies: Phase 3 (auth service updates)
   - Files affected: `backend/src/auth/auth.service.spec.ts`
   - Test: `login()` rejects SUSPENDED tenant with 403 and error code `TENANT_BILLING_LOCKED`
   - Test: `login()` allows PAST_DUE tenant (returns billing status)
   - Test: `login()` allows ACTIVE/TRIAL tenant normally
   - Test: Rate limiting blocks login attempts after threshold (general throttling)

3. [ ] Unit tests for `TenantsService` billing status rejection
   - Estimated effort: 1 hour
   - Dependencies: Phase 3 (tenants service updates)
   - Files affected: `backend/src/tenants/tenants.service.spec.ts`
   - Test: `update()` rejects `billingStatus` field in update data
   - Test: `update()` throws 403 Forbidden if `billingStatus` included
   - Test: `update()` allows `name` and `defaultCurrency` updates normally

4. [ ] Integration tests for API endpoints with billing restrictions
   - Estimated effort: 3 hours
   - Dependencies: Phase 2 (guard), Phase 3 (auth updates)
   - Files affected: `backend/test/billing-status.e2e-spec.ts` (new file)
   - Test: POST /api/v1/members returns 403 for PAST_DUE tenant
   - Test: GET /api/v1/members returns 200 for PAST_DUE tenant (read-only)
   - Test: PATCH /api/v1/members/:id returns 403 for PAST_DUE tenant
   - Test: DELETE /api/v1/members/:id returns 403 for PAST_DUE tenant
   - Test: All mutation endpoints return 403 with error code `TENANT_BILLING_LOCKED` for SUSPENDED tenant
   - Test: GET endpoints return 403 with error code `TENANT_BILLING_LOCKED` for SUSPENDED tenant (except /auth/me)
   - Test: POST /api/v1/auth/login returns 403 with error code `TENANT_BILLING_LOCKED` for SUSPENDED tenant
   - Test: POST /api/v1/auth/login returns 200 for PAST_DUE tenant (with billing status)
   - Test: PUT /api/v1/tenants/:id rejects billingStatus field with 403
   - Test: Tenant isolation maintained (billing status restrictions do not bypass tenant scoping)

5. [ ] E2E tests for billing status user flows
   - Estimated effort: 3 hours
   - Dependencies: All backend phases
   - Files affected: `backend/test/billing-status.e2e-spec.ts`
   - Test: **E2E-001:** PAST_DUE tenant can view members but cannot create new member
   - Test: **E2E-002:** PAST_DUE tenant can view plans but cannot update plan
   - Test: **E2E-003:** SUSPENDED tenant cannot login (403 on login endpoint)
   - Test: **E2E-004:** SUSPENDED tenant sees error message on login page
   - Test: **E2E-005:** ACTIVE tenant can perform all CRUD operations normally
   - Test: **E2E-006:** TRIAL tenant can perform all CRUD operations normally
   - Test: **E2E-007:** Tenant cannot update own billingStatus via API (403 Forbidden)
   - Test: **E2E-008:** Database update of billingStatus (PAST_DUE → ACTIVE) immediately allows mutations
   - Test: **E2E-009:** Database update of billingStatus (ACTIVE → SUSPENDED) blocks next login attempt
   - Test: **E2E-010:** Mid-session billing status change (ACTIVE → PAST_DUE) blocks next mutation request

**Deliverables:**
- Unit tests for `BillingStatusGuard` (all state combinations)
- Unit tests for `AuthService` billing status checks
- Unit tests for `TenantsService` billing status rejection
- Integration tests for all API endpoints with billing restrictions
- E2E tests for all user flows

**Testing:**
- All unit tests pass
- All integration tests pass
- All E2E tests pass
- Test coverage >80% for billing status logic

**Review Points:**
- Test coverage reviewed (all states covered)
- Edge cases tested (null billingStatusUpdatedAt, mid-session changes)
- Test data setup validated

**Risks & Mitigation:**
- **Risk:** Tests are flaky due to timing issues
  - **Mitigation:** Use deterministic test data, avoid sleep() calls, use proper async/await patterns
- **Risk:** E2E tests are slow
  - **Mitigation:** Use test database, parallelize tests where possible, focus on critical paths

---

### Phase 5: Frontend - Core Infrastructure

**Goal:** Create billing status constants, types, and error handling infrastructure

**Tasks:**
1. [ ] Add `BillingStatus` enum to shared TypeScript types
   - Estimated effort: 15 minutes
   - Dependencies: Phase 1 (schema)
   - Files affected: `frontend/src/types/billing.ts` (new file)
   - Export `BillingStatus` enum matching backend enum
   - Export `AuthMeResponse` type with billing status fields
   - Export `LoginResponse` type with billing status fields

2. [ ] Create centralized billing constants (frontend-owned)
   - Estimated effort: 30 minutes
   - Dependencies: None
   - Files affected: `frontend/src/lib/constants/billing-messages.ts`
   - Export `BILLING_ERROR_CODES` object with error codes matching backend (e.g., `TENANT_BILLING_LOCKED`)
   - Export `BILLING_BANNER_MESSAGES` for banner component (frontend-owned UI strings)
   - Export `BILLING_TOOLTIP_MESSAGES` for tooltip component (frontend-owned UI strings)
   - Frontend defines its own error code constants (matching backend values) - no imports from backend
   - Frontend owns all UI strings (banners, tooltips, locked screen text)

3. [ ] Update API client types to include billing status
   - Estimated effort: 30 minutes
   - Dependencies: Task 1 (types)
   - Files affected: `frontend/src/api/auth.ts`, `frontend/src/types/auth.ts`
   - Update `LoginResponse` type to include `tenant.billingStatus`
   - Update `AuthMeResponse` type to include `tenant.billingStatus` and `tenant.billingStatusUpdatedAt`

4. [ ] Implement global API error handling for billing status errors
   - Estimated effort: 2 hours
   - Dependencies: Task 2 (constants)
   - Files affected: `frontend/src/lib/api-error-handler.ts` (new utility)
   - Create error interceptor for React Query
   - Detect billing lock ONLY via structured response code: check for `code === "TENANT_BILLING_LOCKED"`
   - Do NOT detect by message text or keywords - error code is the only authoritative source
   - Message text is display-only (non-authoritative)
   - On billing lock detection (`code === "TENANT_BILLING_LOCKED"`):
     - Do NOT redirect to `/login`
     - Redirect to `/billing-locked` (or locked route)
     - Do NOT clear JWT token for PAST_DUE status
     - Optionally clear JWT token for SUSPENDED status (if needed)
   - On other billing errors (PAST_DUE mutation attempts):
     - Show toast notification with appropriate message
     - Do NOT clear JWT or redirect
   - Integrate with existing error handling infrastructure

5. [ ] Update user context/state management to include billing status
   - Estimated effort: 1 hour
   - Dependencies: Task 1 (types), Task 3 (API types)
   - Files affected: `frontend/src/features/auth/types.ts`, `frontend/src/hooks/use-auth.ts` (or similar)
   - Add `billingStatus` to user context/state
   - Update auth hooks to fetch and store billing status
   - Refresh billing status on each API call (via `/auth/me` endpoint)

**Deliverables:**
- Billing status TypeScript types
- Frontend-owned billing constants file (error codes + UI strings)
- Updated API client types
- Global API error handler for billing status errors (detects via error codes, redirects to `/billing-locked`)
- Updated user context with billing status

**Testing:**
- Verify types compile correctly
- Verify error handler intercepts billing errors correctly
- Verify user context stores billing status correctly

**Review Points:**
- Type definitions reviewed (match backend contracts)
- Error handling strategy validated (detects ONLY via structured error code `code === "TENANT_BILLING_LOCKED"`, message text is display-only)
- State management approach approved
- Frontend constants are frontend-owned (frontend defines its own error codes matching backend values, no backend imports)

**Risks & Mitigation:**
- **Risk:** Error handler interferes with other error handling
  - **Mitigation:** Use structured error code detection (`code === "TENANT_BILLING_LOCKED"`), only trigger on billing-related error codes
- **Risk:** State management becomes complex
  - **Mitigation:** Use existing patterns (React Query, Context API), keep billing status in user context
- **Risk:** Frontend imports backend constants causing coupling
  - **Mitigation:** Frontend defines its own error code constants (matching backend values) and owns all UI strings. No imports from backend.

---

### Phase 6: Frontend - UI Components

**Goal:** Create billing banner, locked screen, and read-only mode indicators

**Tasks:**
1. [ ] Create `BillingStatusBanner` component
   - Estimated effort: 2 hours
   - Dependencies: Phase 5 (constants, types)
   - Files affected: `frontend/src/components/billing/BillingStatusBanner.tsx` (new file)
   - Display yellow/orange warning banner for PAST_DUE status
   - Display red error banner for SUSPENDED status
   - Show message from `BILLING_BANNER_MESSAGES`
   - Banner is persistent (does not dismiss automatically)
   - Include contact information or support link (if available)

2. [ ] Create `LockedScreen` component
   - Estimated effort: 1.5 hours
   - Dependencies: Phase 5 (constants, types)
   - Files affected: `frontend/src/components/billing/LockedScreen.tsx` (new file)
   - Full-screen overlay with message: `BILLING_BANNER_MESSAGES.SUSPENDED`
   - Prevents all UI interactions (buttons, forms, navigation disabled)
   - Shows only logout button and support contact information
   - Displayed immediately after login if tenant is SUSPENDED

3. [ ] Create read-only mode utility hooks
   - Estimated effort: 1 hour
   - Dependencies: Phase 5 (user context)
   - Files affected: `frontend/src/hooks/use-billing-status.ts` (new file)
   - Create `useBillingStatus()` hook to get current billing status
   - Create `useIsReadOnly()` hook to check if tenant is in read-only mode (PAST_DUE)
   - Create `useIsSuspended()` hook to check if tenant is suspended

4. [ ] Update layout to show billing banner when needed
   - Estimated effort: 1 hour
   - Dependencies: Task 1 (banner component), Task 3 (hooks)
   - Files affected: `frontend/src/layouts/MainLayout.tsx` (or similar)
   - Add `BillingStatusBanner` component to layout
   - Show banner when `billingStatus = PAST_DUE` or `SUSPENDED`
   - Banner appears on all pages (below header, above main content)

5. [ ] Update all mutation buttons to disable in PAST_DUE mode
   - Estimated effort: 2 hours
   - Dependencies: Task 3 (hooks)
   - Files affected: All pages with create/update/delete buttons
   - Use `useIsReadOnly()` hook to check read-only mode
   - Disable "Create", "Update", "Delete", "Archive" buttons when read-only
   - Add tooltip on hover: `BILLING_TOOLTIP_MESSAGES.PAST_DUE_READ_ONLY`

6. [ ] Add read-only styling to forms in PAST_DUE mode
   - Estimated effort: 2 hours
   - Dependencies: Task 3 (hooks)
   - Files affected: All form components
   - Use `useIsReadOnly()` hook to check read-only mode
   - Disable form inputs (read-only styling)
   - Hide or disable action buttons in forms

7. [ ] Implement locked screen routing for SUSPENDED tenants
   - Estimated effort: 1 hour
   - Dependencies: Task 2 (locked screen), Task 3 (hooks)
   - Files affected: `frontend/src/App.tsx` or router configuration
   - Create route: `/billing-locked` (or `/locked`)
   - Check billing status on route change
   - If `billingStatus = SUSPENDED`, redirect to `/billing-locked`
   - All routes redirect to `/billing-locked` for SUSPENDED tenants
   - Locked screen route should be accessible without redirecting to login

**Deliverables:**
- `BillingStatusBanner` component
- `LockedScreen` component (displayed at `/billing-locked` route)
- Read-only mode utility hooks
- Updated layout with billing banner
- All mutation buttons disabled in read-only mode
- All forms styled for read-only mode
- Locked screen routing for SUSPENDED tenants (redirects to `/billing-locked`, not `/login`)

**Testing:**
- Test banner displays correctly for PAST_DUE and SUSPENDED tenants
- Test locked screen prevents UI interactions
- Test read-only mode disables buttons and forms correctly
- Test routing redirects SUSPENDED tenants to locked screen

**Review Points:**
- UI components reviewed (design, accessibility)
- Read-only mode indicators consistent across pages
- Locked screen UX validated

**Risks & Mitigation:**
- **Risk:** Banner is intrusive and affects UX
  - **Mitigation:** Use subtle styling, persistent but not blocking, can be dismissed in future enhancement
- **Risk:** Read-only mode indicators are inconsistent
  - **Mitigation:** Create shared utility hooks, use consistent styling patterns, code review for consistency

---

### Phase 7: Frontend - Error Handling & State Management

**Goal:** Implement mid-session billing status change handling and error display

**Tasks:**
1. [ ] Update error handling to show billing-specific messages
   - Estimated effort: 1 hour
   - Dependencies: Phase 5 (error handler), Phase 5 (constants)
   - Files affected: `frontend/src/lib/api-error-handler.ts`
   - Intercept 403 responses from mutation endpoints
   - Detect billing lock ONLY via structured response code: check for `code === "TENANT_BILLING_LOCKED"`
   - Do NOT check message text or keywords - error code is the only authoritative source
   - Message text is display-only (non-authoritative)
   - For `code === "TENANT_BILLING_LOCKED"`: redirect to `/billing-locked` (handled in Task 4)
   - For other billing-related errors: show toast notification with appropriate message
   - Do not show technical error details

2. [ ] Implement mid-session billing status change detection
   - Estimated effort: 2 hours
   - Dependencies: Phase 5 (error handler), Phase 6 (routing)
   - Files affected: `frontend/src/lib/api-error-handler.ts`
   - When API returns 403 with `code === "TENANT_BILLING_LOCKED"`:
     - Detect billing lock ONLY via structured error code (not message text or keywords)
     - Error code is the only authoritative source for detection
     - For SUSPENDED status:
       - Optionally clear JWT token from storage (if needed)
       - Redirect to `/billing-locked` (NOT `/login`)
     - For PAST_DUE status:
       - Do NOT clear JWT token (user remains logged in)
       - Do NOT redirect to login (user can still view data)
       - Show toast notification explaining read-only mode
   - Invalidate user session cache (React Query cache, user context) as needed
   - Ensure this works for both PAST_DUE and SUSPENDED transitions

3. [ ] Update React Query cache invalidation on logout
   - Estimated effort: 30 minutes
   - Dependencies: Phase 5 (user context)
   - Files affected: `frontend/src/hooks/use-auth.ts` (or logout handler)
   - Invalidate billing status cache on logout
   - Clear billing status from user context

4. [ ] Refresh billing status after successful login
   - Estimated effort: 30 minutes
   - Dependencies: Phase 5 (user context), Phase 5 (API types)
   - Files affected: `frontend/src/hooks/use-auth.ts` (or login handler)
   - After successful login, fetch billing status from login response
   - Store billing status in user context
   - Trigger appropriate UI (banner, locked screen) based on status

**Deliverables:**
- Updated error handling with billing-specific messages (detects ONLY via structured error code `code === "TENANT_BILLING_LOCKED"`, message text is display-only)
- Mid-session billing status change detection and handling (detects via error code only, redirects to `/billing-locked` for SUSPENDED, preserves JWT for PAST_DUE)
- Cache invalidation on logout
- Billing status refresh on login

**Testing:**
- Test error messages display correctly for billing errors
- Test mid-session status change triggers session invalidation
- Test cache invalidation on logout
- Test billing status refresh on login

**Review Points:**
- Error handling strategy validated
- Mid-session change handling reviewed
- State management approach approved

**Risks & Mitigation:**
- **Risk:** Mid-session change detection is unreliable
  - **Mitigation:** Detect ONLY via structured error code (`code === "TENANT_BILLING_LOCKED"`), do not use message text. Test all transition scenarios, log detection events.
- **Risk:** Cache invalidation causes UI flicker
  - **Mitigation:** Use React Query's `invalidateQueries()` properly, handle loading states gracefully
- **Risk:** Clearing JWT for PAST_DUE breaks read-only access
  - **Mitigation:** Do NOT clear JWT for PAST_DUE status, only redirect SUSPENDED tenants to `/billing-locked`

---

### Phase 8: Frontend - Testing

**Goal:** Test frontend billing status UI and error handling

**Tasks:**
1. [ ] Test PAST_DUE tenant UI (banner, disabled buttons, read-only forms)
   - Estimated effort: 1 hour
   - Dependencies: All frontend phases
   - Manual testing:
     - Login as PAST_DUE tenant
     - Verify warning banner displays
     - Verify create/update/delete buttons are disabled
     - Verify forms are read-only
     - Verify tooltips display correctly

2. [ ] Test SUSPENDED tenant UI (locked screen, login rejection)
   - Estimated effort: 1 hour
   - Dependencies: All frontend phases
   - Manual testing:
     - Attempt login as SUSPENDED tenant
     - Verify login is rejected with error message
     - Verify locked screen displays if somehow logged in

3. [ ] Test mid-session status change flow (ACTIVE → PAST_DUE/SUSPENDED triggers appropriate handling)
   - Estimated effort: 1 hour
   - Dependencies: All frontend phases
   - Manual testing:
     - Login as ACTIVE tenant
     - Update billing status to PAST_DUE in database
     - Attempt to create/update record
     - Verify mutation is blocked (403 with appropriate error)
     - Verify JWT is preserved (user remains logged in, can view data)
     - Verify read-only mode indicators appear
     - Update billing status to SUSPENDED in database
     - Attempt any API request
     - Verify redirects to `/billing-locked` (not `/login`) when error code `TENANT_BILLING_LOCKED` is detected

**Deliverables:**
- Manual test results documented
- All UI flows tested and verified

**Testing:**
- All manual tests pass
- UI behaves correctly for all billing states
- Error handling works correctly

**Review Points:**
- Test results reviewed
- UI behavior validated
- Error handling verified

---

### Phase 9: Operations Documentation

**Goal:** Create runbook for manual billing state management and rollback procedures

**Tasks:**
1. [ ] Create manual DB update runbook
   - Estimated effort: 2 hours
   - Dependencies: Phase 1 (migration)
   - Files affected: `specs/006-tenant-access-control/operations-runbook.md` (new file)
   - Document Prisma Studio steps for updating billing status
   - Document SQL examples for updating billing status
   - Document billing status transition rules
   - Include examples for common scenarios:
     - Activate tenant (SUSPENDED → ACTIVE)
     - Mark payment overdue (ACTIVE → PAST_DUE)
     - Suspend tenant (PAST_DUE → SUSPENDED)
   - Include safety checks (verify tenant exists, verify current status)

2. [ ] Document safe rollback considerations
   - Estimated effort: 1 hour
   - Dependencies: Phase 1 (migration)
   - Files affected: `specs/006-tenant-access-control/operations-runbook.md`
   - Document migration rollback steps
   - Document data rollback procedures (if billing status needs to be reverted)
   - Document impact of rollback on tenant access
   - Include SQL scripts for rollback scenarios

3. [ ] Create troubleshooting guide
   - Estimated effort: 1 hour
   - Dependencies: All phases
   - Files affected: `specs/006-tenant-access-control/operations-runbook.md`
   - Document common issues and solutions:
     - Tenant cannot login (check billing status)
     - Tenant cannot create records (check billing status)
     - Billing status not updating (check database constraints)
   - Document how to verify billing status enforcement is working
   - Document how to check logs for billing status changes

**Deliverables:**
- Operations runbook with manual DB update steps
- Rollback procedures documented
- Troubleshooting guide

**Review Points:**
- Runbook reviewed (clear, accurate)
- Rollback procedures validated
- Troubleshooting guide complete

**Risks & Mitigation:**
- **Risk:** Manual DB updates cause data corruption
  - **Mitigation:** Document safety checks, provide SQL examples with WHERE clauses, require approval for production updates
- **Risk:** Rollback procedures are unclear
  - **Mitigation:** Test rollback in staging, document step-by-step procedures, include SQL scripts

---

## Testing Strategy

### Test Order (Unit → Integration → E2E)

**Phase 1: Unit Tests**
- Test `BillingStatusGuard` logic in isolation
- Test `AuthService` billing status checks
- Test `TenantsService` billing status rejection
- Mock dependencies (Prisma, JWT)

**Phase 2: Integration Tests**
- Test API endpoints with billing restrictions
- Test authentication flow with billing status
- Use test database, real Prisma client
- Test tenant isolation maintained

**Phase 3: E2E Tests**
- Test complete user flows (login, create member, etc.)
- Test billing status transitions
- Use test database, real HTTP requests
- Test frontend + backend integration

### Test Coverage Requirements

**Backend:**
- `BillingStatusGuard`: 100% coverage (all state combinations)
- `AuthService.login()`: 100% coverage (all billing states)
- `TenantsService.update()`: 100% coverage (billing status rejection)
- Integration tests: All mutation endpoints covered
- E2E tests: Minimum 10 test cases (as specified in spec)

**Frontend:**
- Manual testing: All UI flows tested
- Error handling: All error scenarios tested
- State management: Billing status storage and refresh tested

---

## Risks & Mitigation

### Security Risks

**Risk 1: Tenant Self-Activation**
- **Likelihood:** Low (multiple layers of prevention)
- **Impact:** High (billing bypass)
- **Mitigation:**
  - DTO validation rejects `billingStatus` field
  - Service layer checks and rejects `billingStatus` updates
  - Database updates only via manual process (documented)
  - Code review required for any billing status update code

**Risk 2: Billing Status Bypass**
- **Likelihood:** Low (guard applied globally)
- **Impact:** High (unauthorized access)
- **Mitigation:**
  - Guard applied globally via `APP_GUARD` provider
  - Guard runs after authentication guards
  - Integration tests verify all endpoints are protected
  - E2E tests verify restrictions work end-to-end

**Risk 3: Rate Limiting Bypass**
- **Likelihood:** Low (throttler applied correctly)
- **Impact:** Medium (brute-force attacks)
- **Mitigation:**
  - General rate limiting applied to login endpoint (all tenants, IP/email-based) with reasonable limits
  - Use `@nestjs/throttler` with proper configuration
  - Monitor rate limit hits in logs
  - Test rate limiting in integration tests
  - Future enhancement: Can add SUSPENDED-specific throttling with stricter limits if needed

### Performance Risks

**Risk 1: Guard Adds Latency**
- **Likelihood:** Low (single primary key lookup)
- **Impact:** Medium (slow API responses)
- **Mitigation:**
  - Use primary key lookup (`tenantId`)
  - Cache billing status in request context (avoid duplicate queries)
  - Monitor guard execution time (log if >10ms)
  - Consider Redis cache if needed (future optimization)

**Risk 2: Database Query Overhead**
- **Likelihood:** Low (indexed queries)
- **Impact:** Low (minimal overhead)
- **Mitigation:**
  - Index on `billingStatus` for future admin queries
  - Single query per request (no N+1)
  - Monitor query performance

### Data Integrity Risks

**Risk 1: Migration Fails on Production**
- **Likelihood:** Low (tested migration)
- **Impact:** High (system unavailable)
- **Mitigation:**
  - Test migration on staging database with production-like data
  - Document rollback procedures
  - Backfill existing tenants to ACTIVE (safe default)
  - Run migration during maintenance window

**Risk 2: Billing Status Data Corruption**
- **Likelihood:** Low (enum constraint prevents invalid values)
- **Impact:** Medium (incorrect access restrictions)
- **Mitigation:**
  - Database enum constraint prevents invalid values
  - Application-level validation
  - Log all billing status changes
  - Manual DB updates require approval

### UX Risks

**Risk 1: Billing Banner Intrusive**
- **Likelihood:** Medium (persistent banner)
- **Impact:** Low (UX annoyance)
- **Mitigation:**
  - Use subtle styling (yellow/orange for warning, red for error)
  - Banner is informative, not blocking
  - Future enhancement: allow dismissal

**Risk 2: Read-Only Mode Confusing**
- **Likelihood:** Medium (users may not understand restrictions)
- **Impact:** Medium (user frustration)
- **Mitigation:**
  - Clear tooltips explaining restrictions
  - Consistent read-only indicators across pages
  - Error messages explain why actions are blocked
  - Support contact information in banner

---

## Validation Checklist

### Phase 1: Database Schema & Migration
- [ ] Prisma schema updated with `BillingStatus` enum
- [ ] Tenant model includes `billingStatus` and `billingStatusUpdatedAt` fields
- [ ] Index created on `billingStatus`
- [ ] Migration file created with backfill logic
- [ ] Migration tested on development database
- [ ] All existing tenants have `billingStatus = ACTIVE` after migration
- [ ] Rollback tested successfully

### Phase 2: Backend - Core Infrastructure
- [ ] Billing error code and message constants file created (backend defines ONLY error codes and server-side messages, no UI strings)
- [ ] `BillingStatusGuard` implemented and tested
- [ ] Guard applied globally (except auth routes)
- [ ] Structured logging utilities created
- [ ] Metrics logging integrated in guard
- [ ] All unit tests pass

### Phase 3: Backend - Authentication Flow Updates
- [ ] `AuthService.login()` checks billing status
- [ ] General rate limiting implemented for login endpoint (all tenants)
- [ ] `/auth/me` endpoint includes billing status
- [ ] `TenantsService.update()` rejects billing status updates
- [ ] All unit tests pass
- [ ] All integration tests pass

### Phase 4: Backend - Testing
- [ ] Unit tests for `BillingStatusGuard` (all states)
- [ ] Unit tests for `AuthService` billing checks
- [ ] Unit tests for `TenantsService` billing rejection
- [ ] Integration tests for all API endpoints
- [ ] E2E tests for all user flows (minimum 10 tests)
- [ ] Test coverage >80% for billing logic

### Phase 5: Frontend - Core Infrastructure
- [ ] Billing status TypeScript types created
- [ ] Frontend-owned billing constants file created (frontend defines its own error codes matching backend values + UI strings)
- [ ] API client types updated
- [ ] Global API error handler implemented (detects ONLY via structured error code `code === "TENANT_BILLING_LOCKED"`, message text is display-only, redirects to `/billing-locked`)
- [ ] User context includes billing status
- [ ] All types compile correctly

### Phase 6: Frontend - UI Components
- [ ] `BillingStatusBanner` component created
- [ ] `LockedScreen` component created (displayed at `/billing-locked` route)
- [ ] Read-only mode utility hooks created
- [ ] Layout updated with billing banner
- [ ] All mutation buttons disabled in read-only mode
- [ ] All forms styled for read-only mode
- [ ] Locked screen routing implemented (redirects to `/billing-locked`, not `/login`)

### Phase 7: Frontend - Error Handling & State Management
- [ ] Error handling shows billing-specific messages (detects ONLY via structured error code `code === "TENANT_BILLING_LOCKED"`, message text is display-only)
- [ ] Mid-session billing status change detection implemented (detects via error code only, redirects to `/billing-locked` for SUSPENDED, preserves JWT for PAST_DUE)
- [ ] Cache invalidation on logout works
- [ ] Billing status refresh on login works
- [ ] All error scenarios tested

### Phase 8: Frontend - Testing
- [ ] PAST_DUE tenant UI tested (banner, disabled buttons, read-only forms)
- [ ] SUSPENDED tenant UI tested (locked screen, login rejection)
- [ ] Mid-session status change flow tested
- [ ] All manual tests pass

### Phase 9: Operations Documentation
- [ ] Manual DB update runbook created
- [ ] Rollback procedures documented
- [ ] Troubleshooting guide created
- [ ] All documentation reviewed

---

## Success Criteria

### Technical Metrics
- [ ] All tests pass (unit + integration + E2E)
- [ ] Billing status check adds <5ms overhead per API request
- [ ] 100% of mutation endpoints enforce billing status restrictions
- [ ] Test coverage >80% for billing status logic
- [ ] Zero tenant self-activation attempts succeed

### Functional Metrics
- [ ] PAST_DUE tenants receive 403 Forbidden on all mutation attempts
- [ ] SUSPENDED tenants receive 403 Forbidden on all API requests (except authentication)
- [ ] ACTIVE and TRIAL tenants have full access to all features
- [ ] SUSPENDED tenants cannot login (403 Forbidden on login endpoint)
- [ ] PAST_DUE tenants can login but see warning banner and read-only restrictions

### UX Metrics
- [ ] PAST_DUE tenants see persistent warning banner on all pages
- [ ] PAST_DUE tenants see disabled buttons and read-only form styling
- [ ] SUSPENDED tenants see locked screen after login attempt
- [ ] Error messages are clear and in Turkish
- [ ] Frontend gracefully handles billing status changes mid-session

---

## Rollout Strategy

### Pre-Deployment
1. Complete all implementation phases
2. Run full test suite (unit + integration + E2E)
3. Code review for all changes
4. Test migration on staging database
5. Verify rollback procedures work

### Deployment
1. **Maintenance Window:** Schedule deployment during low-traffic period
2. **Database Migration:** Run Prisma migration to add billing status fields
3. **Backend Deployment:** Deploy backend with billing status guard and auth updates
4. **Frontend Deployment:** Deploy frontend with billing UI components
5. **Verification:** Verify billing status enforcement is working
6. **Monitoring:** Monitor logs for billing status changes and errors

### Post-Deployment
1. Monitor error rates (403 responses by billing status)
2. Monitor guard execution time (alert if >10ms)
3. Monitor rate limit hits for login endpoint (general throttling, all tenants)
4. Verify tenant access restrictions are working correctly
5. Update existing tenants' billing status as needed (via manual DB updates)
6. Verify error codes are returned correctly (`TENANT_BILLING_LOCKED` for SUSPENDED)

---

## Future Enhancements

**Automated Billing Integration:**
- Integrate Stripe/iyzico for automatic payment processing
- Webhook handlers for payment success/failure events
- Automatic billing state transitions

**Platform Admin UI:**
- Admin dashboard for viewing all tenants and billing statuses
- Admin interface for updating tenant billing status
- Billing status change history and audit log

**Email Notifications:**
- Send email when tenant transitions to PAST_DUE
- Send email when tenant transitions to SUSPENDED
- Payment reminder emails before due date

**Grace Period Logic:**
- Configurable grace period before SUSPENDED
- Automatic transition: PAST_DUE → SUSPENDED after grace period
- Scheduled job to check and update billing statuses daily

---

**End of Implementation Plan**

