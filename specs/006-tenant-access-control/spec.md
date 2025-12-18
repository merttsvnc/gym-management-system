# Feature Specification: Tenant Access Control (Manual Billing)

**Version:** 1.0.0  
**Author:** System Architect  
**Date:** 2025-12-17  
**Status:** Draft

---

## Overview

### Purpose

The Tenant Access Control module implements billing state-based access restrictions for tenants in the Gym Management System. This feature ensures that tenants who have not paid their subscription fees are restricted from using the system, with graduated restrictions based on billing state (read-only access for overdue tenants, full blocking for suspended tenants).

This module provides the foundation for manual billing workflows where payments are collected offline (cash or bank transfer) and tenant access is controlled via database updates. The design is future-proof and can be extended to automated billing integrations (Stripe, iyzico, etc.) without architectural changes.

### Scope

**What IS included:**

- Tenant billing state field (`billingStatus`) with enum values: TRIAL, ACTIVE, PAST_DUE, SUSPENDED
- Backend enforcement of access restrictions at API level (guards/middleware)
- Read-only mode for PAST_DUE tenants (can view data, cannot create/update/delete)
- Full blocking for SUSPENDED tenants (all API requests rejected except authentication)
- Frontend UX indicators (banner notifications, locked screens, redirects)
- Manual billing state management via database (Prisma Studio or SQL)
- Tenant cannot self-activate (security enforcement)
- Billing state validation in authentication flow
- Clear error messages indicating billing state restrictions

**What is NOT included:**

- Payment provider integration (Stripe, iyzico, etc.)
- Online payment processing for tenant subscriptions
- Automated billing state transitions (no scheduled jobs or webhooks)
- Accounting or revenue tracking features
- Invoice generation or billing history
- Platform admin UI for managing tenant billing states
- Email notifications for billing state changes
- Grace period logic or automatic suspension scheduling
- Payment retry mechanisms or dunning workflows

### Constitution Alignment

This feature aligns with multiple constitutional principles:

- **Principle 6 (Multi-Tenant SaaS):** Maintains tenant isolation while adding billing state enforcement layer
- **Principle 1 (Long-Term Maintainability):** Clean separation of billing state from business logic enables future payment integrations
- **Principle 3 (Explicit Domain Rules):** Clear, testable rules for access restrictions per billing state
- **Principle 5 (Modular Architecture):** Billing state enforcement implemented as reusable guard/middleware pattern
- **Principle 9 (Security):** Prevents tenant self-activation, enforces restrictions at multiple layers

---

## Domain Model

### Entities

#### Tenant (Modified)

The existing `Tenant` entity is extended with billing state fields:

