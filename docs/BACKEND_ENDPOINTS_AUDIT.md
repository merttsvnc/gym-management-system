# Backend API Endpoints Audit

**Last Updated:** January 27, 2026  
**Backend Stack:** NestJS + Prisma + PostgreSQL  
**API Version:** v1

---

## A) Environment & Base Configuration

### Base URL
- **Local Development:** `http://localhost:3000`
- **Global API Prefix:** `/api/v1`
- **Full Base Path:** `http://localhost:3000/api/v1`

### Authentication Method
- **Type:** JWT Bearer Token
- **Strategy:** Passport JWT
- **Token Location:** `Authorization` header
- **Format:** `Authorization: Bearer <access_token>`
- **Token Extraction:** From `Authorization` header as Bearer token

### Token Flow
1. **Login:** `POST /api/v1/auth/login` → Returns `{ accessToken, refreshToken, user, tenant }`
2. **Use Token:** Include in all subsequent requests: `Authorization: Bearer <accessToken>`
3. **Token Payload:** Contains `{ sub: userId, email, tenantId, role }`
4. **Token Expiration:** 
   - Access Token: 900s (15 minutes) - configurable via `JWT_ACCESS_EXPIRES_IN`
   - Refresh Token: 30 days - configurable via `JWT_REFRESH_EXPIRES_IN`

### Tenant/Branch Scoping
- **Tenant ID:** Extracted from JWT token automatically (`tenantId` field in payload)
- **No explicit tenant header required** - all authenticated requests are automatically scoped to user's tenant
- **Branch Filtering:** Some endpoints accept optional `branchId` query parameter for branch-level filtering
- **TenantGuard:** Validates tenant existence and access on all protected routes (runs after JwtAuthGuard)

### Global Guards & Middleware
1. **JwtAuthGuard:** Validates JWT token and extracts user info
2. **TenantGuard:** Validates tenant access (tenant-scoped operations)
3. **RolesGuard:** Enforces role-based access control (ADMIN only for some routes)
4. **BillingStatusGuard:** Global guard that blocks operations for `SUSPENDED` tenants (auth routes exempted)
5. **ThrottlerGuard:** Rate limiting on specific endpoints (payment creation, login)

### Billing Status Behavior
- **TRIAL/ACTIVE:** Full access to all features
- **PAST_DUE:** Read-only mode enforced by frontend (backend still allows operations)
- **SUSPENDED:** Login blocked, all operations blocked except auth endpoints
- Auth endpoints (`/api/v1/auth/*`) are exempted from billing checks via `@SkipBillingStatusCheck()` decorator

### CORS Configuration
- **Enabled:** Yes
- **Origin:** `process.env.FRONTEND_URL` or `http://localhost:5173` (default)
- **Credentials:** Enabled

### Validation & Error Handling
- **Global Validation Pipe:** Enabled with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- **Global Exception Filter:** Custom `HttpExceptionFilter` for consistent error responses
- **Rate Limiting:** 
  - Login: 5 attempts per 15 minutes
  - Payment Creation: 100 requests per 15 minutes per user
  - Payment Correction: 40 requests per 15 minutes per user

---

## B) Endpoint Catalog

### 1. Authentication (`/api/v1/auth`)

All auth endpoints bypass billing status checks.

| Method | Path | Summary | Auth? | Roles | Rate Limit |
|--------|------|---------|-------|-------|------------|
| POST | `/api/v1/auth/login` | User login | No | - | 5/15min |
| GET | `/api/v1/auth/me` | Get current user info | Yes | - | - |

#### POST `/api/v1/auth/login`
**Summary:** Authenticate user and obtain JWT tokens

**Request Body:**
```json
{
  "email": "string (required, valid email)",
  "password": "string (required)"
}
```

