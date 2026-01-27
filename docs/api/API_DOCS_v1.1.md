# API Documentation v1.1

**Document Name:** API_DOCS_v1.1  
**Purpose:** Backend API contract for mobile (React Native) usage  
**Version:** 1.1  
**Last Updated:** 2026-01-20  
**Target Platform:** React Native (Expo) mobile application

---

## 1. Title & Metadata

This document serves as the authoritative API contract for the Gym Management System backend API. It is designed specifically for mobile application integration and contains verified endpoint specifications, request/response formats, and business logic rules.

**Versioning Note:** This is version 1.1 of the API documentation. All endpoints are under `/api/v1` prefix. Future API versions (e.g., v2) will be documented separately.

---

## 2. Base URL & Routing

### Base URLs

- **Development:** `http://localhost:3000/api/v1`
- **Production:** `https://api.yourdomain.com/api/v1` (placeholder - update with actual production URL)

### Routing Structure

**Important:** All endpoints are prefixed with `/api/v1`. This prefix is applied at the controller level (each controller declares its own `/api/v1/...` prefix), not via a global prefix configured in `main.ts`.

**Example:**
- Auth controller: `@Controller('api/v1/auth')` → endpoints under `/api/v1/auth`
- Members controller: `@Controller('api/v1/members')` → endpoints under `/api/v1/members`

**Mobile Integration:** Always use `/api/v1` as the base path for all API requests.

---

## 3. Authentication & Authorization

### Login Endpoint