```typescript
interface Tenant {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  planKey: PlanKey;
  billingStatus: BillingStatus; // NEW: Enum field
  billingStatusUpdatedAt: DateTime?; // NEW: Timestamp of last status change
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

#### BillingStatus Enum

```typescript
enum BillingStatus {
  TRIAL = 'TRIAL',        // New tenant, trial period active
  ACTIVE = 'ACTIVE',      // Paid and current, full access
  PAST_DUE = 'PAST_DUE', // Payment overdue, read-only access
  SUSPENDED = 'SUSPENDED' // Payment severely overdue, fully blocked
}
```

### Business Rules

**Rule 1: Billing State Access Restrictions**

- **TRIAL:** Full access (same as ACTIVE). All CRUD operations allowed.
- **ACTIVE:** Full access. All CRUD operations allowed.
- **PAST_DUE:** Read-only access. GET requests allowed, POST/PATCH/DELETE requests blocked with 403 Forbidden.
- **SUSPENDED:** Fully blocked. All API requests except authentication blocked with 403 Forbidden.

**Rule 2: Tenant Self-Activation Prevention**

- Tenants CANNOT modify their own `billingStatus` via API endpoints.
- Only direct database updates (Prisma Studio, SQL) can change billing status.
- Any attempt to update `billingStatus` via API returns 403 Forbidden with message: `BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN`

**Rule 3: Authentication Flow Billing Check**

- During login, system checks tenant's `billingStatus`.
- If `billingStatus = SUSPENDED`, login is rejected with 403 Forbidden and message: `BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN`
- If `billingStatus = PAST_DUE`, login succeeds but user sees banner notification and read-only restrictions apply.
- If `billingStatus = TRIAL` or `ACTIVE`, login proceeds normally.
- **Rate Limiting:** SUSPENDED tenant login attempts are rate-limited to prevent abuse:
  - Maximum 3 login attempts per 15-minute window per tenant (identified by email or tenantId)
  - After rate limit exceeded, return 429 Too Many Requests with message: "Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin."
  - Rate limit applies only to SUSPENDED tenants (ACTIVE/PAST_DUE/TRIAL tenants not rate-limited)

**Rule 4: Read-Only Mode Behavior**

- In PAST_DUE state, tenants can:
  - View all data (members, plans, branches, dashboard)
  - Export data (if export features exist)
  - Navigate the UI normally
- In PAST_DUE state, tenants CANNOT:
  - Create new records (members, plans, branches)
  - Update existing records
  - Delete records
  - Archive/restore records
  - Perform any mutation operations

**Rule 5: Billing State Transitions**

- State transitions are manual (via database updates).
- No automatic transitions (no scheduled jobs).
- Valid transitions:
  - TRIAL → ACTIVE (trial ends, payment received)
  - ACTIVE → PAST_DUE (payment overdue)
  - PAST_DUE → ACTIVE (payment received)
  - PAST_DUE → SUSPENDED (payment severely overdue)
  - SUSPENDED → ACTIVE (payment received, account reactivated)
- Invalid transitions (handled gracefully):
  - ACTIVE → TRIAL (not allowed, business rule)
  - SUSPENDED → PAST_DUE (not allowed, must go through ACTIVE)

**Rule 6: Billing Status Timestamp**

- `billingStatusUpdatedAt` is automatically set when `billingStatus` changes.
- Used for audit trail and reporting.
- Can be null for tenants created before this feature (migration sets to `createdAt`).

**Rule 7: Error Message Standardization**

- All billing-related error messages MUST be centralized in a constants file.
- Backend: Create `backend/src/common/constants/billing-messages.ts`
- Frontend: Create `frontend/src/lib/constants/billing-messages.ts`
- Both files export the same message constants to ensure consistency.
- Error messages are in Turkish and user-friendly.
- Centralized messages enable easy updates and maintain consistency across the application.

**Centralized Error Messages:**

```typescript
// backend/src/common/constants/billing-messages.ts
export const BILLING_ERROR_MESSAGES = {
  SUSPENDED_LOGIN: "Hesabınız ödeme yapılmadığı için askıya alınmıştır. Lütfen destek ile iletişime geçin.",
  PAST_DUE_MUTATION: "Hesabınızın ödemesi gecikmiş. Yalnızca görüntüleme erişiminiz bulunmaktadır. Lütfen ödemenizi tamamlayın.",
  SUSPENDED_MUTATION: "Hesabınız ödeme yapılmadığı için askıya alınmıştır. Lütfen destek ile iletişime geçin.",
  BILLING_STATUS_UPDATE_FORBIDDEN: "Faturalama durumu yalnızca sistem yöneticileri tarafından güncellenebilir.",
  STATUS_CHANGED_MID_SESSION: "Hesabınızın durumu değişti. Lütfen tekrar giriş yapın.",
  RATE_LIMIT_EXCEEDED: "Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.",
} as const;

// Frontend banner messages
export const BILLING_BANNER_MESSAGES = {
  PAST_DUE: "Ödemeniz gecikmiştir. Hesabınız salt okunur moddadır. Lütfen ödemenizi tamamlayın.",
  SUSPENDED: "Hesabınız askıya alınmıştır. Lütfen destek ile iletişime geçin.",
} as const;