**Success Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cuid",
    "email": "user@example.com",
    "role": "ADMIN",
    "tenantId": "tenant_cuid"
  },
  "tenant": {
    "id": "tenant_cuid",
    "name": "My Gym",
    "billingStatus": "ACTIVE"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid email or password
- `403 Forbidden`: Tenant is SUSPENDED (blocked from login)
- `429 Too Many Requests`: Rate limit exceeded (5 attempts per 15 minutes)

#### GET `/api/v1/auth/me`
**Summary:** Get current authenticated user information

**Headers Required:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "id": "user_cuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "ADMIN",
  "tenantId": "tenant_cuid",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing token

---

### 2. Members (`/api/v1/members`)

All member endpoints require authentication (JWT) and are tenant-scoped.

| Method | Path | Summary | Auth? | Roles | Request Body | Query Params |
|--------|------|---------|-------|-------|--------------|--------------|
| GET | `/api/v1/members` | List members | Yes | - | - | page, limit, branchId, status, search, includeArchived |
| GET | `/api/v1/members/:id` | Get member by ID | Yes | - | - | includePlan |
| POST | `/api/v1/members` | Create new member | Yes | - | CreateMemberDto | - |
| PATCH | `/api/v1/members/:id` | Update member | Yes | - | UpdateMemberDto | - |
| POST | `/api/v1/members/:id/status` | Change member status | Yes | - | ChangeMemberStatusDto | - |
| POST | `/api/v1/members/:id/archive` | Archive member | Yes | - | - | - |

#### GET `/api/v1/members`
**Summary:** List members with filtering and pagination

**Query Parameters:**
- `page` (optional, integer, default: 1): Page number (min: 1)
- `limit` (optional, integer, default: 20): Items per page (min: 1, max: 100)
- `branchId` (optional, string): Filter by branch
- `status` (optional, enum): Filter by status (`ACTIVE`, `PAUSED`, `INACTIVE`, `ARCHIVED`)
- `search` (optional, string): Search by name, phone, or email
- `includeArchived` (optional, boolean, default: false): Include archived members

**Success Response (200):**
```json
{
  "data": [
    {
      "id": "member_cuid",
      "tenantId": "tenant_cuid",
      "branchId": "branch_cuid",
      "firstName": "Ali",
      "lastName": "Yılmaz",
      "gender": "MALE",
      "dateOfBirth": "1990-05-15T00:00:00.000Z",
      "phone": "+905551234567",
      "email": "ali@example.com",
      "photoUrl": null,
      "membershipPlanId": "plan_cuid",
      "membershipStartDate": "2024-01-01T00:00:00.000Z",
      "membershipEndDate": "2024-12-31T00:00:00.000Z",
      "membershipPriceAtPurchase": "1200.00",
      "status": "ACTIVE",
      "pausedAt": null,
      "resumedAt": null,
      "notes": "VIP member",
      "createdAt": "2024-01-01T08:30:00.000Z",
      "updatedAt": "2024-01-10T12:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `400 Bad Request`: Invalid query parameters

#### GET `/api/v1/members/:id`
**Summary:** Get a single member by ID

**Path Parameters:**
- `id` (required, string): Member ID

**Query Parameters:**
- `includePlan` (optional, boolean, string "true"/"false"): Include full membershipPlan object

**Success Response (200):**
```json
{
  "id": "member_cuid",
  "tenantId": "tenant_cuid",
  "branchId": "branch_cuid",
  "firstName": "Ali",
  "lastName": "Yılmaz",
  "gender": "MALE",
  "dateOfBirth": "1990-05-15T00:00:00.000Z",
  "phone": "+905551234567",
  "email": "ali@example.com",
  "photoUrl": null,
  "membershipPlanId": "plan_cuid",
  "membershipStartDate": "2024-01-01T00:00:00.000Z",
  "membershipEndDate": "2024-12-31T00:00:00.000Z",
  "membershipPriceAtPurchase": "1200.00",
  "status": "ACTIVE",
  "notes": "VIP member",
  "createdAt": "2024-01-01T08:30:00.000Z",
  "updatedAt": "2024-01-10T12:15:00.000Z",
  "membershipPlan": {
    "id": "plan_cuid",
    "name": "Yıllık Üyelik",
    "durationType": "MONTHS",
    "durationValue": 12,
    "price": "1200.00"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Member not found or belongs to different tenant

#### POST `/api/v1/members`
**Summary:** Create a new member

**Request Body:**
```json
{
  "branchId": "string (required)",
  "firstName": "string (required, 1-50 chars)",
  "lastName": "string (required, 1-50 chars)",
  "phone": "string (required, 10-20 chars, international format)",
  "gender": "MALE | FEMALE (optional)",
  "dateOfBirth": "string (optional, ISO 8601 date)",
  "email": "string (optional, valid email)",
  "photoUrl": "string (optional, valid URL)",
  "membershipPlanId": "string (required)",
  "membershipStartDate": "string (optional, ISO 8601 date)",
  "membershipPriceAtPurchase": "number (optional)",
  "notes": "string (optional, max 5000 chars)"
}
```

**Success Response (201):**
```json
{
  "id": "member_cuid",
  "tenantId": "tenant_cuid",
  "branchId": "branch_cuid",
  "firstName": "Ali",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "membershipPlanId": "plan_cuid",
  "membershipStartDate": "2024-01-01T00:00:00.000Z",
  "membershipEndDate": "2024-12-31T00:00:00.000Z",
  "status": "ACTIVE",
  "createdAt": "2024-01-01T08:30:00.000Z",
  "updatedAt": "2024-01-01T08:30:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `400 Bad Request`: Validation errors (phone already exists, invalid fields)
- `403 Forbidden`: Branch or plan belongs to different tenant

#### PATCH `/api/v1/members/:id`
**Summary:** Update an existing member

**Path Parameters:**
- `id` (required, string): Member ID

**Request Body:** (All fields optional - partial update supported)
```json
{
  "firstName": "string (1-50 chars)",
  "lastName": "string (1-50 chars)",
  "phone": "string (10-20 chars)",
  "gender": "MALE | FEMALE",
  "dateOfBirth": "string (ISO 8601 date)",
  "email": "string (valid email)",
  "photoUrl": "string (valid URL)",
  "membershipPlanId": "string",
  "membershipStartDate": "string (ISO 8601 date)",
  "membershipPriceAtPurchase": "number",
  "notes": "string (max 5000 chars)"
}
```

**Success Response (200):**
```json
{
  "id": "member_cuid",
  "firstName": "Ali Updated",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Member not found or belongs to different tenant
- `400 Bad Request`: Validation errors (phone uniqueness, invalid fields)

#### POST `/api/v1/members/:id/status`
**Summary:** Change member status with validation

**Path Parameters:**
- `id` (required, string): Member ID

**Request Body:**
```json
{
  "status": "ACTIVE | PAUSED | INACTIVE (required)",
  "reason": "string (optional)"
}
```

**Success Response (200):**
```json
{
  "id": "member_cuid",
  "status": "PAUSED",
  "pausedAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Member not found
- `400 Bad Request`: Invalid status transition (e.g., from ARCHIVED)

**Note:** Cannot transition from `ARCHIVED` (terminal status). Cannot set status to `ARCHIVED` via this endpoint (use archive endpoint instead).

#### POST `/api/v1/members/:id/archive`
**Summary:** Archive a member (terminal status)

**Path Parameters:**
- `id` (required, string): Member ID

**Success Response (200):**
```json
{
  "id": "member_cuid",
  "status": "ARCHIVED",
  "updatedAt": "2024-01-15T10:00:00.000Z",
  "message": "Member archived successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Member not found

**Note:** Archiving is irreversible. Archived members cannot be reactivated.

---

### 3. Membership Plans (`/api/v1/membership-plans`)

All membership plan endpoints require authentication. Most write operations require ADMIN role.

| Method | Path | Summary | Auth? | Roles | Request Body | Query Params |
|--------|------|---------|-------|-------|--------------|--------------|
| GET | `/api/v1/membership-plans` | List plans | Yes | - | - | scope, branchId, q, includeArchived, page, limit |
| GET | `/api/v1/membership-plans/active` | List active plans | Yes | - | - | branchId, includeMemberCount |
| GET | `/api/v1/membership-plans/:id` | Get plan by ID | Yes | - | - | - |
| POST | `/api/v1/membership-plans` | Create plan | Yes | ADMIN | CreatePlanDto | - |
| PATCH | `/api/v1/membership-plans/:id` | Update plan | Yes | ADMIN | UpdatePlanDto | - |
| POST | `/api/v1/membership-plans/:id/archive` | Archive plan | Yes | ADMIN | - | - |
| POST | `/api/v1/membership-plans/:id/restore` | Restore plan | Yes | ADMIN | - | - |
| DELETE | `/api/v1/membership-plans/:id` | Delete plan | Yes | ADMIN | - | - |

#### GET `/api/v1/membership-plans`
**Summary:** List membership plans with filtering

**Query Parameters:**
- `scope` (optional, enum): Filter by scope (`TENANT`, `BRANCH`)
- `branchId` (optional, string): Filter by branch (for BRANCH-scoped plans)
- `q` or `search` (optional, string): Search by plan name
- `includeArchived` (optional, boolean, default: false): Include archived plans
- `page` (optional, integer, default: 1): Page number
- `limit` (optional, integer, default: 20): Items per page (max: 100)

**Success Response (200):**
```json
{
  "data": [
    {
      "id": "plan_cuid",
      "tenantId": "tenant_cuid",
      "scope": "TENANT",
      "branchId": null,
      "scopeKey": "TENANT",
      "name": "Yıllık Üyelik",
      "description": "12 aylık standart üyelik",
      "durationType": "MONTHS",
      "durationValue": 12,
      "price": "1200.00",
      "currency": "TRY",
      "maxFreezeDays": 30,
      "autoRenew": false,
      "status": "ACTIVE",
      "archivedAt": null,
      "sortOrder": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "totalPages": 1
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `400 Bad Request`: Invalid query parameters

#### GET `/api/v1/membership-plans/active`
**Summary:** Get all ACTIVE plans (for dropdown selection)

**Query Parameters:**
- `branchId` (optional, string): If provided, returns TENANT + that branch's BRANCH plans. Otherwise, returns TENANT plans only.
- `includeMemberCount` (optional, boolean, default: false): Include active member count per plan

**Success Response (200):**
```json
[
  {
    "id": "plan_cuid",
    "name": "Yıllık Üyelik",
    "scope": "TENANT",
    "durationType": "MONTHS",
    "durationValue": 12,
    "price": "1200.00",
    "currency": "TRY",
    "activeMemberCount": 45
  },
  {
    "id": "plan_cuid_2",
    "name": "Aylık Üyelik",
    "scope": "BRANCH",
    "branchId": "branch_cuid",
    "durationType": "MONTHS",
    "durationValue": 1,
    "price": "150.00",
    "currency": "TRY",
    "activeMemberCount": 12
  }
]
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token

#### GET `/api/v1/membership-plans/:id`
**Summary:** Get details of a specific membership plan

**Path Parameters:**
- `id` (required, string): Plan ID

**Success Response (200):**
```json
{
  "id": "plan_cuid",
  "tenantId": "tenant_cuid",
  "scope": "TENANT",
  "branchId": null,
  "name": "Yıllık Üyelik",
  "description": "12 aylık standart üyelik",
  "durationType": "MONTHS",
  "durationValue": 12,
  "price": "1200.00",
  "currency": "TRY",
  "maxFreezeDays": 30,
  "autoRenew": false,
  "status": "ACTIVE",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Plan not found or belongs to different tenant

#### POST `/api/v1/membership-plans`
**Summary:** Create a new membership plan (ADMIN only)

**Request Body:**
```json
{
  "scope": "TENANT | BRANCH (required)",
  "branchId": "string (required if scope=BRANCH)",
  "name": "string (required)",
  "description": "string (optional)",
  "durationType": "DAYS | MONTHS (required)",
  "durationValue": "integer (required, min: 1)",
  "price": "number (required, min: 0)",
  "currency": "string (required, e.g., TRY, USD)",
  "maxFreezeDays": "integer (optional, min: 0)",
  "autoRenew": "boolean (optional, default: false)",
  "sortOrder": "integer (optional)"
}
```

**Success Response (201):**
```json
{
  "id": "plan_cuid",
  "tenantId": "tenant_cuid",
  "scope": "TENANT",
  "name": "Yıllık Üyelik",
  "durationType": "MONTHS",
  "durationValue": 12,
  "price": "1200.00",
  "currency": "TRY",
  "status": "ACTIVE",
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN
- `400 Bad Request`: Validation errors, duplicate name within scope

#### PATCH `/api/v1/membership-plans/:id`
**Summary:** Update an existing membership plan (ADMIN only)

**Path Parameters:**
- `id` (required, string): Plan ID

**Request Body:** (All fields optional - partial update)
```json
{
  "name": "string",
  "description": "string",
  "durationType": "DAYS | MONTHS",
  "durationValue": "integer",
  "price": "number",
  "currency": "string",
  "maxFreezeDays": "integer",
  "autoRenew": "boolean",
  "sortOrder": "integer",
  "status": "ACTIVE | ARCHIVED"
}
```

**Success Response (200):**
```json
{
  "id": "plan_cuid",
  "name": "Yıllık Üyelik (Güncel)",
  "price": "1500.00",
  "updatedAt": "2024-01-15T11:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN
- `404 Not Found`: Plan not found
- `400 Bad Request`: Validation errors

#### POST `/api/v1/membership-plans/:id/archive`
**Summary:** Archive a membership plan (ADMIN only)

**Path Parameters:**
- `id` (required, string): Plan ID

**Success Response (200):**
```json
{
  "id": "plan_cuid",
  "status": "ARCHIVED",
  "message": "Plan arşivlendi. Bu plana bağlı 5 aktif üye bulunmaktadır.",
  "activeMemberCount": 5
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN
- `404 Not Found`: Plan not found

**Note:** Plans with active members can still be archived. Existing members retain their plan.

#### POST `/api/v1/membership-plans/:id/restore`
**Summary:** Restore an archived plan to ACTIVE status (ADMIN only)

**Path Parameters:**
- `id` (required, string): Plan ID

**Success Response (200):**
```json
{
  "id": "plan_cuid",
  "status": "ACTIVE",
  "updatedAt": "2024-01-15T12:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN
- `404 Not Found`: Plan not found
- `400 Bad Request`: Plan is not archived

#### DELETE `/api/v1/membership-plans/:id`
**Summary:** Permanently delete a plan (ADMIN only, only if no members)

**Path Parameters:**
- `id` (required, string): Plan ID

**Success Response (204):** No content

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN
- `404 Not Found`: Plan not found
- `400 Bad Request`: Plan has associated members (cannot delete)

---

### 4. Payments (`/api/v1/payments`) ⭐ FOCUS AREA

All payment endpoints require authentication and ADMIN role.

| Method | Path | Summary | Auth? | Roles | Rate Limit | Request Body | Query Params |
|--------|------|---------|-------|-------|------------|--------------|--------------|
| POST | `/api/v1/payments` | Create payment | Yes | ADMIN | 100/15min | CreatePaymentDto | - |
| GET | `/api/v1/payments` | List payments | Yes | ADMIN | - | - | memberId, branchId, paymentMethod, startDate, endDate, includeCorrections, page, limit |
| GET | `/api/v1/payments/revenue` | Revenue report | Yes | ADMIN | - | - | startDate, endDate, branchId, paymentMethod, groupBy |
| GET | `/api/v1/payments/members/:memberId` | Member payment history | Yes | ADMIN | - | - | startDate, endDate, page, limit |
| GET | `/api/v1/payments/:id` | Get payment by ID | Yes | ADMIN | - | - | - |
| POST | `/api/v1/payments/:id/correct` | Correct payment | Yes | ADMIN | 40/15min | CorrectPaymentDto | - |

#### POST `/api/v1/payments`
**Summary:** Create a new payment (ADMIN only) ⭐

**Rate Limit:** 100 requests per 15 minutes per user

**Idempotency Support:**
- Header: `Idempotency-Key: <unique_string>`
- If provided and key exists (not expired), returns cached response
- Keys expire after 24 hours

**Request Headers:**
```
Authorization: Bearer <access_token>
Idempotency-Key: <unique_string> (optional)
```

**Request Body:**
```json
{
  "memberId": "string (required)",
  "amount": "number (required, 0.01-999999.99)",
  "paidOn": "string (required, ISO 8601 date, cannot be future)",
  "paymentMethod": "CASH | CREDIT_CARD | BANK_TRANSFER | CHECK | OTHER (required)",
  "note": "string (optional, max 500 chars)"
}
```

**Payment Methods:**
- `CASH`: Nakit
- `CREDIT_CARD`: Kredi Kartı
- `BANK_TRANSFER`: Banka Havalesi
- `CHECK`: Çek
- `OTHER`: Diğer

**Success Response (201):**
```json
{
  "id": "payment_cuid",
  "tenantId": "tenant_cuid",
  "branchId": "branch_cuid",
  "memberId": "member_cuid",
  "amount": "500.00",
  "paidOn": "2024-01-15",
  "paymentMethod": "CASH",
  "note": "Aylık ödeme",
  "isCorrection": false,
  "correctedPaymentId": null,
  "isCorrected": false,
  "version": 0,
  "createdBy": "user_cuid",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "member": {
    "id": "member_cuid",
    "firstName": "Ali",
    "lastName": "Yılmaz"
  },
  "branch": {
    "id": "branch_cuid",
    "name": "Merkez Şube"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN, or member belongs to different tenant
- `404 Not Found`: Member not found
- `400 Bad Request`: Validation errors (invalid amount, future date, missing fields)
- `429 Too Many Requests`: Rate limit exceeded

**Validation Rules:**
- Amount must be between 0.01 and 999999.99
- `paidOn` cannot be in the future
- `paidOn` is stored as DATE-ONLY (business date in tenant timezone)
- Member must belong to same tenant
- Payment is automatically assigned to member's branch

#### GET `/api/v1/payments`
**Summary:** List payments with filtering and pagination (ADMIN only) ⭐

**Query Parameters:**
- `memberId` (optional, string): Filter by member
- `branchId` (optional, string): Filter by branch
- `paymentMethod` (optional, enum): Filter by payment method (`CASH`, `CREDIT_CARD`, `BANK_TRANSFER`, `CHECK`, `OTHER`)
- `startDate` (optional, ISO date string): Filter payments from this date (inclusive)
- `endDate` (optional, ISO date string): Filter payments until this date (inclusive)
- `includeCorrections` (optional, boolean, default: false): Include correction payments (`isCorrection=true`)
- `page` (optional, integer, default: 1): Page number
- `limit` (optional, integer, default: 20): Items per page (max: 100)

**Success Response (200):**
```json
{
  "data": [
    {
      "id": "payment_cuid",
      "tenantId": "tenant_cuid",
      "branchId": "branch_cuid",
      "memberId": "member_cuid",
      "amount": "500.00",
      "paidOn": "2024-01-15",
      "paymentMethod": "CASH",
      "note": "Aylık ödeme",
      "isCorrection": false,
      "correctedPaymentId": null,
      "isCorrected": false,
      "version": 0,
      "createdBy": "user_cuid",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "member": {
        "id": "member_cuid",
        "firstName": "Ali",
        "lastName": "Yılmaz"
      },
      "branch": {
        "id": "branch_cuid",
        "name": "Merkez Şube"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 250,
    "totalPages": 13
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN
- `400 Bad Request`: Invalid query parameters

**Notes:**
- By default, correction payments (`isCorrection=true`) are excluded
- Use `includeCorrections=true` to include them in results
- Date filters work on `paidOn` field (business date)
- All filters can be combined

#### GET `/api/v1/payments/revenue`
**Summary:** Get revenue report with aggregation (ADMIN only) ⭐

**Query Parameters:**
- `startDate` (optional, ISO date string): Start date for report
- `endDate` (optional, ISO date string): End date for report
- `branchId` (optional, string): Filter by branch
- `paymentMethod` (optional, enum): Filter by payment method
- `groupBy` (optional, enum): Group results by (`day`, `month`, `branch`, `paymentMethod`)

**Success Response (200):**
```json
{
  "summary": {
    "totalRevenue": "15000.00",
    "paymentCount": 75,
    "averagePayment": "200.00"
  },
  "breakdown": [
    {
      "key": "2024-01",
      "revenue": "5000.00",
      "count": 25
    },
    {
      "key": "2024-02",
      "revenue": "6000.00",
      "count": 30
    },
    {
      "key": "2024-03",
      "revenue": "4000.00",
      "count": 20
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN
- `400 Bad Request`: Invalid query parameters

**Note:** Route must be called before `/api/v1/payments/:id` to avoid path conflicts.

#### GET `/api/v1/payments/members/:memberId`
**Summary:** Get payment history for a specific member (ADMIN only) ⭐

**Path Parameters:**
- `memberId` (required, string): Member ID

**Query Parameters:**
- `startDate` (optional, ISO date string): Filter from date
- `endDate` (optional, ISO date string): Filter until date
- `page` (optional, integer, default: 1): Page number
- `limit` (optional, integer, default: 20): Items per page (max: 100)

**Success Response (200):**
```json
{
  "data": [
    {
      "id": "payment_cuid",
      "amount": "500.00",
      "paidOn": "2024-01-15",
      "paymentMethod": "CASH",
      "note": "Aylık ödeme",
      "isCorrection": false,
      "isCorrected": false,
      "version": 0,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "member": {
        "id": "member_cuid",
        "firstName": "Ali",
        "lastName": "Yılmaz"
      },
      "branch": {
        "id": "branch_cuid",
        "name": "Merkez Şube"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "totalPages": 1
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN, or member belongs to different tenant
- `404 Not Found`: Member not found

**Note:** Route must be called before `/api/v1/payments/:id` to avoid path conflicts.

#### GET `/api/v1/payments/:id`
**Summary:** Get a single payment by ID (ADMIN only) ⭐

**Path Parameters:**
- `id` (required, string): Payment ID

**Success Response (200):**
```json
{
  "id": "payment_cuid",
  "tenantId": "tenant_cuid",
  "branchId": "branch_cuid",
  "memberId": "member_cuid",
  "amount": "500.00",
  "paidOn": "2024-01-15",
  "paymentMethod": "CASH",
  "note": "Aylık ödeme",
  "isCorrection": false,
  "correctedPaymentId": null,
  "isCorrected": true,
  "version": 0,
  "createdBy": "user_cuid",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z",
  "member": {
    "id": "member_cuid",
    "firstName": "Ali",
    "lastName": "Yılmaz"
  },
  "branch": {
    "id": "branch_cuid",
    "name": "Merkez Şube"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN, or payment belongs to different tenant
- `404 Not Found`: Payment not found

**Field Explanations:**
- `isCorrection`: True if this payment is a correction of another payment
- `isCorrected`: True if this payment has been corrected by another payment
- `correctedPaymentId`: ID of the payment this one corrects (if `isCorrection=true`)
- `version`: Optimistic locking version number

#### POST `/api/v1/payments/:id/correct`
**Summary:** Correct an existing payment (ADMIN only) ⭐

**Rate Limit:** 40 requests per 15 minutes per user (stricter than creation)

**Path Parameters:**
- `id` (required, string): Payment ID to correct

**Request Body:** (All fields optional except `version`)
```json
{
  "amount": "number (optional, 0.01-999999.99)",
  "paidOn": "string (optional, ISO 8601 date, cannot be future)",
  "paymentMethod": "CASH | CREDIT_CARD | BANK_TRANSFER | CHECK | OTHER (optional)",
  "note": "string (optional, max 500 chars)",
  "correctionReason": "string (optional, max 500 chars)",
  "version": "integer (required, for optimistic locking)"
}
```

**Success Response (201):**
```json
{
  "id": "payment_cuid_new",
  "tenantId": "tenant_cuid",
  "branchId": "branch_cuid",
  "memberId": "member_cuid",
  "amount": "550.00",
  "paidOn": "2024-01-15",
  "paymentMethod": "CREDIT_CARD",
  "note": "Düzeltilmiş ödeme - tutar ve yöntem güncellendi",
  "isCorrection": true,
  "correctedPaymentId": "payment_cuid_original",
  "isCorrected": false,
  "version": 0,
  "createdBy": "user_cuid",
  "createdAt": "2024-01-15T11:00:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z",
  "warning": "Bu ödeme 90 günden eski. Düzeltme işlemi gerçekleştirildi ancak eski bir ödeme olduğu için dikkatli olunmalıdır.",
  "member": {
    "id": "member_cuid",
    "firstName": "Ali",
    "lastName": "Yılmaz"
  },
  "branch": {
    "id": "branch_cuid",
    "name": "Merkez Şube"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN, or payment belongs to different tenant
- `404 Not Found`: Payment not found
- `400 Bad Request`: Validation errors, payment already corrected (single-correction rule)
- `409 Conflict`: Version mismatch (concurrent correction attempt - optimistic locking failure)
- `429 Too Many Requests`: Rate limit exceeded

**Correction Behavior:**
1. Creates a NEW payment record with `isCorrection=true`
2. Links new payment to original via `correctedPaymentId`
3. Marks original payment as `isCorrected=true`
4. Single-correction rule: A payment can only be corrected once
5. Optimistic locking: Must provide current `version` to prevent concurrent corrections
6. Warning for payments older than 90 days

**Important Notes:**
- Correction does NOT modify the original payment
- Original payment remains in database for audit trail
- Use `version` field for optimistic locking (prevents race conditions)
- To correct a corrected payment, must correct the correction (correction chain)

---

### 5. Branches (`/api/v1/branches`)

| Method | Path | Summary | Auth? | Roles | Request Body | Query Params |
|--------|------|---------|-------|-------|--------------|--------------|
| GET | `/api/v1/branches` | List branches | Yes | - | - | page, limit |
| GET | `/api/v1/branches/:id` | Get branch by ID | Yes | - | - | - |
| POST | `/api/v1/branches` | Create branch | Yes | ADMIN | CreateBranchDto | - |
| PATCH | `/api/v1/branches/:id` | Update branch | Yes | - | UpdateBranchDto | - |
| POST | `/api/v1/branches/:id/archive` | Archive branch | Yes | - | - | - |
| POST | `/api/v1/branches/:id/restore` | Restore branch | Yes | - | - | - |
| POST | `/api/v1/branches/:id/set-default` | Set as default | Yes | - | - | - |

#### GET `/api/v1/branches`
**Summary:** List branches for the current tenant

**Query Parameters:**
- `page` (optional, integer, default: 1): Page number
- `limit` (optional, integer, default: 20): Items per page

**Success Response (200):**
```json
{
  "data": [
    {
      "id": "branch_cuid",
      "tenantId": "tenant_cuid",
      "name": "Merkez Şube",
      "address": "İstanbul, Kadıköy",
      "isDefault": true,
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "archivedAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token

#### GET `/api/v1/branches/:id`
**Summary:** Get a single branch by ID

**Path Parameters:**
- `id` (required, string): Branch ID

**Success Response (200):**
```json
{
  "id": "branch_cuid",
  "tenantId": "tenant_cuid",
  "name": "Merkez Şube",
  "address": "İstanbul, Kadıköy",
  "isDefault": true,
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Branch belongs to different tenant
- `404 Not Found`: Branch not found

#### POST `/api/v1/branches`
**Summary:** Create a new branch (ADMIN only)

**Request Body:**
```json
{
  "name": "string (required)",
  "address": "string (required)"
}
```

**Success Response (201):**
```json
{
  "id": "branch_cuid",
  "tenantId": "tenant_cuid",
  "name": "Yeni Şube",
  "address": "Ankara, Çankaya",
  "isDefault": false,
  "isActive": true,
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not ADMIN, or tenant plan limits exceeded (maxBranches)
- `400 Bad Request`: Validation errors, duplicate name within tenant

**Note:** Branch creation enforces plan limits (e.g., `maxBranches` from tenant's plan).

#### PATCH `/api/v1/branches/:id`
**Summary:** Update an existing branch

**Path Parameters:**
- `id` (required, string): Branch ID

**Request Body:** (All fields optional)
```json
{
  "name": "string",
  "address": "string"
}
```

**Success Response (200):**
```json
{
  "id": "branch_cuid",
  "name": "Güncellenmiş Şube",
  "address": "Ankara, Çankaya (Yeni Adres)",
  "updatedAt": "2024-01-15T11:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Branch belongs to different tenant
- `404 Not Found`: Branch not found
- `400 Bad Request`: Validation errors, duplicate name

#### POST `/api/v1/branches/:id/archive`
**Summary:** Archive (soft delete) a branch

**Path Parameters:**
- `id` (required, string): Branch ID

**Success Response (200):**
```json
{
  "id": "branch_cuid",
  "isActive": false,
  "archivedAt": "2024-01-15T12:00:00.000Z",
  "message": "Branch archived successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Branch belongs to different tenant
- `404 Not Found`: Branch not found
- `400 Bad Request`: Cannot archive default branch or last active branch

#### POST `/api/v1/branches/:id/restore`
**Summary:** Restore an archived branch

**Path Parameters:**
- `id` (required, string): Branch ID

**Success Response (200):**
```json
{
  "id": "branch_cuid",
  "isActive": true,
  "archivedAt": null,
  "updatedAt": "2024-01-15T13:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Branch belongs to different tenant
- `404 Not Found`: Branch not found
- `400 Bad Request`: Branch is not archived

#### POST `/api/v1/branches/:id/set-default`
**Summary:** Set a branch as the default branch for the tenant

**Path Parameters:**
- `id` (required, string): Branch ID

**Success Response (200):**
```json
{
  "id": "branch_cuid",
  "isDefault": true,
  "updatedAt": "2024-01-15T14:00:00.000Z",
  "message": "Branch set as default successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Branch belongs to different tenant
- `404 Not Found`: Branch not found

**Note:** Automatically unsets previous default branch.

---

### 6. Tenants (`/api/v1/tenants`)

| Method | Path | Summary | Auth? | Roles | Request Body | Notes |
|--------|------|---------|-------|-------|--------------|-------|
| GET | `/api/v1/tenants/current` | Get current tenant | Yes | - | - | Bypasses billing check |
| PATCH | `/api/v1/tenants/current` | Update tenant | Yes | - | UpdateTenantDto | - |

#### GET `/api/v1/tenants/current`
**Summary:** Get current tenant information

**Success Response (200):**
```json
{
  "id": "tenant_cuid",
  "name": "My Gym",
  "slug": "my-gym",
  "defaultCurrency": "TRY",
  "planKey": "SINGLE",
  "billingStatus": "ACTIVE",
  "billingStatusUpdatedAt": "2024-01-01T00:00:00.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-10T00:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Tenant not found

**Note:** This endpoint bypasses billing status checks (allows PAST_DUE tenants to read tenant info).

#### PATCH `/api/v1/tenants/current`
**Summary:** Update current tenant settings

**Request Body:** (At least one field required)
```json
{
  "name": "string (optional)",
  "defaultCurrency": "string (optional, e.g., TRY, USD, EUR)"
}
```

**Success Response (200):**
```json
{
  "id": "tenant_cuid",
  "name": "My Gym (Updated)",
  "defaultCurrency": "USD",
  "updatedAt": "2024-01-15T15:00:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `400 Bad Request`: No fields provided or validation errors
- `404 Not Found`: Tenant not found

---

### 7. Dashboard (`/api/v1/dashboard`)

Dashboard endpoints provide aggregated statistics for reporting.

| Method | Path | Summary | Auth? | Roles | Query Params |
|--------|------|---------|-------|-------|--------------|
| GET | `/api/v1/dashboard/summary` | Dashboard summary | Yes | - | branchId |
| GET | `/api/v1/dashboard/membership-distribution` | Membership distribution | Yes | - | branchId |
| GET | `/api/v1/dashboard/monthly-members` | Monthly new members | Yes | - | branchId, months |

#### GET `/api/v1/dashboard/summary`
**Summary:** Get dashboard summary statistics

**Query Parameters:**
- `branchId` (optional, string): Filter by branch

**Success Response (200):**
```json
{
  "totalMembers": 250,
  "activeMembers": 200,
  "inactiveMembers": 30,
  "expiringSoon": 15
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token

#### GET `/api/v1/dashboard/membership-distribution`
**Summary:** Get membership distribution (active member count per plan)

**Query Parameters:**
- `branchId` (optional, string): Filter by branch

**Success Response (200):**
```json
[
  {
    "planId": "plan_cuid_1",
    "planName": "Yıllık Üyelik",
    "activeMemberCount": 120
  },
  {
    "planId": "plan_cuid_2",
    "planName": "Aylık Üyelik",
    "activeMemberCount": 80
  }
]
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token

#### GET `/api/v1/dashboard/monthly-members`
**Summary:** Get monthly new members count

**Query Parameters:**
- `branchId` (optional, string): Filter by branch
- `months` (optional, integer, default: 6, max: 12): Number of months to retrieve

**Success Response (200):**
```json
[
  {
    "month": "2024-01",
    "newMembers": 25
  },
  {
    "month": "2024-02",
    "newMembers": 30
  },
  {
    "month": "2024-03",
    "newMembers": 28
  }
]
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token

---

## C) Ready-to-Use cURL Examples

### 1. Login & Get Token

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'

# Response will contain accessToken - save it!
# Export for convenience:
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 2. Get Current User Info

```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Get Member Detail

```bash
# Get member by ID (with plan included)
curl -X GET "http://localhost:3000/api/v1/members/member_cuid?includePlan=true" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. List Payments for a Member

```bash
# Get payment history for a specific member
curl -X GET "http://localhost:3000/api/v1/payments/members/member_cuid?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. List All Payments with Filters

```bash
# List payments with date range and branch filter
curl -X GET "http://localhost:3000/api/v1/payments?startDate=2024-01-01&endDate=2024-01-31&branchId=branch_cuid&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# List payments by payment method
curl -X GET "http://localhost:3000/api/v1/payments?paymentMethod=CASH&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Include correction payments
curl -X GET "http://localhost:3000/api/v1/payments?includeCorrections=true&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Create a Payment

```bash
# Create a new payment with idempotency
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-12345" \
  -d '{
    "memberId": "member_cuid",
    "amount": 500.00,
    "paidOn": "2024-01-15",
    "paymentMethod": "CASH",
    "note": "Aylık üyelik ödemesi"
  }'
```

### 7. Get Payment Detail

```bash
# Get single payment by ID
curl -X GET http://localhost:3000/api/v1/payments/payment_cuid \
  -H "Authorization: Bearer $TOKEN"
```

### 8. Correct a Payment

```bash
# Correct an existing payment (change amount and method)
curl -X POST http://localhost:3000/api/v1/payments/payment_cuid/correct \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 550.00,
    "paymentMethod": "CREDIT_CARD",
    "note": "Düzeltilmiş ödeme",
    "correctionReason": "Tutar ve ödeme yöntemi yanlış girilmişti",
    "version": 0
  }'
```

### 9. Get Revenue Report

```bash
# Get monthly revenue report
curl -X GET "http://localhost:3000/api/v1/payments/revenue?startDate=2024-01-01&endDate=2024-12-31&groupBy=month" \
  -H "Authorization: Bearer $TOKEN"

# Get revenue by branch
curl -X GET "http://localhost:3000/api/v1/payments/revenue?groupBy=branch" \
  -H "Authorization: Bearer $TOKEN"

# Get revenue by payment method
curl -X GET "http://localhost:3000/api/v1/payments/revenue?groupBy=paymentMethod" \
  -H "Authorization: Bearer $TOKEN"
```

### 10. List Active Membership Plans

```bash
# Get all active plans for dropdown
curl -X GET "http://localhost:3000/api/v1/membership-plans/active" \
  -H "Authorization: Bearer $TOKEN"

# Get plans for specific branch with member counts
curl -X GET "http://localhost:3000/api/v1/membership-plans/active?branchId=branch_cuid&includeMemberCount=true" \
  -H "Authorization: Bearer $TOKEN"
```

### 11. Create a Member

```bash
# Create a new member
curl -X POST http://localhost:3000/api/v1/members \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "branch_cuid",
    "firstName": "Ahmet",
    "lastName": "Yılmaz",
    "phone": "+905551234567",
    "gender": "MALE",
    "dateOfBirth": "1990-05-15",
    "email": "ahmet@example.com",
    "membershipPlanId": "plan_cuid",
    "membershipStartDate": "2024-01-15",
    "membershipPriceAtPurchase": 1200.00,
    "notes": "VIP üye"
  }'
```

### 12. List Members with Filters

```bash
# List active members for a branch
curl -X GET "http://localhost:3000/api/v1/members?branchId=branch_cuid&status=ACTIVE&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Search members by name
curl -X GET "http://localhost:3000/api/v1/members?search=ahmet&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### 13. Get Dashboard Summary

```bash
# Get overall dashboard summary
curl -X GET http://localhost:3000/api/v1/dashboard/summary \
  -H "Authorization: Bearer $TOKEN"

# Get summary for specific branch
curl -X GET "http://localhost:3000/api/v1/dashboard/summary?branchId=branch_cuid" \
  -H "Authorization: Bearer $TOKEN"
```

### 14. List Branches

```bash
# Get all branches
curl -X GET http://localhost:3000/api/v1/branches \
  -H "Authorization: Bearer $TOKEN"
```

### 15. Get Current Tenant

```bash
# Get tenant info (includes billing status)
curl -X GET http://localhost:3000/api/v1/tenants/current \
  -H "Authorization: Bearer $TOKEN"
```

---

## D) Common Error Responses

All endpoints follow consistent error response format:

### Standard Error Structure

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": {
    "field": "amount",
    "constraint": "Ödeme tutarı pozitif olmalıdır"
  }
}
```

### Error Status Codes

| Code | Name | Meaning | Common Causes |
|------|------|---------|---------------|
| 400 | Bad Request | Invalid input | Validation errors, missing required fields, invalid data types |
| 401 | Unauthorized | Not authenticated | Missing token, invalid token, expired token |
| 403 | Forbidden | No permission | Wrong role (not ADMIN), tenant mismatch, billing status issues |
| 404 | Not Found | Resource doesn't exist | Invalid ID, resource deleted, tenant mismatch |
| 409 | Conflict | State conflict | Optimistic locking failure (version mismatch), duplicate records |
| 429 | Too Many Requests | Rate limit exceeded | Too many login attempts, too many payment operations |
| 500 | Internal Server Error | Server error | Database errors, unexpected failures |

### Billing Status Errors

```json
{
  "statusCode": 403,
  "code": "TENANT_BILLING_LOCKED",
  "message": "Hesabınız askıya alınmıştır. Ödeme yaparak hesabınızı aktif hale getirebilirsiniz."
}
```

**Billing Status Flow:**
- **TRIAL/ACTIVE:** Full access
- **PAST_DUE:** Backend allows, frontend enforces read-only
- **SUSPENDED:** Login blocked, all operations blocked (except auth endpoints)

---

## E) Data Model Enums

### Role
- `ADMIN` - Administrator (full access)

### MemberStatus
- `ACTIVE` - Active member
- `PAUSED` - Temporarily paused
- `INACTIVE` - Inactive member
- `ARCHIVED` - Archived (terminal status)

### MemberGender
- `MALE` - Male
- `FEMALE` - Female

### DurationType
- `DAYS` - Duration in days
- `MONTHS` - Duration in months

### PlanStatus
- `ACTIVE` - Active plan
- `ARCHIVED` - Archived plan

### PlanScope
- `TENANT` - Tenant-level plan (available to all branches)
- `BRANCH` - Branch-level plan (specific to one branch)

### BillingStatus
- `TRIAL` - Trial period
- `ACTIVE` - Active subscription
- `PAST_DUE` - Payment overdue (read-only mode in frontend)
- `SUSPENDED` - Account suspended (login blocked)

### PaymentMethod
- `CASH` - Nakit
- `CREDIT_CARD` - Kredi Kartı
- `BANK_TRANSFER` - Banka Havalesi
- `CHECK` - Çek
- `OTHER` - Diğer

---

## F) Implementation Notes & Assumptions

### 1. No Users API Endpoints
- **Finding:** No user management endpoints exist (no `/api/v1/users` controller)
- **Implication:** User creation/management likely happens through admin panel or seeding
- **Assumption:** Mobile app will not need user CRUD operations (users managed separately)

### 2. Role System
- **Current:** Only `ADMIN` role exists
- **Future:** Comments indicate plans for `OWNER`, `STAFF`, `TRAINER`, `ACCOUNTANT`
- **Implementation:** RolesGuard exists but most endpoints only enforce ADMIN vs authenticated

### 3. Payment Correction Flow
- **Design:** Correction creates new payment record (immutable audit trail)
- **Single-correction rule:** Each payment can only be corrected once
- **Optimistic locking:** Uses `version` field to prevent concurrent corrections
- **90-day warning:** Corrections on payments >90 days old receive warning

### 4. Idempotency Support
- **Scope:** Payment creation only
- **Mechanism:** `Idempotency-Key` header (case-insensitive)
- **Expiration:** 24 hours
- **Storage:** `IdempotencyKey` table

### 5. Tenant Isolation
- **Automatic:** All requests automatically scoped to user's tenant via JWT
- **No header required:** Tenant ID extracted from token
- **TenantGuard:** Validates tenant exists and is accessible

### 6. Branch Scoping
- **Optional filtering:** Most list endpoints accept optional `branchId` query param
- **Plan scope:** Membership plans can be TENANT-level or BRANCH-level
- **Branch-aware plans:** TENANT plans visible to all branches, BRANCH plans only to specific branch

### 7. Pagination
- **Default:** page=1, limit=20
- **Maximum:** limit=100
- **Consistent format:** All paginated endpoints return `{ data, pagination }`

### 8. Date Handling
- **Payment dates:** Stored as DATE-ONLY (business date, tenant timezone)
- **ISO 8601:** All date inputs/outputs use ISO format
- **Future dates:** Not allowed for payment `paidOn`

### 9. Soft Delete
- **Branches:** `isActive=false`, `archivedAt` timestamp
- **Plans:** `status=ARCHIVED`, `archivedAt` timestamp
- **Members:** `status=ARCHIVED` (terminal, cannot reactivate)

### 10. Rate Limiting
- **Login:** 5 attempts per 15 minutes (per IP/user)
- **Payment creation:** 100 requests per 15 minutes per user
- **Payment correction:** 40 requests per 15 minutes per user (stricter)
- **Other endpoints:** No rate limits currently

---

## G) Mobile App Integration Checklist

For implementing payment features on mobile:

### Required Endpoints
✅ **Authentication:**
- [ ] `POST /api/v1/auth/login` - Get token
- [ ] `GET /api/v1/auth/me` - Verify token

✅ **Members:**
- [ ] `GET /api/v1/members` - List members (search, filter)
- [ ] `GET /api/v1/members/:id` - Get member detail

✅ **Payments (Core):**
- [ ] `POST /api/v1/payments` - Create payment
- [ ] `GET /api/v1/payments/members/:memberId` - Payment history
- [ ] `GET /api/v1/payments/:id` - Payment detail
- [ ] `POST /api/v1/payments/:id/correct` - Correct payment

✅ **Payments (Reporting):**
- [ ] `GET /api/v1/payments` - List all payments with filters
- [ ] `GET /api/v1/payments/revenue` - Revenue reports

✅ **Support Data:**
- [ ] `GET /api/v1/membership-plans/active` - Plans dropdown
- [ ] `GET /api/v1/branches` - Branches list
- [ ] `GET /api/v1/tenants/current` - Tenant info + billing status

### Implementation Considerations
1. **Token Management:**
   - Store `accessToken` securely
   - Implement token refresh (if refresh endpoint exists - not documented yet)
   - Handle 401 errors by redirecting to login

2. **Idempotency:**
   - Generate unique `Idempotency-Key` for payment creation
   - Store key with request to retry on network failure
   - Keys valid for 24 hours

3. **Optimistic Locking:**
   - Store `version` when fetching payment
   - Include in correction request
   - Handle 409 conflict (refresh and retry)

4. **Error Handling:**
   - Show user-friendly messages for validation errors (Turkish in DTOs)
   - Handle rate limits (429) with retry-after
   - Check billing status on login (redirect if SUSPENDED)

5. **Offline Support:**
   - Cache member list for offline search
   - Queue payment creation requests
   - Retry with idempotency key when back online

6. **Date Handling:**
   - Use device timezone for date input
   - Convert to ISO format for API
   - Display dates in local timezone

7. **Validation:**
   - Implement same validation rules as backend
   - Amount: 0.01 - 999999.99
   - Date: Cannot be future
   - Phone: International format

---

## H) Swagger/OpenAPI Documentation

**Finding:** No Swagger setup detected in codebase.

**Recommendation:** Consider adding `@nestjs/swagger` package and decorators for auto-generated API documentation.

**Current Documentation Source:** This document is manually generated from code inspection (controllers, DTOs, guards, services).

---

## Document Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-27 | Copilot | Initial comprehensive audit |

---

**End of Document**
