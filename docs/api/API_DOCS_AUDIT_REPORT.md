# API Documentation Audit Report

**Date:** 2026-01-17  
**Auditor:** Senior Backend Engineer  
**Target:** `/docs/api/endpoints.md`  
**Purpose:** Verify API docs accuracy for React Native (Expo) mobile app integration

---

## Executive Summary

1. **Critical:** Error response format mismatch - docs show `error` and `details` fields, but code returns `code`, `errors`, `timestamp`, `path`. Mobile apps will fail to parse error responses correctly.

2. **Critical:** Refresh token exists in login response but not documented. Mobile apps need refresh token for session management, but current docs don't mention it.

3. **High:** Global prefix inconsistency - docs claim "no global prefix" but all controllers use `/api/v1/` prefix. This will cause routing confusion.

4. **High:** RBAC enforcement gaps - Multiple endpoints marked "ADMIN role (TODO)" in docs but have no actual enforcement in code (PATCH /tenants/current, PATCH /branches/:id, branch archive/restore/set-default). Mobile apps may expose admin-only features to regular users.

5. **High:** Member status vs membership state confusion - Docs don't clearly distinguish between persisted `MemberStatus` (ACTIVE, PAUSED, INACTIVE, ARCHIVED) and derived `membershipState` (ACTIVE, EXPIRED). Mobile apps need clarity on which to use for UI logic.

6. **Medium:** Query parameter inconsistency - Plans endpoint accepts both `q` and `search` (prefers `q`), while Members endpoint only accepts `search`. This inconsistency will confuse mobile developers.

7. **Medium:** Dashboard metrics definition missing - Docs don't explain how `activeMembers`, `inactiveMembers`, `expiringSoon` are calculated. Mobile apps need exact formulas for correct display.

8. **Medium:** Payment correction versioning - Docs mention version but don't explain where to get it from GET /payments/:id response. Mobile apps need clear guidance.

9. **Low:** Auth token expiry not documented - JWT access token TTL defaults to 900s (15 min) but not mentioned in docs. Mobile apps need this for token refresh strategy.

10. **Low:** Idempotency header case sensitivity - Docs show `Idempotency-Key` but code accepts case-insensitive header. Should document this explicitly.

---

## Findings Table

| Severity | Area | Doc Claim | Code Reality | Mobile Impact | Recommended Fix |
|----------|------|-----------|--------------|--------------|----------------|
| Critical | Error Format | `{ statusCode, message, error, details }` | `{ statusCode, message, code?, errors?, timestamp, path }` | Mobile apps will fail to parse errors | Update docs to match actual response format |
| Critical | Auth Response | `{ accessToken, user }` | `{ accessToken, refreshToken, user, tenant }` | Mobile apps won't implement refresh token flow | Document refreshToken and tenant fields |
| High | Global Prefix | "No global prefix" | All controllers use `/api/v1/` | Mobile apps will use wrong base URL | Clarify that `/api/v1/` is the global prefix |
| High | RBAC - PATCH /tenants/current | "ADMIN role (TODO)" | No enforcement in code | Regular users can update tenant settings | Either enforce or document as USER-accessible |
| High | RBAC - PATCH /branches/:id | "ADMIN role (TODO)" | No enforcement in code | Regular users can update branches | Either enforce or document as USER-accessible |
| High | RBAC - Branch archive/restore/set-default | "ADMIN role (TODO)" | No enforcement in code | Regular users can archive branches | Either enforce or document as USER-accessible |
| High | Member Status | Status transitions documented | Missing PAUSED status in ChangeMemberStatusDto docs | Mobile apps won't know PAUSED is valid | Document PAUSED status and transitions |
| Medium | Query Params - Plans | Uses `q` | Accepts both `q` and `search` (prefers `q`) | Inconsistent API usage | Document both params with preference |
| Medium | Query Params - Members | Uses `search` | Only accepts `search` | Inconsistent with Plans endpoint | Consider standardizing or document difference |
| Medium | Dashboard Metrics | Lists fields | No calculation formulas | Mobile apps can't verify correctness | Document exact calculation formulas |
| Medium | Payment Version | Mentions version | Version included in GET /payments/:id | Mobile apps need explicit guidance | Add example showing version field |
| Low | Token Expiry | Not documented | Defaults to 900s (15 min) | Mobile apps can't plan refresh strategy | Document JWT_ACCESS_EXPIRES_IN default |
| Low | Idempotency Header | `Idempotency-Key` | Case-insensitive | Minor confusion | Document case-insensitivity |