// Frontend tooltip messages
export const BILLING_TOOLTIP_MESSAGES = {
  PAST_DUE_READ_ONLY: "Ödemeniz gecikmiş. Yalnızca görüntüleme erişiminiz bulunmaktadır.",
} as const;
```

---

## Success Criteria

The Tenant Access Control module will be considered successful when:

1. **Billing State Enforcement:**
   - 100% of mutation endpoints (POST/PATCH/DELETE) enforce billing status restrictions
   - PAST_DUE tenants receive 403 Forbidden on all mutation attempts
   - SUSPENDED tenants receive 403 Forbidden on all API requests (except authentication)
   - ACTIVE and TRIAL tenants have full access to all features
   - Billing status check adds less than 5ms overhead per API request

2. **Authentication Flow:**
   - SUSPENDED tenants cannot login (403 Forbidden on login endpoint)
   - PAST_DUE tenants can login but see warning banner and read-only restrictions
   - ACTIVE and TRIAL tenants login normally without restrictions
   - Login response includes billing status for frontend decision-making

3. **Security:**
   - Tenants cannot update their own billing status via API (403 Forbidden)
   - Billing status can only be changed via direct database updates
   - Billing status restrictions do not bypass tenant isolation (cross-tenant access still blocked)
   - All billing status checks occur at guard/middleware level (before service layer)

4. **User Experience:**
   - PAST_DUE tenants see persistent warning banner on all pages
   - PAST_DUE tenants see disabled buttons and read-only form styling
   - SUSPENDED tenants see locked screen after login attempt
   - Error messages are clear and in Turkish, explaining billing restrictions
   - Frontend gracefully handles billing status changes mid-session

5. **Read-Only Mode:**
   - PAST_DUE tenants can view all data (members, plans, branches, dashboard)
   - PAST_DUE tenants cannot create, update, or delete any records
   - Read-only indicators are consistent across all pages
   - Export functionality (if exists) remains available for PAST_DUE tenants

6. **Testing Coverage:**
   - Minimum 10 E2E test cases covering all billing states and transitions
   - Unit tests for BillingStatusGuard covering all state combinations
   - Integration tests for all mutation endpoints with billing restrictions
   - Edge cases tested (null billingStatusUpdatedAt, mid-session status changes)

7. **Migration Success:**
   - All existing tenants receive default billing status (ACTIVE) during migration
   - Migration sets billingStatusUpdatedAt to createdAt for existing tenants
   - No data loss occurs during migration
   - Post-migration, all tenants have valid billing status values

---

## API Specification

### Endpoints

#### GET /api/v1/auth/me (Modified)

**Purpose:** Returns current user information including tenant billing status

**Authorization:** Authenticated user

**Response:**
```typescript
interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    tenantId: string;
  };
  tenant: {
    id: string;
    name: string;
    billingStatus: BillingStatus;
    billingStatusUpdatedAt: DateTime | null;
  };
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized (not authenticated)
- 403: Forbidden (if SUSPENDED, login rejected)

**Behavior:**
- If tenant is SUSPENDED, this endpoint returns 403 before returning user data.
- Frontend uses this endpoint to determine billing state and show appropriate UI.

#### POST /api/v1/auth/login (Modified)

**Purpose:** Authenticate user and return JWT token

**Authorization:** Public (unauthenticated)

**Request:**
```typescript
interface LoginRequest {
  email: string;
  password: string;
}
```

**Response:**
```typescript
interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    tenantId: string;
  };
  tenant: {
    id: string;
    name: string;
    billingStatus: BillingStatus;
  };
}
```

**Status Codes:**
- 200: Success (login allowed)
- 401: Invalid credentials
- 403: Account suspended (billingStatus = SUSPENDED)
- 429: Too Many Requests (rate limit exceeded for SUSPENDED tenant)

**Error Responses:**
```typescript
// SUSPENDED tenant login attempt
{
  statusCode: 403,
  message: BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN
}

// Rate limit exceeded for SUSPENDED tenant
{
  statusCode: 429,
  message: BILLING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED
}
```

**Behavior:**
- Validates credentials first.
- If credentials valid but tenant is SUSPENDED, returns 403.
- If credentials valid and tenant is PAST_DUE, login succeeds but frontend shows banner.
- If credentials valid and tenant is TRIAL/ACTIVE, login proceeds normally.

#### All Mutation Endpoints (POST, PATCH, DELETE)

**Purpose:** All endpoints that modify data (create, update, delete operations)

**Authorization:** Authenticated user (existing guards)

**Status Codes:**
- 200/201/204: Success (if billingStatus allows mutation)
- 400: Validation error
- 401: Unauthorized
- 403: Forbidden (billingStatus = PAST_DUE or SUSPENDED)
- 404: Not found

**Error Responses:**
```typescript
// PAST_DUE tenant attempting mutation
{
  statusCode: 403,
  message: BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION
}

// SUSPENDED tenant attempting any API call
{
  statusCode: 403,
  message: BILLING_ERROR_MESSAGES.SUSPENDED_MUTATION
}
```

**Behavior:**
- New `BillingStatusGuard` checks tenant billing status before allowing mutation.
- Applied globally to all POST/PATCH/DELETE endpoints (except auth endpoints).
- GET endpoints are not blocked (read-only access for PAST_DUE).

#### PUT /api/v1/tenants/:id (Modified)

**Purpose:** Update tenant settings

**Authorization:** ADMIN role

**Request:**
```typescript
interface UpdateTenantRequest {
  name?: string;
  defaultCurrency?: string;
  billingStatus?: BillingStatus; // ❌ BLOCKED
}
```

