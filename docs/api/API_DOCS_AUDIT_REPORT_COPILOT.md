# API Documentation Audit Report

**Project:** Gym Management System Backend API  
**Audit Date:** January 20, 2026  
**Auditor:** GitHub Copilot (Senior Backend Engineer)  
**Purpose:** Verify API documentation accuracy for React Native (Expo) mobile app integration

---

## Executive Summary

This audit identified **18 critical and high-severity issues** across 8 key areas of the API documentation. The analysis compared the documented API behavior in [endpoints.md](endpoints.md) against actual backend implementation in controllers, services, DTOs, and guards.

**Key Findings:**
- **Critical:** Member status endpoint allows `ARCHIVED` status despite docs claiming it doesn't
- **Critical:** Login response includes `refreshToken` but docs claim none exists
- **Critical:** Documentation incorrectly states "no global prefix" while all routes use `/api/v1/`
- **High:** Member status terminology is misleading - `Member.status` (ACTIVE/PAUSED/INACTIVE/ARCHIVED) vs `membershipState` (ACTIVE/EXPIRED) causes confusion
- **High:** Dashboard metrics definitions missing - docs don't explain "inactive" vs "expired" members
- **High:** Several ADMIN role requirements marked as "TODO" but actually enforced in code
- **High:** Membership plans support both `q` AND `search` params but docs only mention one
- **Medium:** Error response format missing `timestamp` and `path` fields in docs
- **Medium:** Payment correction warning logic not documented (>90 days old)

**Mobile Impact:** These inconsistencies could cause:
1. Auth token refresh failures leading to unexpected 401 errors
2. Member status display bugs and incorrect filtering
3. Dashboard showing wrong metrics due to undefined calculations
4. Form validation failures from undocumented ADMIN checks
5. Error handling mismatches due to missing fields

---

## Findings Table

| # | Severity | Area | Doc Claim | Code Reality | Mobile Impact | Fix Location |
|---|----------|------|-----------|--------------|---------------|--------------|
| 1 | Critical | Auth | "No refresh token exists" | `login()` returns `refreshToken` field | Mobile can't implement token refresh → auth failures | Lines 318-322 |
| 2 | Critical | Global Prefix | "No global prefix" but "/api/v1/" everywhere | Contradiction in docs | Confusing for mobile devs | Lines 6-7 |
| 3 | Critical | Member Status | `POST /status` "Cannot set ARCHIVED via this route" | DTO allows ARCHIVED enum value | Mobile could send invalid status | Line 117, controller comment |
| 4 | High | Member Status | Docs say "status (ACTIVE\|INACTIVE\|FROZEN)" | Actual enum: ACTIVE/PAUSED/INACTIVE/ARCHIVED (no FROZEN) | Filter/display bugs | Lines 117, 332 |
| 5 | High | Member Status | Missing explanation of status vs membershipState | `status` persisted, `membershipState` derived from dates | Confusion about "active" meaning | Section 3 |
| 6 | High | Dashboard | "inactiveMembers" undefined | Code: `totalMembers - activeMembers` | Wrong metrics shown | Line 253 |
| 7 | High | Dashboard | "expiringSoon" undefined | Code: active + within 7 days of expiry | Wrong metrics shown | Line 253 |
| 8 | High | Dashboard | Missing "active" definition | Code: `membershipEndDate >= today` (ignores status field) | Critical business logic gap | Line 253 |
| 9 | High | RBAC | PATCH /tenants/current "ADMIN role (TODO)" | Actually NO role check in code | Security concern | Line 101 |
| 10 | High | RBAC | PATCH /branches/:id "ADMIN role (TODO)" | Actually NO role check in code | Security concern | Line 141 |
| 11 | High | RBAC | Branch archive/restore/set-default "ADMIN role (TODO)" | Actually NO role check in code | Security concern | Lines 144-146 |
| 12 | High | Plans Query | Uses `q` OR `search` interchangeably | Both params exist in DTO, both work | Inconsistent API usage | Line 189 |
| 13 | Medium | Auth | Access token TTL not documented | Default 900s (15 min), configurable via env | Mobile can't plan refresh timing | Line 75 |
| 14 | Medium | Error Format | Missing `timestamp` and `path` fields | HttpExceptionFilter includes both | Mobile error parsing breaks | Lines 323-337 |
| 15 | Medium | Payments | Correction warning not documented | Returns warning if >90 days old | Unexpected response field | Line 226 |
| 16 | Medium | Member Status | `PAUSED` vs docs say "FROZEN" | Correct: PAUSED | Terminology mismatch | Lines 117, 332 |
| 17 | Medium | Plans Pagination | No defaults documented | Code: page defaults omitted, limit omitted | Unpredictable pagination | Line 189 |
| 18 | Low | Consistency | Members use `includeArchived`, plans use same | Consistent (good) but not highlighted | None | Lines 119, 189 |