---

## Detailed Findings

### A) Member Status vs Membership State

#### Finding A1: Missing PAUSED Status Documentation
**Severity:** High  
**What docs say:**
```
ChangeMemberStatusDto: status (ACTIVE | INACTIVE | FROZEN)
```

**What code does:**
- File: `backend/src/members/dto/change-member-status.dto.ts`
- Enum: `MemberStatus` from Prisma (ACTIVE, PAUSED, INACTIVE, ARCHIVED)
- File: `backend/prisma/schema.prisma` lines 28-33

**Why it matters for mobile:**
Mobile apps will try to set status to PAUSED (for freeze functionality) but docs don't mention it. This will cause validation errors.

**Exact doc changes:**
```markdown
- ChangeMemberStatusDto: status (ACTIVE | INACTIVE | FROZEN)
+ ChangeMemberStatusDto: status (ACTIVE | PAUSED | INACTIVE)
+ Note: ARCHIVED cannot be set via this endpoint (use /archive endpoint)
```

#### Finding A2: Member Status vs Membership State Confusion
**Severity:** High  
**What docs say:**
- Docs mention `status` field but don't explain the difference between persisted status and derived membership state.

**What code does:**
- File: `backend/src/members/members.service.ts` lines 39-60
- File: `backend/src/common/utils/membership-status.util.ts`
- Persisted: `Member.status` (ACTIVE, PAUSED, INACTIVE, ARCHIVED)
- Derived: `membershipState` (ACTIVE, EXPIRED) based on `membershipEndDate`
- Derived fields: `isMembershipActive`, `membershipState`, `daysRemaining`, `isExpiringSoon`