**Status Codes:**
- 200: Success
- 400: Validation error (if billingStatus included)
- 403: Forbidden (if billingStatus included, or if tenant is PAST_DUE/SUSPENDED)

**Error Responses:**
```typescript
// Attempt to update billingStatus via API
{
  statusCode: 403,
  message: BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN
}
```

**Behavior:**
- DTO validation rejects `billingStatus` field if present in request.
- Service layer also checks and rejects `billingStatus` updates.
- Only `name` and `defaultCurrency` can be updated via API.

---

## Data Model (Prisma Schema)

```prisma
// Billing status enum
enum BillingStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  SUSPENDED
}

// Tenant model (modified)
model Tenant {
  id                    String         @id @default(cuid())
  name                  String
  slug                  String         @unique
  defaultCurrency       String         @default("USD")
  planKey               PlanKey        @default(SINGLE)
  billingStatus         BillingStatus  @default(TRIAL) // NEW
  billingStatusUpdatedAt DateTime?     // NEW
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  // Relations
  branches        Branch[]
  users           User[]
  members         Member[]
  membershipPlans MembershipPlan[]

  @@index([slug])
  @@index([billingStatus]) // NEW: For filtering queries
}
```

### Migration Considerations

**Migration Strategy:**

1. Add `BillingStatus` enum to Prisma schema.
2. Add `billingStatus` column to `Tenant` table with default `TRIAL`.
3. Add `billingStatusUpdatedAt` column as nullable DateTime.
4. Backfill existing tenants:
   - Set `billingStatus = ACTIVE` for all existing tenants (assume they are current).
   - Set `billingStatusUpdatedAt = createdAt` for existing tenants.
5. Create index on `billingStatus` for query performance.
6. No data loss risk (additive changes only).

**Backward Compatibility:**

- Existing tenants default to `TRIAL` (or `ACTIVE` via migration backfill).
- No breaking changes to existing API contracts.
- Frontend gracefully handles missing billing status (treats as ACTIVE).

**Index Strategy:**

- `@@index([billingStatus])`: Enables efficient queries for filtering tenants by billing status (future admin features).
- Composite indexes not needed for initial implementation (single-tenant queries use `tenantId`).

---

## Frontend Specification

### User Interface

#### Billing Status Banner Component

**Purpose:** Display billing status warnings to users

**Location:** Top of application layout (below header, above main content)

**Design:**
- **PAST_DUE:** Yellow/orange warning banner with message: `BILLING_BANNER_MESSAGES.PAST_DUE`
- **SUSPENDED:** Red error banner with message: `BILLING_BANNER_MESSAGES.SUSPENDED`
- **TRIAL/ACTIVE:** No banner displayed

**Behavior:**
- Banner is persistent (does not dismiss automatically).
- Banner appears on all pages when billing status requires it.
- Banner includes contact information or support link (if available).

#### Locked Screen Component

**Purpose:** Block UI interaction for SUSPENDED tenants

**Design:**
- Full-screen overlay with message: `BILLING_BANNER_MESSAGES.SUSPENDED`
- Prevents all UI interactions (buttons, forms, navigation disabled).
- Shows only logout button and support contact information.

**Behavior:**
- Displayed immediately after login if tenant is SUSPENDED.
- All routes redirect to locked screen.
- User can only log out (cannot access any features).

#### Read-Only Mode Indicators

**Purpose:** Visual feedback that system is in read-only mode

**Design:**
- Disable all "Create", "Update", "Delete", "Archive" buttons.
- Show tooltip on hover: `BILLING_TOOLTIP_MESSAGES.PAST_DUE_READ_ONLY`
- Disable form inputs (read-only styling).
- Hide or disable action buttons in tables/lists.

**Behavior:**
- Applied consistently across all pages (members, plans, branches, dashboard).
- Users can still navigate and view data.
- Export functionality (if exists) remains available.

#### Error Handling

**Purpose:** Display API errors for blocked operations

**Design:**
- Toast notification for 403 errors from mutation endpoints.
- Message: `BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION`
- Error persists until user acknowledges (or auto-dismisses after 5 seconds).

**Behavior:**
- Intercepts 403 responses from mutation endpoints.
- Shows user-friendly Turkish error message.
- Does not show technical error details.
- **Billing Status Change Detection:**
  - If 403 error message contains billing status keywords (e.g., "askıya alınmış", "ödeme gecikmiş", "billing status"):
    - Invalidate session cache immediately
    - Clear JWT token
    - Redirect to login page
    - Display message: `BILLING_ERROR_MESSAGES.STATUS_CHANGED_MID_SESSION`
  - This ensures users are immediately aware of billing status changes and cannot continue using the system with stale permissions.

