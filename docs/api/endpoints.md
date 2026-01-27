# API Endpoint Documentation

Bu doküman, Gym Management System backend API'sinin tüm HTTP endpoint'lerini içerir. Mobile uygulama geliştiricileri için hazırlanmıştır.

## Overview

- **Base URL**: `http://localhost:3000` (development)
- **Global Prefix**: Yok (her controller kendi path'ini belirtir)
- **API Version**: `v1` (tüm endpoint'ler `/api/v1/` prefix'i kullanır)
- **Authentication**: JWT Bearer Token (çoğu endpoint için gerekli)
- **Content-Type**: `application/json`

## Authentication & Headers

### Required Headers

**Public Endpoints (Login):**

```
Content-Type: application/json
```

**Protected Endpoints (Diğer tüm endpoint'ler):**

```
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
```

**Multi-Tenant Isolation:**

- JWT token içinde `tenantId` bilgisi bulunur
- TenantGuard, tüm protected endpoint'lerde otomatik olarak tenant izolasyonunu sağlar
- `branchId` bazı endpoint'lerde query parameter veya body field olarak kullanılır

**Rate Limiting:**

- Login: 5 request / 15 dakika
- Payment Create: 100 request / 15 dakika / kullanıcı
- Payment Correct: 40 request / 15 dakika / kullanıcı

**Idempotency (Sadece Payment Create):**

```
Idempotency-Key: <unique-key>
```

- Ödeme oluşturma işlemlerinde aynı key ile tekrar istek atılırsa cache'lenmiş sonuç döner
- Key'ler 24 saat geçerlidir

### JWT Token Structure

Token payload:

```typescript
{
  sub: string; // user id
  email: string; // user email
  tenantId: string; // tenant id (multi-tenant isolation)
  role: string; // USER | ADMIN
}
```

### Role-Based Access Control

- **ADMIN**: Tam yetki (create, update, delete, archive)
- **USER**: Sadece okuma ve temel işlemler

## API Endpoints

### 1. Authentication (`/api/v1/auth`)

| Method | Path                 | Auth   | Request                      | Response                | Notes                                          |
| ------ | -------------------- | ------ | ---------------------------- | ----------------------- | ---------------------------------------------- |
| POST   | `/api/v1/auth/login` | Public | `LoginDto` (email, password) | `{ accessToken, user }` | Rate limit: 5/15min. SkipBillingStatusCheck.   |
| GET    | `/api/v1/auth/me`    | JWT    | -                            | `UserWithTenant`        | CurrentUser decorator. SkipBillingStatusCheck. |

**Controller:** `auth.controller.ts` → `AuthController`

**Guards:**

- Login: `ThrottlerGuard`
- /me: `JwtAuthGuard` (implicit via @CurrentUser)

**DTOs:**

- Request: `LoginDto` (email: string, password: string)
- Response: { accessToken: string, user: { id, email, tenantId, role } }

---

### 2. Tenants (`/api/v1/tenants`)

| Method | Path                      | Auth              | Request                                     | Response | Notes                                                            |
| ------ | ------------------------- | ----------------- | ------------------------------------------- | -------- | ---------------------------------------------------------------- |
| GET    | `/api/v1/tenants/current` | JWT + TenantGuard | -                                           | `Tenant` | SkipBillingStatusCheck. Returns tenant with billingStatus field. |
| PATCH  | `/api/v1/tenants/current` | JWT + TenantGuard | `UpdateTenantDto` (name?, defaultCurrency?) | `Tenant` | ADMIN role (TODO). At least one field required.                  |

**Controller:** `tenants.controller.ts` → `TenantsController`

**Guards:** `JwtAuthGuard`, `TenantGuard`

**DTOs:**

- Request: `UpdateTenantDto` (name?: string, defaultCurrency?: string)
- Response: Tenant object

**Notes:**

- `/current` endpoint, PAST_DUE tenant'ların tenant bilgisini görmesine izin verir (read-only mode)

---

### 3. Members (`/api/v1/members`)

| Method | Path                          | Auth              | Request                             | Response               | Notes                                                             |
| ------ | ----------------------------- | ----------------- | ----------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| GET    | `/api/v1/members`             | JWT + TenantGuard | `MemberListQueryDto` (query params) | `{ data, pagination }` | Filter: status, search, branchId, membershipPlanId, etc.          |
| GET    | `/api/v1/members/:id`         | JWT + TenantGuard | Params: id. Query: includePlan?     | `Member`               | includePlan=true → full membershipPlan object included            |
| POST   | `/api/v1/members`             | JWT + TenantGuard | `CreateMemberDto`                   | `Member`               | 201 Created. Phone uniqueness within tenant.                      |
| PATCH  | `/api/v1/members/:id`         | JWT + TenantGuard | `UpdateMemberDto`                   | `Member`               | Phone uniqueness check (excluding current member).                |
| POST   | `/api/v1/members/:id/status`  | JWT + TenantGuard | `ChangeMemberStatusDto` (status)    | `Member`               | Status transition validation. Cannot set ARCHIVED via this route. |
| POST   | `/api/v1/members/:id/archive` | JWT + TenantGuard | -                                   | `Member`               | Terminal action. Archived members cannot be reactivated.          |

**Controller:** `members.controller.ts` → `MembersController`

**Guards:** `JwtAuthGuard`, `TenantGuard`

**DTOs:**

- Request:
  - `CreateMemberDto`: firstName, lastName, phone, email?, birthDate?, gender?, membershipPlanId, branchId, membershipStartDate?, notes?, emergencyContact?
  - `UpdateMemberDto`: Partial of CreateMemberDto
  - `ChangeMemberStatusDto`: status (ACTIVE | INACTIVE | FROZEN)
  - `MemberListQueryDto`: status?, search?, branchId?, membershipPlanId?, page?, limit?
- Response: Member object, Paginated member list

**Notes:**

- Member'lar tenant izolasyonuna tabidir
- Phone uniqueness check tenant scope'unda yapılır
- Status transitions: Cannot transition from ARCHIVED. Cannot set ARCHIVED via /status.

---

### 4. Branches (`/api/v1/branches`)

| Method | Path                               | Auth                      | Request                              | Response               | Notes                                                            |
| ------ | ---------------------------------- | ------------------------- | ------------------------------------ | ---------------------- | ---------------------------------------------------------------- |
| GET    | `/api/v1/branches`                 | JWT + TenantGuard         | `BranchListQueryDto` (page?, limit?) | `{ data, pagination }` | Lists branches for tenant.                                       |
| GET    | `/api/v1/branches/:id`             | JWT + TenantGuard         | Params: id                           | `Branch`               | Returns 403 if branch belongs to different tenant.               |
| POST   | `/api/v1/branches`                 | JWT + TenantGuard + ADMIN | `CreateBranchDto`                    | `Branch`               | 201 Created. Enforces plan limits (maxBranches).                 |
| PATCH  | `/api/v1/branches/:id`             | JWT + TenantGuard         | `UpdateBranchDto`                    | `Branch`               | ADMIN role (TODO).                                               |
| POST   | `/api/v1/branches/:id/archive`     | JWT + TenantGuard         | -                                    | `Branch`               | ADMIN role (TODO). Cannot archive default or last active branch. |
| POST   | `/api/v1/branches/:id/restore`     | JWT + TenantGuard         | -                                    | `Branch`               | ADMIN role (TODO). Restores archived branch.                     |
| POST   | `/api/v1/branches/:id/set-default` | JWT + TenantGuard         | -                                    | `Branch`               | ADMIN role (TODO). Unsets previous default.                      |

**Controller:** `branches.controller.ts` → `BranchesController`

**Guards:** `JwtAuthGuard`, `TenantGuard`, `RolesGuard` (POST /branches)

**Roles:** `@Roles('ADMIN')` on POST /branches

**DTOs:**

- Request:
  - `CreateBranchDto`: name, address?, phone?, email?
  - `UpdateBranchDto`: Partial of CreateBranchDto
  - `BranchListQueryDto`: page?, limit?
- Response: Branch object, Paginated branch list

**Notes:**

- Branch creation enforces tenant plan limits (maxBranches)
- Default branch cannot be archived
- Cannot archive last active branch

---

### 5. Membership Plans (`/api/v1/membership-plans`)

| Method | Path                                   | Auth                      | Request                               | Response                                      | Notes                                                                    |
| ------ | -------------------------------------- | ------------------------- | ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/v1/membership-plans`             | JWT + TenantGuard         | `PlanListQueryDto` (query params)     | `{ data, pagination }`                        | Filter: scope, branchId, q, includeArchived, page, limit                 |
| GET    | `/api/v1/membership-plans/active`      | JWT + TenantGuard         | Query: branchId?, includeMemberCount? | `Plan[]`                                      | Active plans for dropdown. TENANT + BRANCH plans if branchId provided.   |
| GET    | `/api/v1/membership-plans/:id`         | JWT + TenantGuard         | Params: id                            | `Plan`                                        | Get single plan details.                                                 |
| POST   | `/api/v1/membership-plans`             | JWT + TenantGuard + ADMIN | `CreatePlanDto`                       | `Plan`                                        | 201 Created. scope: TENANT or BRANCH. branchId required if scope=BRANCH. |
| PATCH  | `/api/v1/membership-plans/:id`         | JWT + TenantGuard + ADMIN | `UpdatePlanDto`                       | `Plan`                                        | Update plan details.                                                     |
| POST   | `/api/v1/membership-plans/:id/archive` | JWT + TenantGuard + ADMIN | -                                     | `{ id, status, message, activeMemberCount? }` | Soft delete. Warning if plan has active members.                         |
| POST   | `/api/v1/membership-plans/:id/restore` | JWT + TenantGuard + ADMIN | -                                     | `Plan`                                        | Restore archived plan to ACTIVE.                                         |
| DELETE | `/api/v1/membership-plans/:id`         | JWT + TenantGuard + ADMIN | -                                     | 204 No Content                                | Hard delete. Only allowed if plan has no members.                        |

**Controller:** `membership-plans.controller.ts` → `MembershipPlansController`

**Guards:** `JwtAuthGuard`, `TenantGuard`, `RolesGuard` (POST, PATCH, DELETE)

**Roles:** `@Roles('ADMIN')` on POST, PATCH, POST /archive, POST /restore, DELETE

**DTOs:**

- Request:
  - `CreatePlanDto`: scope (TENANT|BRANCH), branchId?, name, description?, durationType, durationValue, price, currency, maxFreezeDays?, autoRenew?, sortOrder?
  - `UpdatePlanDto`: Partial of CreatePlanDto + status?
  - `PlanListQueryDto`: scope?, branchId?, q?, search?, status?, includeArchived?, page?, limit?
- Response: Plan object, Paginated plan list

**Notes:**

- **Scope**: TENANT (tenant-wide) or BRANCH (branch-specific)
- branchId required only if scope=BRANCH
- Never allow scopeKey in requests
- Active plans endpoint: returns TENANT + that branch's BRANCH plans if branchId provided
- Archive returns activeMemberCount if plan has active members
- Hard delete only allowed if plan has no members (409 Conflict otherwise)

---

### 6. Payments (`/api/v1/payments`)

| Method | Path                                 | Auth                      | Request                                                      | Response                        | Notes                                                                             |
| ------ | ------------------------------------ | ------------------------- | ------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------- |
| POST   | `/api/v1/payments`                   | JWT + TenantGuard + ADMIN | `CreatePaymentDto`                                           | `PaymentResponseDto`            | 201 Created. Rate limit: 100/15min. Idempotency-Key header supported.             |
| GET    | `/api/v1/payments`                   | JWT + TenantGuard + ADMIN | `PaymentListQueryDto` (query params)                         | `{ data, pagination }`          | Filter: memberId, branchId, paymentMethod, startDate, endDate, includeCorrections |
| GET    | `/api/v1/payments/revenue`           | JWT + TenantGuard + ADMIN | `RevenueReportQueryDto` (query params)                       | Revenue breakdown               | Aggregated revenue report. Must come before /:id route.                           |
| GET    | `/api/v1/payments/members/:memberId` | JWT + TenantGuard + ADMIN | Params: memberId. Query: startDate?, endDate?, page?, limit? | `{ data, pagination }`          | Payment history for specific member. Must come before /:id route.                 |
| GET    | `/api/v1/payments/:id`               | JWT + TenantGuard + ADMIN | Params: id                                                   | `PaymentResponseDto`            | Get single payment. Must come after specific routes.                              |
| POST   | `/api/v1/payments/:id/correct`       | JWT + TenantGuard + ADMIN | `CorrectPaymentDto`                                          | `PaymentResponseDto + warning?` | 201 Created. Rate limit: 40/15min. Single-correction rule. Version check.         |

**Controller:** `payments.controller.ts` → `PaymentsController`

**Guards:** `JwtAuthGuard`, `TenantGuard`, `RolesGuard`, `ThrottlerGuard` (POST, POST /correct)

**Roles:** `@Roles('ADMIN')` on all routes

**DTOs:**

- Request:
  - `CreatePaymentDto`: memberId, amount, paidOn, paymentMethod, note?
  - `CorrectPaymentDto`: amount, paidOn, paymentMethod, note?, correctionReason, version
  - `PaymentListQueryDto`: memberId?, branchId?, paymentMethod?, startDate?, endDate?, includeCorrections?, page?, limit?
  - `RevenueReportQueryDto`: startDate?, endDate?, branchId?, paymentMethod?, groupBy?
- Response: `PaymentResponseDto`, Paginated payment list, Revenue report

**Notes:**

- **Idempotency**: POST /payments supports Idempotency-Key header (24h cache)
- **Corrections**: Single-correction rule. Version-based concurrency control.
- **Rate Limits**: Create (100/15min), Correct (40/15min)
- Correction of >90 day old payments returns warning message
- Route order important: /revenue, /members/:memberId must come before /:id

---

### 7. Dashboard (`/api/v1/dashboard`)

| Method | Path                                        | Auth              | Request                                       | Response                          | Notes                                                      |
| ------ | ------------------------------------------- | ----------------- | --------------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/v1/dashboard/summary`                 | JWT + TenantGuard | Query: branchId?                              | `DashboardSummaryDto`             | totalMembers, activeMembers, inactiveMembers, expiringSoon |
| GET    | `/api/v1/dashboard/membership-distribution` | JWT + TenantGuard | Query: branchId?                              | `MembershipDistributionItemDto[]` | Active member count per plan.                              |
| GET    | `/api/v1/dashboard/monthly-members`         | JWT + TenantGuard | `MonthlyMembersQueryDto` (branchId?, months?) | `MonthlyMembersItemDto[]`         | New members by month. months default 6, max 12.            |

**Controller:** `dashboard.controller.ts` → `DashboardController`

**Guards:** `JwtAuthGuard`, `TenantGuard`

**DTOs:**

- Request:
  - `MonthlyMembersQueryDto`: branchId?, months? (default 6, max 12)
- Response:
  - `DashboardSummaryDto`: { totalMembers, activeMembers, inactiveMembers, expiringSoon }
  - `MembershipDistributionItemDto[]`: Array of { planId, planName, activeMemberCount }
  - `MonthlyMembersItemDto[]`: Array of { month: "YYYY-MM", newMembers }

**Notes:**

- All dashboard endpoints support optional branchId filter
- No pagination on dashboard endpoints

---

### 8. Root (`/`)

| Method | Path | Auth   | Request | Response         | Notes                           |
| ------ | ---- | ------ | ------- | ---------------- | ------------------------------- |
| GET    | `/`  | Public | -       | `"Hello World!"` | Health check / welcome message. |

**Controller:** `app.controller.ts` → `AppController`

**Guards:** None (public)

---

## Common Response Codes

| Code | Meaning               | When                                         |
| ---- | --------------------- | -------------------------------------------- |
| 200  | OK                    | Successful GET, PATCH requests               |
| 201  | Created               | Successful POST requests (create operations) |
| 204  | No Content            | Successful DELETE requests                   |
| 400  | Bad Request           | Validation errors, invalid input             |
| 401  | Unauthorized          | Missing or invalid JWT token                 |
| 403  | Forbidden             | Insufficient permissions, tenant mismatch    |
| 404  | Not Found             | Resource not found                           |
| 409  | Conflict              | Version mismatch, duplicate entry            |
| 429  | Too Many Requests     | Rate limit exceeded                          |
| 500  | Internal Server Error | Unexpected server error                      |

## Common Error Response Format

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

**HttpExceptionFilter** is globally applied for consistent error formatting.

## Pagination Format

Paginated endpoints return:

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

## Validation

- Global `ValidationPipe` is active with:
  - `whitelist: true` (strips unknown properties)
  - `forbidNonWhitelisted: true` (rejects unknown properties)
  - `transform: true` (auto-transforms query params to correct types)

## Open Questions

1. **Role Enforcement**: Bazı endpoint'lerde ADMIN role gereksinimi TODO olarak işaretlenmiş (örn: PATCH /tenants/current, PATCH /branches/:id). Mobile app geliştirirken ADMIN kontrolünün yapıldığını varsayın.

2. **Billing Status Check**:
   - `/auth/login`, `/auth/me`, `/tenants/current` endpoint'leri `@SkipBillingStatusCheck()` decorator'ı ile işaretlenmiş
   - Diğer endpoint'lerde billing status kontrolü yapılıyor mu? BillingStatusGuard global mi yoksa belirli controller'lara mı uygulanıyor? Bu bilgi koddan net değil.

3. **Branch-Aware Plans**:
   - Membership plans'de scope (TENANT vs BRANCH) konsepti var
   - Branch filtering, plan listing'de nasıl çalışıyor (includeArchived, branchId kombinasyonu)?
   - Bu logic mobile app'te nasıl yansıtılmalı?

4. **Payment Corrections**:
   - Version-based concurrency control nasıl çalışıyor? Frontend version'ı nereden alıyor?
   - Single-correction rule: Bir ödeme sadece bir kez mi düzeltilebilir? Bu kısıtlama nasıl enforce ediliyor?

5. **Swagger Documentation**:
   - Kodda Swagger decorator'ları görülmedi (@ApiTags, @ApiBearerAuth, vb.)
   - Swagger entegrasyonu var mı? `/api/docs` endpoint'i var mı?

6. **Global Prefix / Versioning**:
   - main.ts'de global prefix yok, her controller kendi `/api/v1/` prefix'ini kullanıyor
   - Future versioning için stratejiniz nedir? (/api/v2/ için ayrı controller'lar mı?)

7. **File Upload**:
   - Hiçbir endpoint'te file upload görünmüyor
   - Profil fotoğrafı, doküman upload vb. için plan var mı?

8. **Refresh Token**:
   - `/auth/login` endpoint'i sadece accessToken dönüyor
   - Refresh token mekanizması var mı? Token expire olunca ne yapılmalı?

---

## Version History

- **v1.0.0** (2026-01-17): Initial API documentation