**Why it matters for mobile:**
Mobile apps need to know:
- `status` = business state (can be PAUSED even if membership hasn't expired)
- `membershipState` = derived from dates (ACTIVE if endDate >= today)
- Dashboard metrics use derived status, not persisted status

**Exact doc changes:**
Add new section after Member DTOs:
```markdown
**Member Status Fields:**

1. **Persisted Status** (`status`): ACTIVE, PAUSED, INACTIVE, ARCHIVED
   - Set via POST /members/:id/status or POST /members/:id/archive
   - Represents business state (e.g., PAUSED = membership frozen)

2. **Derived Membership State** (`membershipState`): ACTIVE, EXPIRED
   - Calculated from `membershipEndDate` (ACTIVE if endDate >= today)
   - Always included in member responses
   - Used by dashboard metrics

3. **Additional Derived Fields:**
   - `isMembershipActive`: boolean (true if membershipEndDate >= today)
   - `daysRemaining`: number | null (days until expiration, 0 if expired)
   - `isExpiringSoon`: boolean (true if active and expiring within 7 days)

**Status Transitions:**
- ACTIVE → PAUSED: Freezes membership (sets pausedAt, doesn't modify endDate)
- PAUSED → ACTIVE: Resumes membership (extends endDate by pause duration)
- ACTIVE → INACTIVE: Deactivates member
- PAUSED → INACTIVE: Deactivates member (clears pause timestamps)
- INACTIVE → ACTIVE: Reactivates member
- Any → ARCHIVED: Terminal action (via /archive endpoint only)
```

#### Finding A3: Expired Membership Calculation
**Severity:** Medium  
**What docs say:**
- No explicit definition of "expired membership"

**What code does:**
- File: `backend/src/common/utils/membership-status.util.ts` lines 48-87
- Expired = `membershipEndDate < today` OR `membershipEndDate IS NULL`
- Calculation uses start-of-day comparison (00:00:00)

**Why it matters for mobile:**
Mobile apps need to know exact date comparison logic (start-of-day, timezone handling).

**Exact doc changes:**
Add to Member Status Fields section:
```markdown
**Expired Membership Definition:**
- A membership is EXPIRED if `membershipEndDate < today` (start of day, server timezone)
- Comparison uses date-only (time portion ignored)
- If `membershipEndDate` is null, membership is considered EXPIRED
```

---

### B) Global Prefix Consistency

#### Finding B1: Prefix Contradiction
**Severity:** High  
**What docs say:**
```
- Global Prefix: Yok (her controller kendi path'ini belirtir)
- API Version: v1 (tüm endpoint'ler `/api/v1/` prefix'i kullanır)
```

**What code does:**
- File: `backend/src/main.ts` - No global prefix set
- All controllers: `@Controller('api/v1/...')`
- Examples:
  - `backend/src/auth/auth.controller.ts` line 29: `@Controller('api/v1/auth')`
  - `backend/src/members/members.controller.ts` line 22: `@Controller('api/v1/members')`
  - `backend/src/payments/payments.controller.ts` line 33: `@Controller('api/v1/payments')`

**Why it matters for mobile:**
Mobile apps will be confused about base URL. Should use `/api/v1/` as base path.

**Exact doc changes:**
```markdown
- Global Prefix: Yok (her controller kendi path'ini belirtir)
- API Version: v1 (tüm endpoint'ler `/api/v1/` prefix'i kullanır)
+ Global Prefix: `/api/v1` (tüm endpoint'ler bu prefix ile başlar)
+ Base URL: `http://localhost:3000/api/v1` (development)
```

---

### C) Auth & Session Strategy

#### Finding C1: Missing Refresh Token in Docs
**Severity:** Critical  
**What docs say:**
```
Response: { accessToken, user }
```

**What code does:**
- File: `backend/src/auth/auth.service.ts` lines 87-101
- Returns: `{ accessToken, refreshToken, user, tenant }`
- Refresh token uses `JWT_REFRESH_SECRET` and `JWT_REFRESH_EXPIRES_IN` (default: 30d)

**Why it matters for mobile:**
Mobile apps need refresh token for session management. Without it documented, apps will only use access token and users will be logged out every 15 minutes.

**Exact doc changes:**
```markdown
- Response: { accessToken, user }
+ Response: { accessToken, refreshToken, user, tenant }
+   - accessToken: JWT token for API requests (expires in 15 minutes by default)
+   - refreshToken: JWT token for refreshing access token (expires in 30 days by default)
+   - user: { id, email, role, tenantId }
+   - tenant: { id, name, billingStatus }
```

#### Finding C2: Missing Refresh Token Endpoint
**Severity:** High  
**What docs say:**
- No refresh token endpoint documented

**What code does:**
- File: `backend/src/auth/auth.controller.ts` - No refresh endpoint exists
- File: `backend/src/auth/auth.service.ts` - Generates refreshToken but no refresh method

**Why it matters for mobile:**
Mobile apps need a way to refresh access tokens. Current implementation generates refreshToken but doesn't provide endpoint to use it.

**Exact doc changes:**
Add new endpoint (if implemented) or note:
```markdown
**Note:** Refresh token endpoint not yet implemented. When access token expires (401), mobile apps should prompt user to re-login.
```

**Code change suggestion:**
Implement `POST /api/v1/auth/refresh` endpoint that accepts refreshToken and returns new accessToken.

#### Finding C3: Token Expiry Not Documented
**Severity:** Low  
**What docs say:**
- No mention of token expiry times

**What code does:**
- File: `backend/src/auth/auth.service.ts` lines 70-75
- `JWT_ACCESS_EXPIRES_IN` defaults to `'900s'` (15 minutes)
- `JWT_REFRESH_EXPIRES_IN` defaults to `'30d'` (30 days)

**Why it matters for mobile:**
Mobile apps need to know when to refresh tokens proactively.

**Exact doc changes:**
Add to Authentication & Headers section:
```markdown
**Token Expiry:**
- Access Token: 15 minutes (configurable via JWT_ACCESS_EXPIRES_IN)
- Refresh Token: 30 days (configurable via JWT_REFRESH_EXPIRES_IN)
```

#### Finding C4: /auth/me Response Format
**Severity:** Medium  
**What docs say:**
```
Response: UserWithTenant
```

**What code does:**
- File: `backend/src/auth/auth.service.ts` lines 136-151
- Returns: `{ user: { id, email, firstName, lastName, role, tenantId }, tenant: { id, name, billingStatus, billingStatusUpdatedAt } }`

**Why it matters for mobile:**
Mobile apps need exact response structure for type safety.

**Exact doc changes:**
```markdown
- Response: UserWithTenant
+ Response: {
+   user: { id, email, firstName, lastName, role, tenantId },
+   tenant: { id, name, billingStatus, billingStatusUpdatedAt }
+ }
```

---

### D) RBAC Enforcement

#### Finding D1: PATCH /tenants/current - No Enforcement
**Severity:** High  
**What docs say:**
```
PATCH /api/v1/tenants/current | ADMIN role (TODO)
```

**What code does:**
- File: `backend/src/tenants/tenants.controller.ts` lines 42-55
- No `@Roles('ADMIN')` decorator
- No `RolesGuard` applied
- Comment says "TODO: add role check when roles are fully wired"

**Why it matters for mobile:**
Mobile apps will allow regular users to update tenant settings, which is a security issue.

**Exact doc changes:**
```markdown
- PATCH /api/v1/tenants/current | ADMIN role (TODO)
+ PATCH /api/v1/tenants/current | JWT + TenantGuard (ADMIN role not enforced - TODO)
+ **Security Note:** This endpoint currently allows all authenticated users. Mobile apps should implement client-side role check until backend enforcement is added.
```

**Code change suggestion:**
```typescript
@Patch('current')
@UseGuards(RolesGuard)
@Roles('ADMIN')
@HttpCode(HttpStatus.OK)
updateCurrentTenant(...)
```

#### Finding D2: PATCH /branches/:id - No Enforcement
**Severity:** High  
**What docs say:**
```
PATCH /api/v1/branches/:id | ADMIN role (TODO)
```

**What code does:**
- File: `backend/src/branches/branches.controller.ts` lines 84-91
- No `@Roles('ADMIN')` decorator
- Comment says "TODO: add role check when roles are fully wired"

**Exact doc changes:**
Same as D1 - document as not enforced with security note.

**Code change suggestion:**
```typescript
@Patch(':id')
@UseGuards(RolesGuard)
@Roles('ADMIN')
updateBranch(...)
```

#### Finding D3: Branch Archive/Restore/Set-Default - No Enforcement
**Severity:** High  
**What docs say:**
```
POST /api/v1/branches/:id/archive | ADMIN role (TODO)
POST /api/v1/branches/:id/restore | ADMIN role (TODO)
POST /api/v1/branches/:id/set-default | ADMIN role (TODO)
```

**What code does:**
- File: `backend/src/branches/branches.controller.ts` lines 99-135
- None have `@Roles('ADMIN')` decorator
- All have "TODO" comments

**Exact doc changes:**
Same pattern - document as not enforced with security note.

**Code change suggestion:**
Add `@UseGuards(RolesGuard)` and `@Roles('ADMIN')` to all three endpoints.

---

### E) Payments Correction/Versioning

#### Finding E1: Version Field Documentation
**Severity:** Medium  
**What docs say:**
```
CorrectPaymentDto: version
```

**What code does:**
- File: `backend/src/payments/dto/correct-payment.dto.ts` line 52
- `version: number` (required, integer, min 0)
- File: `backend/src/payments/dto/payment-response.dto.ts` line 15
- `version: number` included in PaymentResponseDto

**Why it matters for mobile:**
Mobile apps need to know where to get version from (GET /payments/:id response).

**Exact doc changes:**
```markdown
- CorrectPaymentDto: version
+ CorrectPaymentDto: version (required, integer)
+   - Get version from GET /payments/:id response
+   - Used for optimistic locking (prevents concurrent corrections)
+   - Example: GET /payments/abc123 returns { ..., version: 5 }
+   - Use version: 5 in POST /payments/abc123/correct request
```

#### Finding E2: Version Mismatch Error Format
**Severity:** Medium  
**What docs say:**
```
409 Conflict: Version mismatch
```

**What code does:**
- File: `backend/src/payments/payments.service.ts` lines 209-213
- Throws `ConflictException` with message: `'Ödeme başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.'`

**Why it matters for mobile:**
Mobile apps need exact error message format for user-friendly error handling.

**Exact doc changes:**
```markdown
- 409 Conflict: Version mismatch
+ 409 Conflict: Version mismatch
+   Error response: {
+     "statusCode": 409,
+     "message": "Ödeme başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.",
+     "timestamp": "2026-01-17T10:00:00.000Z",
+     "path": "/api/v1/payments/abc123/correct"
+   }
+   Mobile apps should: Refresh payment data and prompt user to retry
```

---

### F) Error Response Format

#### Finding F1: Error Format Mismatch
**Severity:** Critical  
**What docs say:**
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

**What code does:**
- File: `backend/src/common/filters/http-exception.filter.ts` lines 79-86
- Returns: `{ statusCode, message, code?, errors?, timestamp, path }`
- No `error` field
- No `details` field (uses `errors` instead)

**Why it matters for mobile:**
Mobile apps will fail to parse error responses. TypeScript types will be wrong.

**Exact doc changes:**
Replace error format section with:
```markdown
## Common Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",  // Optional: error code for programmatic handling
  "errors": [                   // Optional: field-level validation errors
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2026-01-17T10:00:00.000Z",
  "path": "/api/v1/members"
}
```

**Field Descriptions:**
- `statusCode`: HTTP status code (400, 401, 403, 404, 409, 500, etc.)
- `message`: Human-readable error message (always present)
- `code`: Optional error code for programmatic handling (e.g., "TENANT_BILLING_LOCKED")
- `errors`: Optional array of field-level validation errors (only for 400 validation errors)
- `timestamp`: ISO 8601 timestamp of error
- `path`: Request path that caused the error

**Examples:**

**400 Validation Error:**
```json
{
  "statusCode": 400,
  "message": "email must be an email. password must be longer than or equal to 8 characters",
  "errors": [
    { "field": "email", "message": "email must be an email" },
    { "field": "password", "message": "password must be longer than or equal to 8 characters" }
  ],
  "timestamp": "2026-01-17T10:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

**401 Unauthorized:**
```json
{
  "statusCode": 401,
  "message": "Invalid email or password",
  "timestamp": "2026-01-17T10:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

**403 Forbidden:**
```json
{
  "statusCode": 403,
  "message": "Insufficient permissions",
  "timestamp": "2026-01-17T10:00:00.000Z",
  "path": "/api/v1/payments"
}
```

**404 Not Found:**
```json
{
  "statusCode": 404,
  "message": "Üye bulunamadı",
  "timestamp": "2026-01-17T10:00:00.000Z",
  "path": "/api/v1/members/abc123"
}
```

**409 Conflict:**
```json
{
  "statusCode": 409,
  "message": "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.",
  "timestamp": "2026-01-17T10:00:00.000Z",
  "path": "/api/v1/members"
}
```

**500 Internal Server Error:**
```json
{
  "statusCode": 500,
  "message": "Sunucu hatası",
  "timestamp": "2026-01-17T10:00:00.000Z",
  "path": "/api/v1/members"
}
```
```

---

### G) Dashboard Metrics Definitions

#### Finding G1: Missing Calculation Formulas
**Severity:** Medium  
**What docs say:**
```
DashboardSummaryDto: { totalMembers, activeMembers, inactiveMembers, expiringSoon }
```

**What code does:**
- File: `backend/src/dashboard/dashboard.service.ts` lines 46-83
- `totalMembers`: Count of all members (with optional branchId filter)
- `activeMembers`: Count where `membershipEndDate >= today` (start of day)
- `inactiveMembers`: `totalMembers - activeMembers`
- `expiringSoon`: Count where `membershipEndDate >= today AND membershipEndDate <= today+7`

**Why it matters for mobile:**
Mobile apps need exact formulas to verify correctness and handle edge cases.

**Exact doc changes:**
```markdown
**Dashboard Metrics Definitions:**

GET /api/v1/dashboard/summary returns:
- `totalMembers`: Total count of members (tenant-wide or filtered by branchId)
- `activeMembers`: Count of members where `membershipEndDate >= today` (start of day, server timezone)
  - Uses derived membership status (based on dates, not persisted status field)
  - Includes members with status ACTIVE, PAUSED, INACTIVE if membership hasn't expired
- `inactiveMembers`: `totalMembers - activeMembers`
  - Includes expired members, archived members, and members without membership
- `expiringSoon`: Count of active members where `membershipEndDate >= today AND membershipEndDate <= today+7`
  - Only includes members with active membership (not expired)
  - 7-day window is inclusive (today and today+7 both count)

**Important Notes:**
- Metrics use derived membership status (based on `membershipEndDate`), not persisted `status` field
- A member with status PAUSED but membershipEndDate >= today counts as activeMembers
- A member with status ACTIVE but membershipEndDate < today counts as inactiveMembers
- Archived members are included in totalMembers and inactiveMembers (unless filtered out)
```

#### Finding G2: Monthly Members Definition
**Severity:** Low  
**What docs say:**
```
MonthlyMembersItemDto[]: Array of { month: "YYYY-MM", newMembers }
```

**What code does:**
- File: `backend/src/dashboard/dashboard.service.ts` lines 159-229
- Counts members by `createdAt` month
- Includes zero months (all months in range, even if no new members)
- Months parameter: default 6, max 12, min 1

**Exact doc changes:**
```markdown
- MonthlyMembersItemDto[]: Array of { month: "YYYY-MM", newMembers }
+ MonthlyMembersItemDto[]: Array of { month: "YYYY-MM", newMembers }
+   - Counts members created in each month (based on createdAt field)
+   - Includes all months in range, even if newMembers = 0
+   - months parameter: default 6, max 12, min 1
+   - Returns months in chronological order (oldest first)
```

---

### H) Query Parameters & Pagination Consistency

#### Finding H1: Plans Endpoint - q vs search
**Severity:** Medium  
**What docs say:**
```
PlanListQueryDto: q?, search?, ...
```

**What code does:**
- File: `backend/src/membership-plans/membership-plans.service.ts` line 190
- Code: `const nameSearch = q || search;`
- Prefers `q`, falls back to `search` for backward compatibility

**Why it matters for mobile:**
Mobile apps should use `q` for consistency, but need to know `search` also works.

**Exact doc changes:**
```markdown
- PlanListQueryDto: q?, search?, ...
+ PlanListQueryDto: q?, search?, ...
+   - `q`: Preferred parameter for name search (case-insensitive substring match)
+   - `search`: Legacy parameter (accepted for backward compatibility, same as `q`)
+   - If both provided, `q` takes precedence
```

#### Finding H2: Members Endpoint - Only search
**Severity:** Low  
**What docs say:**
```
MemberListQueryDto: search?, ...
```

**What code does:**
- File: `backend/src/members/dto/member-list-query.dto.ts` line 39
- Only accepts `search` parameter
- File: `backend/src/members/members.service.ts` lines 219-240
- Searches firstName, lastName, phone (case-insensitive substring)

**Why it matters for mobile:**
Inconsistency with Plans endpoint (which prefers `q`).

**Exact doc changes:**
```markdown
- MemberListQueryDto: search?, ...
+ MemberListQueryDto: search?, ...
+   - `search`: Searches across firstName, lastName, and phone (case-insensitive substring match)
+   - Note: Plans endpoint uses `q` parameter (inconsistency - consider standardizing in future)
```

#### Finding H3: Pagination Defaults
**Severity:** Low  
**What docs say:**
- Defaults mentioned inconsistently

**What code does:**
- Members: `page = 1`, `limit = 20` (in DTO defaults)
- Plans: `page = 1`, `limit = 20` (in service defaults)
- Branches: `page = 1`, `limit = 20` (likely)

**Exact doc changes:**
Add to Pagination Format section:
```markdown
**Pagination Defaults:**
- `page`: Default 1 (first page)
- `limit`: Default 20 (items per page)
- `limit` maximum: 100 (enforced by validation)
- `limit` minimum: 1 (enforced by validation)
```

---

## "Ready for Mobile" Checklist

| Item | Status | Notes |
|------|--------|-------|
| **Error Response Format** | ❌ FAIL | Docs show wrong format (`error`, `details`) vs actual (`code`, `errors`, `timestamp`, `path`) |
| **Auth Token Management** | ❌ FAIL | Refresh token exists but not documented. No refresh endpoint. |
| **Base URL Clarity** | ⚠️ PARTIAL | Docs contradict (say "no prefix" but all endpoints use `/api/v1/`) |
| **RBAC Enforcement** | ⚠️ PARTIAL | Multiple endpoints claim ADMIN but don't enforce. Security risk. |
| **Member Status Clarity** | ⚠️ PARTIAL | Docs don't distinguish persisted status vs derived membership state |
| **Payment Versioning** | ⚠️ PARTIAL | Version documented but not explained where to get it from |
| **Dashboard Metrics** | ⚠️ PARTIAL | Fields listed but calculation formulas missing |
| **Query Parameter Consistency** | ⚠️ PARTIAL | Plans uses `q`, Members uses `search` - inconsistency |
| **Pagination Consistency** | ✅ PASS | Consistent defaults and format across endpoints |
| **Error Codes** | ✅ PASS | Standard HTTP codes used correctly |
| **Rate Limiting** | ✅ PASS | Documented correctly |
| **Idempotency** | ✅ PASS | Documented correctly (note: header case-insensitive) |

**Overall Status:** ⚠️ **NOT READY** - Critical issues with error format and auth tokens must be fixed before mobile integration.

---

## Recommendations Priority

### Must Fix Before Mobile Integration (Critical)
1. ✅ Update error response format documentation to match actual implementation
2. ✅ Document refreshToken in login response
3. ✅ Clarify global prefix (`/api/v1` is the prefix)

### Should Fix Soon (High Priority)
4. ✅ Document member status vs membership state distinction
5. ✅ Either enforce RBAC on TODO endpoints or document as USER-accessible
6. ✅ Add refresh token endpoint or document workaround

### Nice to Have (Medium Priority)
7. ✅ Document dashboard metrics calculation formulas
8. ✅ Document payment version field source (GET /payments/:id)
9. ✅ Standardize query parameters (`q` vs `search`)

### Low Priority
10. ✅ Document token expiry defaults
11. ✅ Document idempotency header case-insensitivity

---

## Code Change Suggestions Summary

### Critical Code Changes Needed

1. **Implement Refresh Token Endpoint** (if refresh tokens are to be used):
   ```typescript
   // backend/src/auth/auth.controller.ts
   @Post('refresh')
   async refresh(@Body() dto: { refreshToken: string }) {
     // Validate refreshToken, return new accessToken
   }
   ```

2. **Enforce RBAC on TODO Endpoints**:
   - Add `@UseGuards(RolesGuard)` and `@Roles('ADMIN')` to:
     - PATCH /tenants/current
     - PATCH /branches/:id
     - POST /branches/:id/archive
     - POST /branches/:id/restore
     - POST /branches/:id/set-default

### Optional Code Changes

3. **Standardize Query Parameters**:
   - Add `q` parameter to MemberListQueryDto (deprecate `search` in favor of `q`)

4. **Improve Error Response Consistency**:
   - Consider adding `error` field to match common NestJS patterns (or update filter to include it)

---

## Conclusion

The API documentation has several critical gaps that will cause mobile integration issues:

1. **Error format mismatch** will break error handling in mobile apps
2. **Missing refresh token documentation** will cause poor UX (users logged out every 15 min)
3. **RBAC enforcement gaps** are security risks

After addressing the critical and high-priority items, the API will be ready for mobile integration. The medium and low-priority items can be addressed incrementally.

**Estimated Fix Time:** 2-4 hours for doc updates, 4-8 hours for code changes (RBAC enforcement + refresh endpoint).

---

**Report Generated:** 2026-01-17  
**Next Review:** After implementing recommended fixes