### User Flows

#### Flow 1: PAST_DUE Tenant Login and Usage

1. User enters credentials and clicks "Login".
2. Backend validates credentials and checks billing status.
3. If `billingStatus = PAST_DUE`, login succeeds.
4. Frontend receives billing status in login response.
5. Frontend displays yellow warning banner at top of page.
6. User navigates to members page.
7. User sees "Yeni Üye Ekle" button is disabled.
8. User clicks disabled button, sees tooltip: `BILLING_TOOLTIP_MESSAGES.PAST_DUE_READ_ONLY`
9. User attempts to edit existing member.
10. Frontend disables form inputs (read-only mode).
11. User clicks "Kaydet" button (if not hidden).
12. API request returns 403 Forbidden.
13. Frontend shows toast error: `BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION`
14. User can continue viewing data but cannot make changes.

#### Flow 2: SUSPENDED Tenant Login Attempt

1. User enters credentials and clicks "Login".
2. Backend validates credentials.
3. Backend checks billing status: `billingStatus = SUSPENDED`.
4. Backend returns 403 Forbidden with message: `BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN`
5. Frontend displays error message on login page.
6. User cannot proceed to dashboard.
7. User sees support contact information.

#### Flow 3: ACTIVE Tenant Normal Usage

1. User logs in successfully.
2. Frontend checks billing status: `billingStatus = ACTIVE`.
3. No banner displayed.
4. All features available (full CRUD access).
5. User can create, update, delete records normally.

#### Flow 4: Mid-Session Billing Status Change

1. User is logged in with `billingStatus = ACTIVE`.
2. Admin updates tenant billing status to `PAST_DUE` or `SUSPENDED` in database.
3. User attempts to perform an action (create member, update plan, etc.).
4. API request returns 403 Forbidden with billing status error message.
5. Frontend intercepts 403 response:
   - Detects billing-related error message
   - Invalidates user session cache (React Query cache, user context)
   - Clears JWT token from localStorage/sessionStorage
   - Redirects to login page
   - Displays message: "Hesabınızın durumu değişti. Lütfen tekrar giriş yapın."
6. User must log in again to see updated billing status and restrictions.

### State Management

**Billing Status Storage:**

- Store `billingStatus` in React Query cache after login.
- Include in user context/state management (if using Context API or Zustand).
- Refresh billing status on each API call (via `/auth/me` endpoint).

**Cache Invalidation:**

- Invalidate billing status cache on logout.
- Refresh billing status after successful login.
- Do not cache billing status for extended periods (check on each session).
- **Mid-Session Status Change Handling:**
  - When any API request returns 403 Forbidden with billing-related error message:
    1. Invalidate user session cache (clear React Query cache, user context)
    2. Clear JWT token from storage
    3. Redirect to login page
    4. Display error message explaining billing status change (e.g., "Hesabınızın durumu değişti. Lütfen tekrar giriş yapın.")
  - This ensures immediate enforcement of billing status changes without requiring polling or manual refresh.

### Performance Considerations

- Billing status check adds minimal overhead (single database query per request).
- Frontend banner rendering is lightweight (no performance impact).
- Read-only mode indicators use CSS classes (no JavaScript overhead).

### Metrics & Monitoring

**Initial Implementation (Phase 1):**

- Track key metrics via structured logging:
  - Count of 403 Forbidden responses by billing status (PAST_DUE, SUSPENDED)
  - BillingStatusGuard execution time (log slow queries > 10ms)
  - Rate limit hits for SUSPENDED tenant login attempts
- Metrics logged as structured JSON with correlation IDs for request tracing.
- Example log entry:
  ```json
  {
    "timestamp": "2025-12-17T10:30:00Z",
    "level": "WARN",
    "event": "billing_status_blocked",
    "tenantId": "clx123...",
    "billingStatus": "PAST_DUE",
    "endpoint": "POST /api/v1/members",
    "guardExecutionTimeMs": 3,
    "correlationId": "req-abc123"
  }
  ```

**Future Enhancement (Phase 2 - Deferred):**

- Add comprehensive metrics dashboard:
  - Billing status distribution (count of tenants per status)
  - Status transition counts (TRIAL → ACTIVE, ACTIVE → PAST_DUE, etc.)
  - Average guard execution time (p50, p95, p99)
  - Rate limit effectiveness (how many SUSPENDED tenants hit rate limit)