**POST** `/api/v1/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
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
- **Access Token:** 15 minutes (900s) default, configurable via `JWT_ACCESS_EXPIRES_IN` environment variable
- **Refresh Token:** 30 days default, configurable via `JWT_REFRESH_EXPIRES_IN` environment variable

**⚠️ Important:** Refresh token endpoint (`POST /api/v1/auth/refresh`) is **NOT implemented yet**. When access token expires (401 Unauthorized), mobile apps must prompt the user to re-login.

**Expected Mobile Behavior on 401:**
1. Clear stored tokens
2. Redirect user to login screen
3. Prompt user to re-authenticate

### Current User Endpoint

**GET** `/api/v1/auth/me`

**Response:**
```json
{
  "user": {
    "id": "clxxx",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ADMIN",
    "tenantId": "clyyy"
  },
  "tenant": {
    "id": "clyyy",
    "name": "My Gym",
    "billingStatus": "ACTIVE",
    "billingStatusUpdatedAt": "2026-01-20T10:00:00.000Z"
  }
}
```

### Authorization Header

All protected endpoints require the Authorization header:

```
Authorization: Bearer <accessToken>
```

**Example:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Multi-Tenant Isolation

- JWT token contains `tenantId` claim
- All protected endpoints automatically filter data by tenant
- Attempting to access another tenant's data returns 403 Forbidden

---

## 4. Error Response Contract

All error responses follow this canonical structure:

```json
{
  "statusCode": number,
  "message": string,
  "code": string | null,
  "errors": [
    {
      "field": string,
      "message": string
    }
  ] | null,
  "timestamp": string,
  "path": string
}
```

### Field Descriptions

- **statusCode** (required): HTTP status code (400, 401, 403, 404, 409, 500, etc.)
- **message** (required): Human-readable error message
- **code** (optional): Error code for programmatic handling (e.g., "TENANT_BILLING_LOCKED"). May be `null`.
- **errors** (optional): Array of field-level validation errors. **Only appears for validation errors (400)**. May be `null`.
- **timestamp** (required): ISO 8601 timestamp of error occurrence
- **path** (required): Request path that caused the error

### Error Examples

#### 400 Validation Error

```json
{
  "statusCode": 400,
  "message": "email must be an email. password must be longer than or equal to 8 characters",
  "code": null,
  "errors": [
    {
      "field": "email",
      "message": "email must be an email"
    },
    {
      "field": "password",
      "message": "password must be longer than or equal to 8 characters"
    }
  ],
  "timestamp": "2026-01-20T10:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

#### 401 Unauthorized

```json
{
  "statusCode": 401,
  "message": "Invalid email or password",
  "code": null,
  "errors": null,
  "timestamp": "2026-01-20T10:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

#### 403 Forbidden

```json
{
  "statusCode": 403,
  "message": "Access denied. Required roles: ADMIN",
  "code": null,
  "errors": null,
  "timestamp": "2026-01-20T10:00:00.000Z",
  "path": "/api/v1/payments"
}
```

#### 404 Not Found

```json
{
  "statusCode": 404,
  "message": "Üye bulunamadı",
  "code": null,
  "errors": null,
  "timestamp": "2026-01-20T10:00:00.000Z",
  "path": "/api/v1/members/abc123"
}
```

#### 409 Conflict

```json
{
  "statusCode": 409,
  "message": "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.",
  "code": null,
  "errors": null,
  "timestamp": "2026-01-20T10:00:00.000Z",
  "path": "/api/v1/members"
}
```

#### 500 Internal Server Error

```json
{
  "statusCode": 500,
  "message": "Sunucu hatası",
  "code": null,
  "errors": null,
  "timestamp": "2026-01-20T10:00:00.000Z",
  "path": "/api/v1/members"
}
```

---

## 5. Member Domain – Status Model

**CRITICAL CONCEPT:** Members have **TWO different status concepts** that serve different purposes.

### A) Persisted Workflow Status (`status`)

**Field:** `status`  
**Type:** Enum  
**Values:** `ACTIVE` | `PAUSED` | `INACTIVE` | `ARCHIVED`  
**Storage:** Stored in database  
**Changed via:** Member status endpoints (see section 6)

**Status Meanings:**
- **ACTIVE:** Member is active and operational
- **PAUSED:** Membership is temporarily frozen (pause period doesn't count toward membership duration)
- **INACTIVE:** Member is manually deactivated by staff
- **ARCHIVED:** Terminal state - member record is archived (set only via archive endpoint)

**Important:** `ARCHIVED` is a terminal state and cannot be changed via the status update endpoint. It can only be set via `POST /api/v1/members/:id/archive`.

### B) Derived Membership State (`membershipState`)

**Field:** `membershipState`  
**Type:** Enum  
**Values:** `ACTIVE` | `EXPIRED`  
**Storage:** **NOT stored** - computed on every read  
**Calculation:** Derived from `membershipEndDate`

**Calculation Rules:**
- **ACTIVE:** `membershipEndDate >= today` (start of day, server timezone)
- **EXPIRED:** `membershipEndDate < today` OR `membershipEndDate IS NULL`

**Date Comparison Logic:**
- Uses start-of-day comparison (00:00:00, server timezone)
- Time portion is ignored
- If `membershipEndDate` is `null`, membership is considered EXPIRED

**Server timezone:** The timezone of the environment running the backend (currently the developer's local machine). All date comparisons use server local time at start-of-day (00:00:00). In production, we will standardize the backend runtime timezone (recommended: UTC) and update this document accordingly.

**Members without a membership plan (membershipEndDate = null) are always considered EXPIRED and counted as inactive in dashboard metrics.**

**Always Returned:** `membershipState` is **ALWAYS** included in member responses.

### Derived Helper Fields

All member responses include these computed fields:

- **`isMembershipActive`** (boolean): `true` if `membershipState === 'ACTIVE'`
- **`daysRemaining`** (number | null): Days until membership expires. `0` if expired, `null` if no `membershipEndDate`
- **`isExpiringSoon`** (boolean): `true` if active (`membershipState === 'ACTIVE'`) and expires within 7 days (inclusive)

### Usage Guidelines

**Dashboard Metrics:**
- Dashboard metrics use **derived `membershipState`** (date-based), **NOT** persisted `status`
- A member with `status=PAUSED` but `membershipEndDate >= today` counts as **active** in dashboard
- A member with `status=ACTIVE` but `membershipEndDate < today` counts as **inactive** in dashboard

**Mobile UI:**
- Display both states to staff (e.g., "Status: ACTIVE | Membership: EXPIRED")
- Use `membershipState` for access control (gym entry eligibility)
- Use `status` for business workflows (paused members, archived records)
- Use `isExpiringSoon` to show warnings for memberships expiring soon

**Example Member Response:**
```json
{
  "id": "clxxx",
  "firstName": "John",
  "lastName": "Doe",
  "status": "PAUSED",
  "membershipEndDate": "2026-02-15T00:00:00.000Z",
  "membershipState": "ACTIVE",
  "isMembershipActive": true,
  "daysRemaining": 26,
  "isExpiringSoon": false
}
```

---

## 6. Member Status Endpoints

### Update Member Status

**POST** `/api/v1/members/:id/status`

**Request:**
```json
{
  "status": "ACTIVE" | "PAUSED" | "INACTIVE"
}
```

**Allowed Values:** `ACTIVE` | `PAUSED` | `INACTIVE`

**⚠️ Important:** `ARCHIVED` **cannot** be set via this endpoint. Use `POST /api/v1/members/:id/archive` instead.

**Status Transition Rules:**

| From | To | Allowed |
|------|-----|---------|
| ACTIVE | PAUSED | ✅ |
| ACTIVE | INACTIVE | ✅ |
| PAUSED | ACTIVE | ✅ |
| PAUSED | INACTIVE | ✅ |
| INACTIVE | ACTIVE | ✅ |
| INACTIVE | PAUSED | ✅ |
| ARCHIVED | Any | ❌ (terminal state) |
| Any | ARCHIVED | ❌ (use archive endpoint) |

**Special Behaviors:**

1. **ACTIVE → PAUSED:**
   - Sets `pausedAt` timestamp
   - Preserves `membershipEndDate` (does not modify it)
   - Membership duration is frozen during pause period

2. **PAUSED → ACTIVE:**
   - Extends `membershipEndDate` by pause duration (time between `pausedAt` and `resumedAt`)
   - Sets `resumedAt` timestamp
   - Clears `pausedAt` timestamp

3. **PAUSED → INACTIVE:**
   - Clears `pausedAt` and `resumedAt` timestamps
   - Deactivates member

**Response:** Returns updated `Member` object with all derived fields.

### Archive Member

**POST** `/api/v1/members/:id/archive`

**Request:** None (empty body)

**Behavior:**
- Sets `status` to `ARCHIVED`
- Terminal action - archived members cannot be reactivated
- Archived members are excluded from standard listings (unless `includeArchived=true` is specified)

**Response:** Returns archived `Member` object.

---

## 7. Dashboard Metrics Definitions

**GET** `/api/v1/dashboard/summary`

**Query Parameters:**
- `branchId?` (string): Optional branch filter

**Response:**
```json
{
  "totalMembers": 150,
  "activeMembers": 120,
  "inactiveMembers": 30,
  "expiringSoon": 5
}
```

### Metric Definitions

#### `totalMembers`

**Formula:** `COUNT(*) WHERE tenantId = ? [AND branchId = ?]`

**Description:** Total count of all members (tenant-wide or filtered by branchId). Includes all statuses (ACTIVE, PAUSED, INACTIVE, ARCHIVED) unless explicitly filtered.

#### `activeMembers`

**Formula:** `COUNT(*) WHERE tenantId = ? [AND branchId = ?] AND membershipEndDate >= today`

**Description:** Count of members with valid membership (where `membershipEndDate >= today`, start of day, server timezone).

**⚠️ Critical:** Uses **derived membership state** (date-based), **NOT** persisted `status` field.

**Edge Cases:**
- Member with `status=PAUSED` but `membershipEndDate >= today` → counts as **active**
- Member with `status=ACTIVE` but `membershipEndDate < today` → counts as **inactive**
- Member with `status=INACTIVE` but `membershipEndDate >= today` → counts as **active**

#### `inactiveMembers`

**Formula:** `totalMembers - activeMembers`

**Description:** Members without valid membership.

**Includes:**
- Expired members (`membershipEndDate < today`)
- Members without membership (`membershipEndDate IS NULL`)
- Archived members (if not filtered out)
- Paused/inactive members with expired plans

#### `expiringSoon`

**Formula:** `COUNT(*) WHERE tenantId = ? [AND branchId = ?] AND membershipEndDate >= today AND membershipEndDate <= today+7`

**Description:** Active members expiring within next 7 days (inclusive).

**Details:**
- Subset of `activeMembers`
- 7-day window is inclusive (today and today+7 both count)
- Only includes members with active membership (not expired)

### Important Notes

1. **Metrics use DATE-BASED membership state**, not persisted `status` field
2. A member with `status=PAUSED` but `membershipEndDate >= today` counts as `activeMembers`
3. A member with `status=ACTIVE` but `membershipEndDate < today` counts as `inactiveMembers`
4. Archived members are included in `totalMembers` and `inactiveMembers` (unless filtered out)
5. **Server timezone:** The timezone of the environment running the backend (currently the developer's local machine). All date comparisons use server local time at start-of-day (00:00:00). In production, we will standardize the backend runtime timezone (recommended: UTC) and update this document accordingly.

### Other Dashboard Endpoints

#### Membership Distribution

**GET** `/api/v1/dashboard/membership-distribution`

**Response:**
```json
[
  {
    "planId": "clxxx",
    "planName": "Monthly Plan",
    "activeMemberCount": 45
  }
]
```

**Definition:** Active member count per plan (where `membershipEndDate >= today`, grouped by `membershipPlanId`).

#### Monthly Members

**GET** `/api/v1/dashboard/monthly-members`

**Query Parameters:**
- `branchId?` (string): Optional branch filter
- `months?` (number): Number of months to include (default: 6, max: 12, min: 1)

**Response:**
```json
[
  {
    "month": "2025-12",
    "newMembers": 15
  },
  {
    "month": "2026-01",
    "newMembers": 8
  }
]
```

**Definition:** New members by month (counts members by `createdAt`, grouped by month `YYYY-MM`). Includes all months in range, even if `newMembers = 0`. Returns months in chronological order (oldest first).

---

## 8. Payments – Correction & Versioning

### Get Payment (to obtain version)

**GET** `/api/v1/payments/:id`

**Response:**
```json
{
  "id": "clxxx",
  "memberId": "clyyy",
  "amount": 500.00,
  "paidOn": "2026-01-15T00:00:00.000Z",
  "paymentMethod": "CASH",
  "version": 5,
  ...
}
```

**Important:** The `version` field is included in the payment response. This is required for correction requests.

### Correct Payment

**POST** `/api/v1/payments/:id/correct`

**Request:**
```json
{
  "amount": 600.00,
  "paidOn": "2026-01-15T00:00:00.000Z",
  "paymentMethod": "CARD",
  "note": "Corrected amount",
  "correctionReason": "Amount was incorrect",
  "version": 5
}
```

**Optimistic Locking:**
- `version` is **required** in correction request
- `version` must match the current version in database
- If version mismatch → 409 Conflict error
- Prevents concurrent corrections from overwriting each other

**Workflow:**
1. Mobile app calls `GET /api/v1/payments/:id` to get current payment data
2. Mobile app extracts `version` from response
3. Mobile app sends correction request with same `version`
4. Backend validates version matches current database version
5. If mismatch → 409 Conflict (mobile should refresh and retry)

**409 Conflict Response (Version Mismatch):**
```json
{
  "statusCode": 409,
  "message": "Ödeme başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.",
  "code": null,
  "errors": null,
  "timestamp": "2026-01-20T10:00:00.000Z",
  "path": "/api/v1/payments/clxxx/correct"
}
```

**Mobile Behavior on 409:**
1. Refresh payment data (`GET /api/v1/payments/:id`)
2. Get new `version` from response
3. Prompt user to retry correction with updated data

**Warning Field (Optional):**

If correcting a payment older than 90 days, the response includes an optional `warning` field:

**Response (with warning):**
```json
{
  "id": "clxxx",
  "amount": 600.00,
  ...
  "warning": "Bu ödeme 90 günden eski. Düzeltme işlemi gerçekleştirildi ancak eski bir ödeme olduğu için dikkatli olunmalıdır."
}
```

**Single-Correction Rule:**
- Each payment can only be corrected **once**
- If `isCorrected=true`, attempting another correction returns 400 Bad Request

---

## 9. RBAC (Role-Based Access Control)

### Current Reality

**Enforced ADMIN Endpoints:**
- `POST /api/v1/branches` - Create branch
- All payment endpoints (`GET`, `POST`, `POST /correct`) - View and manage payments
- All membership plan write endpoints (`POST`, `PATCH`, `POST /archive`, `POST /restore`, `DELETE`) - Manage plans

**⚠️ NOT Enforced (Marked as "ADMIN (TODO)"):**

The following endpoints are documented as requiring ADMIN role but **currently do NOT enforce it server-side**:

1. `PATCH /api/v1/tenants/current` - Update tenant settings
2. `PATCH /api/v1/branches/:id` - Update branch
3. `POST /api/v1/branches/:id/archive` - Archive branch
4. `POST /api/v1/branches/:id/restore` - Restore branch
5. `POST /api/v1/branches/:id/set-default` - Set default branch

**⚠️ Security Warning for Mobile:**

Mobile apps **MUST** implement client-side role checks to hide these actions from non-ADMIN users until server-side enforcement is added.

**Recommended Mobile Behavior:**
- Check user role from JWT token or `/auth/me` response
- Hide/disable admin-only UI elements for `USER` role
- Display appropriate error message if USER attempts these actions (even though server currently allows it)

**Future:** Backend will add `@Roles('ADMIN')` decorators to these endpoints. Mobile apps should prepare for this change.

---

## 10. Query Parameters & Pagination

### Query Parameter Usage

#### Members Endpoint

**GET** `/api/v1/members`

**Query Parameters:**
- `search?` (string): Searches across `firstName`, `lastName`, and `phone` (case-insensitive substring match)
- `status?` (enum): Filter by `ACTIVE` | `PAUSED` | `INACTIVE` | `ARCHIVED`
- `branchId?` (string): Filter by branch
- `membershipPlanId?` (string): Filter by membership plan
- `includeArchived?` (boolean): Include archived members (default: `false`)
- `page?` (number): Page number (default: `1`)
- `limit?` (number): Items per page (default: `20`, max: `100`)

**Note:** Members endpoint uses `search` parameter (not `q`).

#### Membership Plans Endpoint

**GET** `/api/v1/membership-plans`

**Query Parameters:**
- `q?` (string): Name search (case-insensitive substring match) - **Preferred**
- `search?` (string): Legacy parameter (accepted for backward compatibility, same as `q`)
- `scope?` (enum): Filter by `TENANT` or `BRANCH`
- `branchId?` (string): Filter by branch (only works if `scope=BRANCH` or omitted)
- `status?` (enum): Filter by `ACTIVE` or `ARCHIVED`
- `includeArchived?` (boolean): Include archived plans (default: `false`)
- `page?` (number): Page number (default: `1`)
- `limit?` (number): Items per page (default: `20`, max: `100`)

**Important:** If both `q` and `search` are provided, `q` takes precedence.

**Note:** Plans endpoint accepts both `q` and `search` (inconsistency with Members endpoint - consider standardizing in future).

### Pagination

**Default Values:**
- `page`: `1` (if omitted)
- `limit`: `20` (if omitted)
- `max limit`: `100` (enforced by validation)
- `min limit`: `1` (enforced by validation)

**Pagination Response Format:**

All list endpoints return the same pagination envelope: `{ data, pagination }`.

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Field Descriptions:**
- `page`: Current page number (1-indexed)
- `limit`: Items per page
- `total`: Total number of items across all pages
- `totalPages`: Total number of pages

**Consistency:** These defaults apply consistently across all list endpoints (Members, Branches, Plans, Payments).

---

## 11. Mobile Integration Notes

### Auth Flow Expectations

1. **Login:**
   - Store both `accessToken` and `refreshToken` securely
   - Store `user` and `tenant` objects for UI display
   - Note: Refresh endpoint not implemented - handle 401 by redirecting to login

2. **Token Management:**
   - Access token expires in 15 minutes
   - Refresh token expires in 30 days
   - On 401 Unauthorized: Clear tokens, redirect to login

3. **Current User:**
   - Call `GET /api/v1/auth/me` on app startup to verify token validity
   - Use response to populate user context and tenant information

### Error Handling Expectations

1. **Parse Error Responses:**
   - Always check `statusCode` field
   - For 400 validation errors, display `errors` array to user
   - For 401, redirect to login
   - For 403, show permission denied message
   - For 409, handle version conflicts (payments) or duplicate entries

2. **Error Display:**
   - Show `message` field to user
   - For validation errors, highlight specific fields using `errors` array
   - Log `timestamp` and `path` for debugging

### Status Fields Usage

1. **Display Both States:**
   - Show persisted `status` (ACTIVE/PAUSED/INACTIVE/ARCHIVED) for business context
   - Show derived `membershipState` (ACTIVE/EXPIRED) for access control

2. **Access Control:**
   - Use `membershipState` to determine gym entry eligibility
   - Use `isExpiringSoon` to show warnings

3. **Status Updates:**
   - Only allow transitions documented in section 6
   - Disable invalid transition buttons in UI
   - Show clear error messages for invalid transitions

### Dashboard Interpretation Rules

1. **Metrics Understanding:**
   - `activeMembers` uses date-based calculation, not `status` field
   - A paused member with valid membership counts as active
   - An active member with expired membership counts as inactive

2. **Display Logic:**
   - Show `expiringSoon` count prominently for staff attention
   - Use `membershipDistribution` to show plan popularity
   - Use `monthlyMembers` to show growth trends

### General Best Practices

1. **Always Include Authorization Header:**
   - Format: `Authorization: Bearer <accessToken>`
   - Include on all protected endpoints

2. **Handle Rate Limits:**
   - Login: 5 requests / 15 minutes
   - Payment Create: 100 requests / 15 minutes
   - Payment Correct: 40 requests / 15 minutes
   - On 429 Too Many Requests, show user-friendly message and retry after delay

3. **Optimistic Locking (Payments):**
   - Always get current `version` before correction
   - Handle 409 Conflict gracefully (refresh and retry)

4. **Client-Side RBAC:**
   - Hide admin-only actions for non-ADMIN users
   - Prepare for server-side enforcement changes

5. **Pagination:**
   - Always implement pagination for list endpoints
   - Use default values if not specified
   - Respect `max limit` of 100

---

## API Endpoints Summary

### Authentication
- `POST /api/v1/auth/login` - Login (returns accessToken, refreshToken, user, tenant)
- `GET /api/v1/auth/me` - Get current user (returns user, tenant)

### Tenants
- `GET /api/v1/tenants/current` - Get current tenant
- `PATCH /api/v1/tenants/current` - Update tenant (ADMIN not enforced - TODO)

### Members
- `GET /api/v1/members` - List members (paginated, supports search, status, branchId filters)
- `GET /api/v1/members/:id` - Get member details
- `POST /api/v1/members` - Create member
- `PATCH /api/v1/members/:id` - Update member
- `POST /api/v1/members/:id/status` - Update member status (ACTIVE/PAUSED/INACTIVE)
- `POST /api/v1/members/:id/archive` - Archive member (terminal)

### Branches
- `GET /api/v1/branches` - List branches (paginated)
- `GET /api/v1/branches/:id` - Get branch details
- `POST /api/v1/branches` - Create branch (ADMIN required)
- `PATCH /api/v1/branches/:id` - Update branch (ADMIN not enforced - TODO)
- `POST /api/v1/branches/:id/archive` - Archive branch (ADMIN not enforced - TODO)
- `POST /api/v1/branches/:id/restore` - Restore branch (ADMIN not enforced - TODO)
- `POST /api/v1/branches/:id/set-default` - Set default branch (ADMIN not enforced - TODO)

### Membership Plans
- `GET /api/v1/membership-plans` - List plans (paginated, supports q/search, scope, branchId filters)
- `GET /api/v1/membership-plans/active` - Get active plans (for dropdowns)
- `GET /api/v1/membership-plans/:id` - Get plan details
- `POST /api/v1/membership-plans` - Create plan (ADMIN required)
- `PATCH /api/v1/membership-plans/:id` - Update plan (ADMIN required)
- `POST /api/v1/membership-plans/:id/archive` - Archive plan (ADMIN required)
- `POST /api/v1/membership-plans/:id/restore` - Restore plan (ADMIN required)
- `DELETE /api/v1/membership-plans/:id` - Delete plan (ADMIN required, only if no members)

### Payments
- `POST /api/v1/payments` - Create payment (ADMIN required, supports Idempotency-Key)
- `GET /api/v1/payments` - List payments (ADMIN required, paginated, supports filters)
- `GET /api/v1/payments/revenue` - Get revenue report (ADMIN required)
- `GET /api/v1/payments/members/:memberId` - Get member payment history (ADMIN required)
- `GET /api/v1/payments/:id` - Get payment details (ADMIN required, includes version)
- `POST /api/v1/payments/:id/correct` - Correct payment (ADMIN required, requires version)

### Dashboard
- `GET /api/v1/dashboard/summary` - Get dashboard summary (totalMembers, activeMembers, inactiveMembers, expiringSoon)
- `GET /api/v1/dashboard/membership-distribution` - Get membership distribution by plan
- `GET /api/v1/dashboard/monthly-members` - Get monthly new members (supports months parameter)

---

## Common Response Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET, PATCH requests |
| 201 | Created | Successful POST requests (create operations) |
| 204 | No Content | Successful DELETE requests |
| 400 | Bad Request | Validation errors, invalid input |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient permissions, tenant mismatch |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Version mismatch, duplicate entry |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

---

## Validation

- Global `ValidationPipe` is active with:
  - `whitelist: true` (strips unknown properties)
  - `forbidNonWhitelisted: true` (rejects unknown properties)
  - `transform: true` (auto-transforms query params to correct types)

---

## Rate Limiting

- **Login:** 5 requests / 15 minutes
- **Payment Create:** 100 requests / 15 minutes / user
- **Payment Correct:** 40 requests / 15 minutes / user

On rate limit exceeded (429), retry after the specified time window.

---

## Idempotency (Payments Only)

**POST** `/api/v1/payments` supports `Idempotency-Key` header:

```
Idempotency-Key: <unique-key>
```

- Same key within 24 hours returns cached result
- Key is case-insensitive
- Prevents duplicate payment creation

---

## Version History

- **v1.1** (2026-01-20): Revised documentation based on API audit
  - Fixed error response format
  - Documented refresh token in login response
  - Clarified member status vs membership state
  - Added dashboard metrics definitions
  - Documented payment versioning workflow
  - Clarified RBAC enforcement status
  - Standardized pagination defaults
  - Added mobile integration notes

---

**Document End**