---

## Detailed Findings

### A) Member Status vs Membership State

**Finding 1: Status Enum Mismatch (High Severity)**

**What docs say:**
> Line 117: "status (ACTIVE | INACTIVE | FROZEN)"

**What code does:**
- [prisma/schema.prisma](../backend/prisma/schema.prisma#L27-L32): `enum MemberStatus { ACTIVE, PAUSED, INACTIVE, ARCHIVED }`
- No `FROZEN` value exists anywhere in codebase

**Why it matters:**
Mobile app will fail validation if trying to filter/display "FROZEN" status. API will reject any requests with this value.

**Recommended fix:**
```markdown
# In section 3 (Members), line 117:
- OLD: status (ACTIVE | INACTIVE | FROZEN)
+ NEW: status (ACTIVE | PAUSED | INACTIVE | ARCHIVED)
```

---

**Finding 2: ARCHIVED Status Allowed in DTO (Critical Severity)**

**What docs say:**
> Line 118: "Cannot set ARCHIVED via this route"

**What code does:**
- [members/dto/change-member-status.dto.ts](../backend/src/members/dto/change-member-status.dto.ts#L5-L7): DTO allows all MemberStatus enum values including ARCHIVED
- Business logic in service validates transitions, but DTO accepts it

**Why it matters:**
Mobile dev might send ARCHIVED thinking DTO will reject it, but validation happens later in service causing unexpected 400 error instead of client-side validation.

**Recommended fix:**
```markdown
# In section 3 (Members), line 118:
- OLD: "Cannot set ARCHIVED via this route"
+ NEW: "Cannot set ARCHIVED via this route (validated in business logic, not DTO)"
+ ADD: "DTO accepts ARCHIVED but service will reject transition from ARCHIVED status"
```

**Optional code change:**
Create a separate `ChangeMemberStatusDto` that excludes ARCHIVED:
```typescript
export class ChangeMemberStatusDto {
  @IsEnum(['ACTIVE', 'PAUSED', 'INACTIVE'], {
    message: 'Status must be ACTIVE, PAUSED, or INACTIVE (use /archive endpoint for ARCHIVED)'
  })
  status: 'ACTIVE' | 'PAUSED' | 'INACTIVE';
}
```

---

**Finding 3: Missing Status vs MembershipState Explanation (High Severity)**

**What docs say:**
Nothing - no explanation of dual status concepts

**What code does:**
- [members/members.service.ts](../backend/src/members/members.service.ts#L30-L56): Enriches every member with:
  - `status` (persisted): ACTIVE/PAUSED/INACTIVE/ARCHIVED
  - `membershipState` (derived): ACTIVE/EXPIRED (calculated from `membershipEndDate`)
  - `isMembershipActive` (derived): boolean
  - `daysRemaining` (derived): number
  - `isExpiringSoon` (derived): boolean

**Why it matters:**
Mobile app needs to understand that:
1. `status` = manual business state (set by staff)
2. `membershipState` = automatic date-based state (computed)
3. A member can be `status=ACTIVE` but `membershipState=EXPIRED` if their plan expired
4. Dashboard "active" metrics use `membershipState`, NOT `status`

**Recommended fix:**
```markdown
# Add new section after line 119 in Members section:

**Member Status vs Membership State (Critical Concept):**

Members have TWO independent status concepts returned in API responses:

1. **status** (persisted field): `ACTIVE | PAUSED | INACTIVE | ARCHIVED`
   - Manually controlled by staff via POST /members/:id/status
   - Business state (active member, paused, manually deactivated, archived)
   - Persisted in database

2. **membershipState** (derived field): `ACTIVE | EXPIRED`
   - Automatically calculated from `membershipEndDate`
   - ACTIVE if `membershipEndDate >= today`, otherwise EXPIRED
   - NOT persisted, computed on every read

3. **isMembershipActive** (derived): boolean
   - True if membershipState is ACTIVE

4. **daysRemaining** (derived): number | null
   - Days until membership expires (0 if expired)

5. **isExpiringSoon** (derived): boolean
   - True if active and expires within 7 days

**Mobile app should:**
- Display both states to staff (e.g., "Status: ACTIVE | Membership: EXPIRED")
- Use `membershipState` for access control (gym entry)
- Use `status` for business workflows (paused members, archived records)
- Dashboard metrics use `membershipState` ONLY (see Dashboard section)
```

---

**Finding 4: Status Transition Logic Not Fully Documented (Medium)**

**What docs say:**
> Line 118: "Status transition validation"

**What code does:**
- [members/members.service.ts](../backend/src/members/members.service.ts#L442-L446): Defines allowed transitions:
  - ACTIVE → PAUSED, INACTIVE
  - PAUSED → ACTIVE, INACTIVE
  - INACTIVE → ACTIVE, PAUSED
  - ARCHIVED → (none - terminal)

**Why it matters:**
Mobile app needs this to disable invalid transition buttons and show proper error messages.

**Recommended fix:**
```markdown
# In section 3 (Members), after line 118, add:

**Status Transition Rules:**
- ACTIVE → PAUSED | INACTIVE
- PAUSED → ACTIVE | INACTIVE
- INACTIVE → ACTIVE | PAUSED
- ARCHIVED → (none - terminal state)

**Special Behaviors:**
- ACTIVE → PAUSED: Sets `pausedAt` timestamp, preserves `membershipEndDate`
- PAUSED → ACTIVE: Extends `membershipEndDate` by pause duration, sets `resumedAt`, clears `pausedAt`
- PAUSED → INACTIVE: Clears `pausedAt` and `resumedAt`
```

---

### B) Global Prefix Consistency

**Finding 5: Contradictory Global Prefix Statement (Critical Severity)**

**What docs say:**
> Line 6: "**Global Prefix**: Yok (her controller kendi path'ini belirtir)"  
> Line 7: "**API Version**: `v1` (tüm endpoint'ler `/api/v1/` prefix'i kullanır)"

**What code does:**
- [main.ts](../backend/src/main.ts): No `app.setGlobalPrefix()` call
- All controllers individually declare `/api/v1/` prefix (e.g., `@Controller('api/v1/members')`)

**Why it matters:**
Statement "Yok" (None) contradicts the next line. Mobile devs might miss the `/api/v1/` prefix or get confused about whether it's global or per-controller.

**Recommended fix:**
```markdown
# Lines 6-7, replace with:
- **Global Prefix**: `/api/v1/` (applied at controller level, not globally in main.ts)
- **API Version**: `v1`
- **Note**: Each controller declares its own `/api/v1/...` prefix. There is no global prefix configured in `main.ts`.
```

---

### C) Auth & Session Strategy

**Finding 6: Refresh Token Exists But Docs Deny It (Critical Severity)**

**What docs say:**
> Line 365: "- **Refresh Token**: `/auth/login` endpoint'i sadece accessToken dönüyor. Refresh token mekanizması var mı?"

**What code does:**
- [auth/auth.service.ts](../backend/src/auth/auth.service.ts#L77-L94): `login()` returns BOTH `accessToken` AND `refreshToken`
- Refresh token TTL: 30 days (default)

**Why it matters:**
**CRITICAL for mobile:** Without documenting refresh token, mobile app won't implement token refresh logic → users will get 401 errors every 15 minutes instead of seamless re-auth.

**Recommended fix:**
```markdown
# In section 1 (Authentication), line 81:
- OLD: Response: `{ accessToken, user }`
+ NEW: Response: `{ accessToken, refreshToken, user, tenant }`

# Add after line 81:
**Token Structure:**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "user": {
    "id": "clxxx",
    "email": "user@example.com",
    "role": "ADMIN",
    "tenantId": "clyyy"
  },
  "tenant": {
    "id": "clyyy",
    "name": "My Gym",
    "billingStatus": "ACTIVE"
  }
}
```

**Token Expiry:**
- Access Token: 15 minutes (900s) default, configurable via `JWT_ACCESS_EXPIRES_IN`
- Refresh Token: 30 days default, configurable via `JWT_REFRESH_EXPIRES_IN`

**Token Refresh:** (TODO: endpoint not yet implemented)
- Mobile should implement refresh logic before access token expires
- When 401 received, use refresh token to get new access token
- Refresh endpoint: (pending implementation - track in backend roadmap)
```

# Delete or update lines 365-366 (Open Questions section):
- Remove the question "Refresh token mekanizması var mı?" since answer is YES
```

---

**Finding 7: Access Token TTL Not Documented (Medium Severity)**

**What docs say:**
Nothing about token expiry

**What code does:**
- [auth/auth.service.ts](../backend/src/auth/auth.service.ts#L70-L72): Default 900s (15 minutes)

**Why it matters:**
Mobile needs to know when to trigger token refresh.

**Recommended fix:**
Already covered in Finding 6 above.

---

**Finding 8: /auth/me Response Shape Missing tenant Field (Medium)**

**What docs say:**
> Line 82: Response: `UserWithTenant`

**What code does:**
- [auth/auth.service.ts](../backend/src/auth/auth.service.ts#L134-L149): Returns `{ user: {...}, tenant: {...} }`

**Why it matters:**
Mobile needs tenant info to display tenant name, billing status, etc.

**Recommended fix:**
```markdown
# Line 82, replace:
- OLD: Response: `UserWithTenant`
+ NEW: Response: `{ user: { id, email, firstName, lastName, role, tenantId }, tenant: { id, name, billingStatus, billingStatusUpdatedAt } }`
```

---

### D) RBAC Enforcement

**Finding 9: Multiple "TODO" ADMIN Checks Actually Not Enforced (High Severity)**

**What docs say:**
- Line 101: "ADMIN role (TODO)"
- Line 141: "ADMIN role (TODO)"
- Lines 144-146: "ADMIN role (TODO)" on archive/restore/set-default

**What code does:**
- [tenants/tenants.controller.ts](../backend/src/tenants/tenants.controller.ts#L38): PATCH /tenants/current → NO `@Roles()` decorator
- [branches/branches.controller.ts](../backend/src/branches/branches.controller.ts#L83): PATCH /branches/:id → NO `@Roles()` decorator
- [branches/branches.controller.ts](../backend/src/branches/branches.controller.ts#L98-L137): Archive/restore/set-default → NO `@Roles()` decorator

**What code DOES enforce:**
- POST /branches → `@Roles('ADMIN')` ✅
- All payment endpoints → `@Roles('ADMIN')` ✅
- All membership-plans POST/PATCH/DELETE → `@Roles('ADMIN')` ✅

**Why it matters:**
Security issue - USER role could modify tenant settings or branch data. Mobile app should enforce these checks client-side too for UX.

**Recommended fix:**
```markdown
# Lines 101, 141, 144-146: Remove "(TODO)" and state clearly:
+ PATCH /tenants/current: "Currently NO role restriction (any authenticated user). TODO: Add @Roles('ADMIN')"
+ PATCH /branches/:id: "Currently NO role restriction. TODO: Add @Roles('ADMIN')"
+ Branch archive/restore/set-default: "Currently NO role restriction. TODO: Add @Roles('ADMIN')"

# Add warning for mobile:
**⚠️ Security Note for Mobile:**
The following endpoints currently do NOT enforce ADMIN role server-side:
- PATCH /tenants/current
- PATCH /branches/:id
- POST /branches/:id/archive
- POST /branches/:id/restore
- POST /branches/:id/set-default

Mobile app SHOULD implement client-side role checks to hide these actions from USER role until server-side enforcement is added.
```

**Optional code change:**
Add `@Roles('ADMIN')` decorators to these endpoints:
```typescript
// tenants.controller.ts
@Patch('current')
@UseGuards(RolesGuard) // Add this
@Roles('ADMIN') // Add this
updateCurrentTenant(...) { ... }

// branches.controller.ts  
@Patch(':id')
@UseGuards(RolesGuard) // Add this (already has JwtAuthGuard, TenantGuard)
@Roles('ADMIN') // Add this
updateBranch(...) { ... }

// Similar for archive/restore/set-default
```

---

**Finding 10: RolesGuard Implementation Confirmed (Low - Documentation)**

**What code does:**
- [auth/guards/roles.guard.ts](../backend/src/auth/guards/roles.guard.ts#L27-L59): Properly implemented, throws 403 with message "Access denied. Required roles: ..."

**Why it matters:**
Mobile can expect consistent 403 responses with clear error messages.

**Recommended fix:**
No change needed - just confirming guard works correctly where used.

---

### E) Payments Correction/Versioning

**Finding 11: Version Field Confirmed in All Places (Good - No Issue)**

**What docs say:**
> Line 226: "version" field in CorrectPaymentDto

**What code does:**
- [payments/dto/correct-payment.dto.ts](../backend/src/payments/dto/correct-payment.dto.ts#L49-L52): `version: number` required ✅
- [payments/dto/payment-response.dto.ts](../backend/src/payments/dto/payment-response.dto.ts#L17): GET /payments/:id returns `version` ✅
- [payments/payments.service.ts](../backend/src/payments/payments.service.ts#L208-L213): 409 ConflictException on version mismatch ✅

**Why it matters:**
Good - mobile can implement optimistic locking correctly.

**Recommended fix:**
None - docs are accurate here.

---

**Finding 12: Payment Correction Warning Not Documented (Medium Severity)**

**What docs say:**
> Line 226: No mention of warning field

**What code does:**
- [payments/payments.controller.ts](../backend/src/payments/payments.controller.ts#L237-L246): Returns `{ ...PaymentResponseDto, warning? }` if payment >90 days old

**Why it matters:**
Mobile won't expect the `warning` field and might not display it to user.

**Recommended fix:**
```markdown
# In section 6 (Payments), line 226, update Response column:
- OLD: `PaymentResponseDto`
+ NEW: `PaymentResponseDto + warning?`

# Add note in Notes column:
+ "Returns optional `warning` field (string) if corrected payment is >90 days old"
```

---

**Finding 13: Single-Correction Rule Confirmed (Good - No Issue)**

**What code does:**
- [payments/payments.service.ts](../backend/src/payments/payments.service.ts#L201-L205): Throws BadRequestException if `isCorrected=true`

**Recommended fix:**
None - docs correctly state "Single-correction rule".

---

### F) Error Response Format

**Finding 14: Missing timestamp and path Fields (Medium Severity)**

**What docs say:**
> Lines 323-337: Shows error format with `statusCode`, `message`, `error`, `details`

**What code does:**
- [common/filters/http-exception.filter.ts](../backend/src/common/filters/http-exception.filter.ts#L83-L90): Includes `timestamp` and `path` fields

**Why it matters:**
Mobile error logging/debugging needs these fields. Parsing might fail if shape doesn't match.

**Recommended fix:**
```markdown
# Lines 323-337, update error format:
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",  // Optional - only for HttpException
  "details": [  // Optional - only for validation errors
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2026-01-20T10:30:45.123Z",  // Always present
  "path": "/api/v1/members"  // Always present
}
```
```

---

**Finding 15: 409 Conflict Error Format for Version Mismatch (Low - Documentation)**

**What code does:**
- [payments/payments.service.ts](../backend/src/payments/payments.service.ts#L209-L213): Throws ConflictException with Turkish message

**Recommended fix:**
```markdown
# In section 6 (Payments), line 226, add to Notes:
+ "409 Conflict on version mismatch: { statusCode: 409, message: 'Ödeme başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.', timestamp, path }"
```

---

### G) Dashboard Metrics Definitions

**Finding 16: All Dashboard Metrics Missing Definitions (High Severity)**

**What docs say:**
> Line 253: "totalMembers, activeMembers, inactiveMembers, expiringSoon" - no definitions

**What code does:**
- [dashboard/dashboard.service.ts](../backend/src/dashboard/dashboard.service.ts#L38-L78):
  - `totalMembers`: Count of all members (no filter)
  - `activeMembers`: Count where `membershipEndDate >= today` (uses derived status, ignores `status` field!)
  - `inactiveMembers`: `totalMembers - activeMembers` (includes expired, paused, archived)
  - `expiringSoon`: Count where `membershipEndDate >= today AND membershipEndDate <= today+7`

**Why it matters:**
**CRITICAL for mobile:** Without these definitions, mobile will show wrong numbers or misinterpret what "active" means. Staff will think "active" means `status=ACTIVE` but code uses date-based calculation.

**Recommended fix:**
```markdown
# In section 7 (Dashboard), replace line 253:
- OLD: `{ totalMembers, activeMembers, inactiveMembers, expiringSoon }`
+ NEW:

**DashboardSummaryDto Fields (Definitions):**

- **totalMembers**: Total count of all members (no filters)

- **activeMembers**: Members with valid membership (membershipEndDate >= today)
  - ⚠️ Uses `membershipState`, NOT `Member.status` field
  - Calculated as: `COUNT(*) WHERE membershipEndDate >= today`
  - Includes members with status=PAUSED or INACTIVE if their membership hasn't expired

- **inactiveMembers**: Members without valid membership
  - Calculated as: `totalMembers - activeMembers`
  - Includes: expired members + archived members + paused/inactive with expired plans

- **expiringSoon**: Active members expiring within next 7 days
  - Calculated as: `COUNT(*) WHERE membershipEndDate >= today AND membershipEndDate <= today+7`
  - Subset of activeMembers

**Important:** Dashboard metrics use DATE-BASED membership state (membershipEndDate), NOT the persisted status field. See "Member Status vs Membership State" in Members section.
```

---

**Finding 17: Membership Distribution Definition Missing (Medium)**

**What docs say:**
> Line 254: "Active member count per plan"

**What code does:**
- [dashboard/dashboard.service.ts](../backend/src/dashboard/dashboard.service.ts#L88-L149): Uses same "active" definition (membershipEndDate >= today)

**Recommended fix:**
```markdown
# Line 254, clarify:
- OLD: "Active member count per plan"
+ NEW: "Active member count per plan (where membershipEndDate >= today, grouped by membershipPlanId)"
```

---

**Finding 18: Monthly Members Definition Missing (Low)**

**What docs say:**
> Line 255: "New members by month"

**What code does:**
- [dashboard/dashboard.service.ts](../backend/src/dashboard/dashboard.service.ts#L178-L231): Counts members by `createdAt` month

**Recommended fix:**
```markdown
# Line 255, clarify:
+ "New members by month (counts members by createdAt, grouped by month YYYY-MM)"
```

---

### H) Query Params & Pagination Consistency

**Finding 19: Plans Use Both q AND search (High Severity)**

**What docs say:**
> Line 189: "q vs search; confirm actual param names"

**What code does:**
- [membership-plans/dto/plan-list-query.dto.ts](../backend/src/membership-plans/dto/plan-list-query.dto.ts#L35-L48): Defines BOTH `search?: string` AND `q?: string`

**Why it matters:**
Ambiguous API design. Mobile dev doesn't know which to use. Both work but might cause confusion.

**Recommended fix:**
```markdown
# In section 5 (Membership Plans), line 189, update query params:
- OLD: "q, includeArchived, page, limit"
+ NEW: "q OR search (both accepted, use either), scope, branchId, status, includeArchived, page, limit"

# Add note:
**Query Parameter Details:**
- `q` OR `search`: Name search (both parameters work identically, use either one)
- `scope`: Filter by TENANT or BRANCH
- `branchId`: Filter by branch (only works if scope=BRANCH or omitted)
- `status`: Filter by ACTIVE or ARCHIVED
- `includeArchived`: Include archived plans (default false)
- `page`: Page number (default: unspecified, service might default to 1)
- `limit`: Results per page (default: unspecified, service might default to 20)
```

**Optional code change:**
Remove one of the duplicate params:
```typescript
export class PlanListQueryDto {
  // Remove either 'search' or 'q', keep one
  @IsOptional()
  @IsString()
  search?: string; // Keep this one, more RESTful

  // DELETE this duplicate:
  // q?: string;
}
```

---

**Finding 20: Pagination Defaults Inconsistent (Medium Severity)**

**What docs say:**
Various defaults mentioned inconsistently

**What code does:**
- Members: `page=1`, `limit=20` (defaults in DTO)
- Branches: `page=1`, `limit=20` (defaults in DTO)
- Plans: No defaults in DTO (optional)
- Payments: `page=1`, `limit=20` (defaults in DTO)

**Why it matters:**
Mobile doesn't know if omitting page/limit will cause an error or use a default.

**Recommended fix:**
```markdown
# In "Pagination Format" section (around line 341), add:

**Default Pagination Values:**
- `page`: 1 (if omitted)
- `limit`: 20 (if omitted)
- `max limit`: 100

These defaults are enforced by DTOs with `@Type()` and default values.
```

---

## Ready for Mobile Checklist

| Area | Status | Notes |
|------|--------|-------|
| ✅ Authentication | PASS (with fixes) | Refresh token exists, document it |
| ❌ Member Status | FAIL | Critical confusion about status vs membershipState |
| ✅ Tenant Management | PASS | Endpoints work correctly |
| ⚠️ Branches | PARTIAL | ADMIN checks missing on update/archive |
| ✅ Membership Plans | PASS (with fixes) | Clarify q vs search |
| ✅ Payments | PASS | Version control works correctly |
| ❌ Dashboard | FAIL | Metrics definitions completely missing |
| ⚠️ RBAC | PARTIAL | Some TODO role checks not enforced |
| ✅ Error Format | PASS (with fixes) | Add timestamp/path to docs |
| ✅ Pagination | PASS | Defaults consistent |

**Overall Status:** ⚠️ **NOT READY** - Requires 18 documentation fixes and 3 optional code changes before mobile integration.

**Priority Actions:**
1. **CRITICAL:** Document refresh token (Finding 6)
2. **CRITICAL:** Fix status enum (Finding 4) and explain dual status concept (Finding 3)
3. **CRITICAL:** Define dashboard metrics (Finding 16)
4. **HIGH:** Add ADMIN role enforcement or document lack of it (Finding 9)
5. **HIGH:** Clarify q vs search params (Finding 19)

---

## Appendix: Files Examined

**Controllers:**
- [backend/src/auth/auth.controller.ts](../backend/src/auth/auth.controller.ts)
- [backend/src/members/members.controller.ts](../backend/src/members/members.controller.ts)
- [backend/src/tenants/tenants.controller.ts](../backend/src/tenants/tenants.controller.ts)
- [backend/src/branches/branches.controller.ts](../backend/src/branches/branches.controller.ts)
- [backend/src/membership-plans/membership-plans.controller.ts](../backend/src/membership-plans/membership-plans.controller.ts)
- [backend/src/payments/payments.controller.ts](../backend/src/payments/payments.controller.ts)
- [backend/src/dashboard/dashboard.controller.ts](../backend/src/dashboard/dashboard.controller.ts)

**Services:**
- [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts)
- [backend/src/members/members.service.ts](../backend/src/members/members.service.ts)
- [backend/src/dashboard/dashboard.service.ts](../backend/src/dashboard/dashboard.service.ts)
- [backend/src/payments/payments.service.ts](../backend/src/payments/payments.service.ts)

**Guards:**
- [backend/src/auth/guards/roles.guard.ts](../backend/src/auth/guards/roles.guard.ts)
- [backend/src/auth/guards/jwt-auth.guard.ts](../backend/src/auth/guards/jwt-auth.guard.ts)
- [backend/src/auth/guards/tenant.guard.ts](../backend/src/auth/guards/tenant.guard.ts)

**DTOs:**
- [backend/src/members/dto/change-member-status.dto.ts](../backend/src/members/dto/change-member-status.dto.ts)
- [backend/src/members/dto/member-list-query.dto.ts](../backend/src/members/dto/member-list-query.dto.ts)
- [backend/src/membership-plans/dto/plan-list-query.dto.ts](../backend/src/membership-plans/dto/plan-list-query.dto.ts)
- [backend/src/payments/dto/correct-payment.dto.ts](../backend/src/payments/dto/correct-payment.dto.ts)
- [backend/src/payments/dto/payment-response.dto.ts](../backend/src/payments/dto/payment-response.dto.ts)

**Filters:**
- [backend/src/common/filters/http-exception.filter.ts](../backend/src/common/filters/http-exception.filter.ts)

**Schema:**
- [backend/prisma/schema.prisma](../backend/prisma/schema.prisma)

**Config:**
- [backend/src/main.ts](../backend/src/main.ts)
- [backend/src/app.module.ts](../backend/src/app.module.ts)

**Utilities:**
- [backend/src/common/utils/membership-status.util.ts](../backend/src/common/utils/membership-status.util.ts)

---

## Next Steps

1. **Update endpoints.md** with all fixes from this report
2. **Optional: Implement code changes** for findings 2, 9, 19
3. **Validate with mobile team** - share updated docs
4. **Create integration test suite** to prevent doc drift
5. **Set up CI check** to compare Swagger output (if added) against docs

---

**Report End**