- Consider integrating with monitoring service (Prometheus, DataDog, etc.) if needed.
- Alert on unusual patterns (sudden spike in SUSPENDED tenants, guard performance degradation).

**Rationale:** Initial implementation focuses on core functionality. Key metrics via logging provide sufficient observability for debugging and basic monitoring. Comprehensive metrics can be added after initial deployment based on actual needs.

---

## Security & Tenant Isolation

### Tenant Scoping

**Billing Status Enforcement:**

- Billing status is checked at guard/middleware level (before service layer).
- Guard extracts `tenantId` from JWT token.
- Guard queries `Tenant` table to fetch `billingStatus`.
- Guard applies restrictions based on billing status before request reaches controller.

**Tenant Isolation Maintained:**

- All existing tenant isolation rules remain unchanged.
- Billing status restrictions are additive (do not bypass tenant scoping).
- Cross-tenant access remains blocked regardless of billing status.

### Authorization

**Current Role: ADMIN**

- ADMIN users are subject to billing status restrictions.
- No special "platform admin" role exists yet (future enhancement).
- All users within a tenant share the same billing status restrictions.

**Billing Status Guard:**

- New `BillingStatusGuard` implements `CanActivate` interface.
- Applied globally to all routes (except auth routes).
- Checks tenant billing status before allowing request.
- Returns 403 Forbidden if restrictions apply.

**Self-Activation Prevention:**

- DTO validation: `UpdateTenantDto` explicitly excludes `billingStatus` field.
- Service validation: `TenantsService.update()` checks and rejects `billingStatus` updates.
- Database constraint: No unique constraint needed (manual updates only).
- Security: Even if API validation bypassed, database-level checks prevent self-activation (future: add database trigger if needed).

**Rate Limiting for SUSPENDED Tenants:**

- SUSPENDED tenant login attempts are rate-limited to prevent brute-force attacks.
- Rate limit: 3 login attempts per 15-minute window per tenant (tracked by email or tenantId).
- After rate limit exceeded, return 429 Too Many Requests.
- Rate limiting applies only to SUSPENDED tenants (ACTIVE/PAST_DUE/TRIAL tenants not rate-limited).
- Implementation: Use in-memory cache (Redis recommended for production) or database table to track attempt counts.

### Data Sensitivity

**Billing Status Visibility:**

- Billing status is included in `/auth/me` response (visible to tenant users).
- This is acceptable because:
  - Users need to know why they cannot perform actions.
  - Status is not sensitive financial data (just access level).
  - Helps users understand system restrictions.

**Audit Trail:**

- `billingStatusUpdatedAt` timestamp tracks when status changed.
- Future enhancement: Add `billingStatusUpdatedBy` field (when platform admin exists).
- **Logging:** All billing status changes MUST be logged with:
  - Timestamp of change
  - Tenant ID
  - Old billing status value
  - New billing status value
  - Log format: Structured JSON with correlation ID for request tracing
  - Log level: INFO for normal transitions, WARN for SUSPENDED transitions
  - Example log entry:
    ```json
    {
      "timestamp": "2025-12-17T10:30:00Z",
      "level": "INFO",
      "event": "billing_status_changed",
      "tenantId": "clx123...",
      "oldStatus": "ACTIVE",
      "newStatus": "PAST_DUE",
      "correlationId": "req-abc123"
    }
    ```

---

## Testing Requirements

### Unit Tests

**BillingStatusGuard:**

- [ ] Guard allows ACTIVE tenant requests to proceed
- [ ] Guard allows TRIAL tenant requests to proceed
- [ ] Guard blocks PAST_DUE tenant POST/PATCH/DELETE requests with 403
- [ ] Guard allows PAST_DUE tenant GET requests to proceed
- [ ] Guard blocks SUSPENDED tenant all requests (except auth) with 403
- [ ] Guard extracts tenantId from JWT correctly
- [ ] Guard handles missing tenantId gracefully (returns 401)

**TenantsService:**

- [ ] `update()` rejects `billingStatus` field in update data
- [ ] `update()` throws 403 Forbidden if `billingStatus` included
- [ ] `update()` allows `name` and `defaultCurrency` updates normally
- [ ] `getById()` returns billing status in response

**AuthService:**

- [ ] `login()` rejects SUSPENDED tenant with 403
- [ ] `login()` allows PAST_DUE tenant (returns billing status)
- [ ] `login()` allows ACTIVE/TRIAL tenant normally
- [ ] `validateUser()` includes billing status check

### Integration Tests

**API Endpoints:**

- [ ] POST /api/v1/members returns 403 for PAST_DUE tenant
- [ ] GET /api/v1/members returns 200 for PAST_DUE tenant (read-only)
- [ ] PATCH /api/v1/members/:id returns 403 for PAST_DUE tenant
- [ ] DELETE /api/v1/members/:id returns 403 for PAST_DUE tenant
- [ ] All mutation endpoints return 403 for SUSPENDED tenant
- [ ] GET endpoints return 403 for SUSPENDED tenant (except /auth/me)
- [ ] POST /api/v1/auth/login returns 403 for SUSPENDED tenant
- [ ] POST /api/v1/auth/login returns 200 for PAST_DUE tenant (with billing status)
- [ ] PUT /api/v1/tenants/:id rejects billingStatus field with 403

**Tenant Isolation:**

- [ ] Billing status restrictions do not bypass tenant scoping
- [ ] Cross-tenant access remains blocked regardless of billing status
- [ ] Tenant A's billing status does not affect Tenant B's access

### E2E Tests

**Minimum Coverage Required:**

- [ ] **E2E-001:** PAST_DUE tenant can view members but cannot create new member
- [ ] **E2E-002:** PAST_DUE tenant can view plans but cannot update plan
- [ ] **E2E-003:** PAST_DUE tenant sees warning banner on all pages
- [ ] **E2E-004:** SUSPENDED tenant cannot login (403 on login endpoint)
- [ ] **E2E-005:** SUSPENDED tenant sees error message on login page
- [ ] **E2E-006:** ACTIVE tenant can perform all CRUD operations normally
- [ ] **E2E-007:** TRIAL tenant can perform all CRUD operations normally
- [ ] **E2E-008:** Tenant cannot update own billingStatus via API (403 Forbidden)
- [ ] **E2E-009:** Database update of billingStatus (PAST_DUE → ACTIVE) immediately allows mutations
- [ ] **E2E-010:** Database update of billingStatus (ACTIVE → SUSPENDED) blocks next login attempt

**Test Data Setup:**

- Create test tenants with each billing status (TRIAL, ACTIVE, PAST_DUE, SUSPENDED).
- Create test users for each tenant.
- Use database updates (Prisma client) to change billing status during tests.

### Edge Cases

- [ ] Tenant with null `billingStatusUpdatedAt` (migration edge case) handled gracefully
- [ ] Tenant billing status changes mid-session (user logged in, status changes in DB)
  - **Expected:** Next API request reflects new status (guard checks on each request)
  - **Frontend Behavior:** When API returns 403 with billing error, frontend invalidates session cache, clears JWT, and redirects to login page
- [ ] Multiple concurrent requests from PAST_DUE tenant (all mutations blocked consistently)
- [ ] JWT token valid but tenant deleted (handled by existing tenant guard)
- [ ] Billing status enum value invalid (database constraint prevents)

---

## Performance & Scalability

### Expected Load

- Billing status check adds one database query per API request (via guard).
- Query is simple: `SELECT billingStatus FROM Tenant WHERE id = ?`
- Index on `billingStatus` not needed for single-tenant lookups (uses primary key).
- Expected impact: < 5ms overhead per request (negligible).

### Database Indexes

- `@@index([billingStatus])`: Enables future admin queries (filter tenants by status).
- Not critical for initial implementation (single-tenant lookups use `id` primary key).

### Query Optimization

- Guard caches billing status in request context (avoid duplicate queries).
- Consider Redis cache for billing status (future optimization if needed).
- No N+1 query concerns (single query per request).

---

## Implementation Checklist

### Backend

- [ ] Add `BillingStatus` enum to Prisma schema
- [ ] Add `billingStatus` and `billingStatusUpdatedAt` fields to Tenant model
- [ ] Create migration with backfill logic (existing tenants → ACTIVE)
- [ ] Create `BillingStatusGuard` implementing `CanActivate`
- [ ] Apply guard globally (except auth routes)
- [ ] Update `AuthService.login()` to check billing status
- [ ] Implement rate limiting for SUSPENDED tenant login attempts (3 attempts per 15 minutes)
- [ ] Update `TenantsService.update()` to reject `billingStatus` field
- [ ] Update `AuthService.validateUser()` to include billing status
- [ ] Add billing status to `/auth/me` response
- [ ] Create centralized billing error messages constants file (`backend/src/common/constants/billing-messages.ts`)
- [ ] Add Turkish error messages for billing restrictions (use centralized constants)
- [ ] Implement structured logging for billing status changes (timestamp, tenantId, oldStatus, newStatus)
- [ ] Implement key metrics tracking (403 counts by billing status, guard execution time, rate limit hits)
- [ ] Unit tests for `BillingStatusGuard`
- [ ] Unit tests for `TenantsService` billing status rejection
- [ ] Unit tests for `AuthService` billing status checks
- [ ] Integration tests for API endpoints with billing restrictions
- [ ] E2E tests for PAST_DUE read-only mode
- [ ] E2E tests for SUSPENDED full blocking
- [ ] E2E tests for tenant self-activation prevention

### Frontend

- [ ] Add `BillingStatus` enum to shared TypeScript types
- [ ] Create centralized billing error messages constants file (`frontend/src/lib/constants/billing-messages.ts`)
- [ ] Update `AuthMeResponse` type to include billing status
- [ ] Update `LoginResponse` type to include billing status
- [ ] Create `BillingStatusBanner` component (PAST_DUE warning, SUSPENDED error)
- [ ] Create `LockedScreen` component (for SUSPENDED tenants)
- [ ] Update API client to handle 403 billing errors
- [ ] Add billing status to user context/state management
- [ ] Update layout to show billing banner when needed
- [ ] Update all mutation buttons to disable in PAST_DUE mode
- [ ] Add read-only styling to forms in PAST_DUE mode
- [ ] Add tooltips explaining read-only restrictions
- [ ] Update error handling to show billing-specific messages
- [ ] Implement mid-session billing status change detection (invalidate cache on 403 billing errors, redirect to login)
- [ ] Test PAST_DUE tenant UI (banner, disabled buttons, read-only forms)
- [ ] Test SUSPENDED tenant UI (locked screen, login rejection)
- [ ] Test mid-session status change flow (ACTIVE → PAST_DUE/SUSPENDED triggers session invalidation)

### Documentation

- [ ] Update API documentation with billing status fields
- [ ] Document manual billing state management process (Prisma Studio/SQL)
- [ ] Add inline code comments for billing status guard logic
- [ ] Document billing state transition rules
- [ ] Create runbook for manual billing state updates

---

## Open Questions

**All questions resolved during specification clarification:**

1. ✅ **Logging:** All billing status changes are logged with structured JSON format (timestamp, tenantId, oldStatus, newStatus, correlationId). See Rule 7 and Audit Trail section.

2. ✅ **Rate Limiting:** SUSPENDED tenant login attempts are rate-limited (3 attempts per 15 minutes) to prevent brute-force attacks. See Rule 3 and Security section.

3. ✅ **Frontend Cache Invalidation:** Mid-session billing status changes trigger session invalidation on next API request (403 response). Frontend clears cache, JWT token, and redirects to login. See Flow 4 and State Management section.

4. ✅ **Error Message Standardization:** All billing-related error messages are centralized in constants files (`billing-messages.ts`) for both backend and frontend. See Rule 7.

5. ✅ **Metrics & Monitoring:** Key metrics (403 counts by billing status, guard execution time, rate limit hits) are tracked via structured logging. Comprehensive metrics dashboard deferred to Phase 2. See Metrics & Monitoring section.

---

## Future Enhancements

**Automated Billing Integration:**

- Integrate Stripe/iyzico for automatic payment processing
- Webhook handlers for payment success/failure events
- Automatic billing state transitions (PAST_DUE → ACTIVE on payment)
- Scheduled jobs for grace period logic (ACTIVE → PAST_DUE after due date)

**Platform Admin UI:**

- Admin dashboard for viewing all tenants and billing statuses
- Admin interface for updating tenant billing status
- Bulk operations (suspend multiple tenants)
- Billing status change history and audit log

**Email Notifications:**

- Send email when tenant transitions to PAST_DUE
- Send email when tenant transitions to SUSPENDED
- Send email when tenant reactivates (SUSPENDED → ACTIVE)
- Payment reminder emails before due date

**Grace Period Logic:**

- Configurable grace period (e.g., 7 days) before SUSPENDED
- Automatic transition: PAST_DUE → SUSPENDED after grace period
- Scheduled job to check and update billing statuses daily

**Billing History:**

- Track billing status changes with timestamps
- Track who changed billing status (when platform admin exists)
- Generate reports on tenant billing status distribution
- Track payment dates and amounts (when payment integration exists)

---

**Approval**

- [ ] Domain model reviewed and approved
- [ ] API design reviewed and approved
- [ ] Security implications reviewed
- [ ] Performance implications reviewed
- [ ] Ready for implementation

---

**End of Specification**

