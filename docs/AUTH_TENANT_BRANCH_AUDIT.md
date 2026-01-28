# Authentication, Tenant & Branch Resolution Audit

**Document Version:** 1.0  
**Date:** January 28, 2026  
**Author:** Backend Engineering Team  
**Purpose:** Document the existing authentication, tenant/branch resolution, and plan enforcement systems to prepare for implementing POST /auth/register (self-signup).

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Auth Flow Discovery](#auth-flow-discovery)
3. [Tenant Resolution](#tenant-resolution)
4. [Branch Resolution](#branch-resolution)
5. [Plan & Limit Enforcement](#plan--limit-enforcement)
6. [Database Schema Summary](#database-schema-summary)
7. [Endpoint Inventory](#endpoint-inventory)
8. [Recommendations for /auth/register](#recommendations-for-authregister)
9. [Appendices](#appendices)

---

## Executive Summary

### Current State

The Gym Management SaaS backend uses:

- **JWT-based authentication** with access tokens (15min) and refresh tokens (30d)
- **Tenant isolation via JWT claims** - `tenantId` embedded in token payload
- **No branch header/resolution** - branch is passed as query param or path param per-request
- **Static plan configuration** - `PLAN_CONFIG` object in code, not database-driven
- **Backend hard enforcement** of plan limits (returns 403 Forbidden)

### Key Findings

| Aspect            | Implementation                     | Risk Level |
| ----------------- | ---------------------------------- | ---------- |
| Auth Strategy     | JWT Bearer token via Passport      | ✅ Low     |
| Password Hashing  | bcrypt with cost factor 10         | ✅ Low     |
| Tenant Resolution | JWT claim only (no headers)        | ✅ Low     |
| Branch Resolution | Per-request (no session state)     | ✅ Low     |
| Plan Limits       | Hardcoded config, backend enforced | ⚠️ Medium  |
| Registration      | Not implemented                    | 🔴 Missing |

---

## Auth Flow Discovery

### File Locations

| Component          | Path                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| AuthModule         | [backend/src/auth/auth.module.ts](../backend/src/auth/auth.module.ts)                                 |
| AuthController     | [backend/src/auth/auth.controller.ts](../backend/src/auth/auth.controller.ts)                         |
| AuthService        | [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts)                               |
| JwtStrategy        | [backend/src/auth/strategies/jwt.strategy.ts](../backend/src/auth/strategies/jwt.strategy.ts)         |
| JwtAuthGuard       | [backend/src/auth/guards/jwt-auth.guard.ts](../backend/src/auth/guards/jwt-auth.guard.ts)             |
| TenantGuard        | [backend/src/auth/guards/tenant.guard.ts](../backend/src/auth/guards/tenant.guard.ts)                 |
| RolesGuard         | [backend/src/auth/guards/roles.guard.ts](../backend/src/auth/guards/roles.guard.ts)                   |
| BillingStatusGuard | [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts) |

### Token Configuration

| Property             | Value                | Source                           |
| -------------------- | -------------------- | -------------------------------- |
| Token Type           | JWT Bearer           | `Authorization: Bearer <token>`  |
| Access Token Expiry  | 900s (15 min)        | `JWT_ACCESS_EXPIRES_IN` env var  |
| Refresh Token Expiry | 30d                  | `JWT_REFRESH_EXPIRES_IN` env var |
| Signing Secret       | `JWT_ACCESS_SECRET`  | env var                          |
| Refresh Secret       | `JWT_REFRESH_SECRET` | env var                          |

### JWT Payload Structure

```typescript
// From: backend/src/auth/strategies/jwt.strategy.ts
interface JwtPayload {
  sub: string; // userId (CUID)
  email: string; // User email
  tenantId: string; // Tenant ID (CUID)
  role: string; // "ADMIN" (only role currently)
}
```

**Note:** No `branchId` in token. Branch is determined per-request.

### Password Hashing

```typescript
// From: backend/src/auth/auth.service.ts
import * as bcrypt from "bcrypt";

// Validation
const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

// Hashing (for user creation - seen in test-helpers.ts)
const passwordHash = await bcrypt.hash(rawPassword, 10); // Cost factor 10
```

**Validation Rules:** Currently only `@IsString()` on login DTO. No password complexity rules enforced at DTO level.

### Auth Endpoints

| Endpoint             | Method | Auth Required | Description                       |
| -------------------- | ------ | ------------- | --------------------------------- |
| `/api/v1/auth/login` | POST   | No            | User login                        |
| `/api/v1/auth/me`    | GET    | Yes           | Get current user + billing status |

**Note:** No `/auth/register`, `/auth/refresh`, `/auth/forgot-password` endpoints exist yet.

### Login Flow Sequence Diagram

```
┌──────────┐      ┌──────────────┐      ┌─────────────┐      ┌────────────┐      ┌──────────┐
│  Client  │      │AuthController│      │ AuthService │      │UsersRepo   │      │  Prisma  │
└────┬─────┘      └──────┬───────┘      └──────┬──────┘      └─────┬──────┘      └────┬─────┘
     │                   │                     │                   │                  │
     │ POST /auth/login  │                     │                   │                  │
     │ {email, password} │                     │                   │                  │
     ├──────────────────►│                     │                   │                  │
     │                   │                     │                   │                  │
     │        [Throttle Guard: 5 req/15min]    │                   │                  │
     │                   │                     │                   │                  │
     │                   │ validateUser(email, │                   │                  │
     │                   │   password)         │                   │                  │
     │                   ├────────────────────►│                   │                  │
     │                   │                     │ findByEmail(email)│                  │
     │                   │                     ├──────────────────►│                  │
     │                   │                     │                   │ SELECT * FROM    │
     │                   │                     │                   │ "User" WHERE     │
     │                   │                     │                   │ email = ?        │
     │                   │                     │                   ├─────────────────►│
     │                   │                     │                   │◄─────────────────┤
     │                   │                     │◄──────────────────┤                  │
     │                   │                     │                   │                  │
     │                   │                     │ bcrypt.compare()  │                  │
     │                   │                     │ (verify password) │                  │
     │                   │                     │                   │                  │
     │                   │◄────────────────────┤ user | null       │                  │
     │                   │                     │                   │                  │
     │           [If null: 401 Unauthorized]   │                   │                  │
     │                   │                     │                   │                  │
     │                   │ login(user)         │                   │                  │
     │                   ├────────────────────►│                   │                  │
     │                   │                     │ Fetch tenant      │                  │
     │                   │                     │ billingStatus     │                  │
     │                   │                     ├─────────────────────────────────────►│
     │                   │                     │◄─────────────────────────────────────┤
     │                   │                     │                   │                  │
     │                   │   [If SUSPENDED: 403 Forbidden]         │                  │
     │                   │                     │                   │                  │
     │                   │                     │ Sign JWT tokens   │                  │
     │                   │                     │ (access + refresh)│                  │
     │                   │                     │                   │                  │
     │                   │◄────────────────────┤ LoginResponse     │                  │
     │◄──────────────────┤                     │                   │                  │
     │                   │                     │                   │                  │
     │ {accessToken,     │                     │                   │                  │
     │  refreshToken,    │                     │                   │                  │
     │  user: {...},     │                     │                   │                  │
     │  tenant: {...,    │                     │                   │                  │
     │    billingStatus}}│                     │                   │                  │
```

### Authenticated Request Flow

```
┌──────────┐     ┌────────────┐     ┌───────────┐     ┌───────────────┐     ┌────────────┐
│  Client  │     │JwtAuthGuard│     │TenantGuard│     │BillingStatusG.│     │ Controller │
└────┬─────┘     └─────┬──────┘     └─────┬─────┘     └───────┬───────┘     └─────┬──────┘
     │                 │                  │                   │                   │
     │ GET /api/v1/... │                  │                   │                   │
     │ Authorization:  │                  │                   │                   │
     │ Bearer <token>  │                  │                   │                   │
     ├────────────────►│                  │                   │                   │
     │                 │                  │                   │                   │
     │                 │ Extract token    │                   │                   │
     │                 │ from header      │                   │                   │
     │                 │                  │                   │                   │
     │                 │ Verify signature │                   │                   │
     │                 │ Check expiration │                   │                   │
     │                 │                  │                   │                   │
     │                 │ Attach payload   │                   │                   │
     │                 │ to request.user  │                   │                   │
     │                 │                  │                   │                   │
     │          [If invalid: 401]         │                   │                   │
     │                 │                  │                   │                   │
     │                 ├─────────────────►│                   │                   │
     │                 │                  │                   │                   │
     │                 │                  │ Validate tenantId │                   │
     │                 │                  │ in request.user   │                   │
     │                 │                  │                   │                   │
     │                 │                  │ Attach tenantId   │                   │
     │                 │                  │ to request        │                   │
     │                 │                  │                   │                   │
     │                 │       [If missing: 403]              │                   │
     │                 │                  │                   │                   │
     │                 │                  ├──────────────────►│                   │
     │                 │                  │                   │                   │
     │                 │                  │                   │ Query tenant      │
     │                 │                  │                   │ billingStatus     │
     │                 │                  │                   │ from DB           │
     │                 │                  │                   │                   │
     │                 │                  │                   │ SUSPENDED: 403    │
     │                 │                  │                   │ PAST_DUE + POST:  │
     │                 │                  │                   │   403             │
     │                 │                  │                   │ TRIAL/ACTIVE: OK  │
     │                 │                  │                   │                   │
     │                 │                  │                   ├──────────────────►│
     │                 │                  │                   │                   │
     │                 │                  │                   │                   │ Handle
     │                 │                  │                   │                   │ request
     │◄───────────────────────────────────────────────────────────────────────────┤
```

### Guard Execution Order

Guards execute in the order they're applied:

1. **Global Guards** (registered in AppModule)
   - `BillingStatusGuard` (globally registered via `APP_GUARD`)

2. **Controller-level Guards** (via `@UseGuards()`)
   - `JwtAuthGuard` - Validates JWT token
   - `TenantGuard` - Ensures tenant context exists
   - `RolesGuard` - Validates user has required role

**Important:** `BillingStatusGuard` checks for `@SkipBillingStatusCheck()` decorator first, then only runs billing logic if user is already authenticated.

### Decorators

| Decorator                   | File                                                                                                            | Purpose                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `@CurrentUser()`            | [current-user.decorator.ts](../backend/src/auth/decorators/current-user.decorator.ts)                           | Extract full user or specific property from request |
| `@TenantId()`               | [tenant-id.decorator.ts](../backend/src/auth/decorators/tenant-id.decorator.ts)                                 | Shorthand for `@CurrentUser('tenantId')`            |
| `@Roles()`                  | [roles.decorator.ts](../backend/src/auth/decorators/roles.decorator.ts)                                         | Set required roles for endpoint                     |
| `@SkipBillingStatusCheck()` | [skip-billing-status-check.decorator.ts](../backend/src/auth/decorators/skip-billing-status-check.decorator.ts) | Bypass billing status guard                         |

---

## Tenant Resolution

### Source of Truth

**Tenant is resolved exclusively from JWT token claims.**

```typescript
// JwtPayload contains tenantId
interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string; // <-- Source of truth
  role: string;
}
```

### Resolution Flow

1. User logs in → Backend fetches `user.tenantId` from database
2. `tenantId` is embedded in JWT token payload
3. Every authenticated request:
   - `JwtAuthGuard` validates token and attaches payload to `request.user`
   - `TenantGuard` extracts `tenantId` and attaches to `request.tenantId`
   - Controllers use `@TenantId()` or `@CurrentUser('tenantId')` to get value

### What About X-Tenant-Id Header?

The frontend sends `X-Tenant-Id` header in some requests:

```typescript
// frontend/src/api/client.ts
if (config?.tenantId) {
  headers["X-Tenant-Id"] = config.tenantId;
}
```

**However, the backend completely ignores this header.** The backend always uses `request.user.tenantId` from the JWT token. The frontend header appears to be vestigial or intended for future multi-tenant switching.

### Database Relationship

```
User (tenantId) ──────> Tenant (id)
```

- User belongs to exactly ONE tenant
- User cannot switch tenants (no `activeTenantId` concept)
- Tenant isolation is enforced at query level by filtering on `tenantId`

### Risks & Mitigations

| Risk                        | Status           | Notes                                     |
| --------------------------- | ---------------- | ----------------------------------------- |
| Token forgery               | ✅ Mitigated     | JWT signature verification                |
| Tenant spoofing via header  | ✅ Mitigated     | Header is ignored; JWT is source of truth |
| User accessing wrong tenant | ✅ Mitigated     | User<->Tenant is 1:1 in DB                |
| Token theft                 | ⚠️ Standard risk | Mitigated by short access token expiry    |

---

## Branch Resolution

### How Branch is Determined

**Branch is NOT stored in JWT token or session.** It is determined per-request via:

1. **Path parameter**: `/api/v1/branches/:id/...`
2. **Query parameter**: `?branchId=xxx`
3. **Request body**: `{ branchId: "xxx" }` (for create operations)

### Branch Endpoints (Şubeler Page)

| Endpoint                                | Method | Purpose                       |
| --------------------------------------- | ------ | ----------------------------- |
| `GET /api/v1/branches`                  | GET    | List branches with pagination |
| `GET /api/v1/branches/:id`              | GET    | Get single branch             |
| `POST /api/v1/branches`                 | POST   | Create new branch             |
| `PATCH /api/v1/branches/:id`            | PATCH  | Update branch                 |
| `POST /api/v1/branches/:id/archive`     | POST   | Archive (soft-delete) branch  |
| `POST /api/v1/branches/:id/restore`     | POST   | Restore archived branch       |
| `POST /api/v1/branches/:id/set-default` | POST   | Set as default branch         |

### Default Branch Behavior

- First branch created for a tenant automatically becomes `isDefault: true`
- Exactly ONE branch per tenant can be `isDefault: true`
- `setDefaultBranch()` uses a transaction to ensure atomicity
- Cannot archive the default branch

### Request/Response Samples

#### List Branches

```http
GET /api/v1/branches?page=1&limit=20&includeArchived=false
Authorization: Bearer <token>
```

```json
{
  "data": [
    {
      "id": "clx1234...",
      "tenantId": "clx5678...",
      "name": "Ana Şube",
      "address": "123 Main St",
      "isDefault": true,
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z",
      "archivedAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

#### Create Branch

```http
POST /api/v1/branches
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Yeni Şube",
  "address": "456 Other St"
}
```

#### Set Default Branch

```http
POST /api/v1/branches/clx1234.../set-default
Authorization: Bearer <token>
```

### Code Location

| Component          | Path                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| BranchesController | [backend/src/branches/branches.controller.ts](../backend/src/branches/branches.controller.ts) |
| BranchesService    | [backend/src/branches/branches.service.ts](../backend/src/branches/branches.service.ts)       |

---

## Plan & Limit Enforcement

### Plan Configuration

Plans are defined as a **static configuration object**, not in the database:

```typescript
// backend/src/plan/plan.config.ts
export const PLAN_CONFIG = {
  SINGLE: {
    maxBranches: 3,
    hasClasses: true,
    hasPayments: false,
  },
} as const;
```

### How Plan is Fetched

```typescript
// backend/src/plan/plan.service.ts
async getTenantPlan(tenantId: string): Promise<PlanConfig> {
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { planKey: true },
  });

  return PLAN_CONFIG[tenant.planKey as PlanKey];
}
```

### Branch Limit Enforcement

**Location:** [backend/src/branches/branches.service.ts](../backend/src/branches/branches.service.ts)

```typescript
// createBranch() - Lines 71-81
async createBranch(tenantId: string, dto: CreateBranchDto) {
  // Check plan limit before creating branch (only count active branches)
  const plan = await this.planService.getTenantPlan(tenantId);
  const currentCount = await this.prisma.branch.count({
    where: { tenantId, isActive: true },
  });

  if (currentCount >= plan.maxBranches) {
    throw new ForbiddenException(
      `Plan limit reached: max ${plan.maxBranches} branches allowed.`,
    );
  }
  // ... continue creating branch
}

// restoreBranch() - Lines 211-224
async restoreBranch(tenantId: string, branchId: string) {
  // Check plan limit before restoring branch
  const plan = await this.planService.getTenantPlan(tenantId);
  const currentCount = await this.prisma.branch.count({
    where: { tenantId, isActive: true },
  });

  if (currentCount >= plan.maxBranches) {
    throw new ForbiddenException(
      'Plan limitine ulaşıldı. Daha fazla şube için planınızı yükseltmeniz gerekiyor.',
    );
  }
  // ... continue restoring
}
```

### Frontend "3/3" Display

**Location:** [frontend/src/pages/BranchesPage.tsx](../frontend/src/pages/BranchesPage.tsx)

```typescript
// Frontend hardcodes the same limit
const MAX_BRANCHES_SINGLE_PLAN = 3;

// Calculates from branch list
const activeBranchesCount = branches.filter((b) => b.isActive).length;
const hasReachedLimit = activeBranchesCount >= MAX_BRANCHES_SINGLE_PLAN;
```

### Enforcement Summary

| Enforcement Point   | Type     | Response           |
| ------------------- | -------- | ------------------ |
| `createBranch()`    | Backend  | 403 Forbidden      |
| `restoreBranch()`   | Backend  | 403 Forbidden      |
| BranchesPage button | Frontend | Disabled + tooltip |

**Both frontend AND backend enforce limits.** Backend is authoritative; frontend provides UX.

### Risks

| Risk                        | Severity  | Notes                                    |
| --------------------------- | --------- | ---------------------------------------- |
| Plan config hardcoded       | ⚠️ Medium | Cannot change limits without code deploy |
| No subscription/trial model | ⚠️ Medium | All tenants get same plan forever        |
| No billing integration      | 🔴 High   | Cannot upgrade/downgrade plans           |

---

## Database Schema Summary

### Entity Relationship Diagram

```
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│    Tenant     │       │     User      │       │    Branch     │
├───────────────┤       ├───────────────┤       ├───────────────┤
│ id (PK)       │◄──────│ tenantId (FK) │       │ id (PK)       │
│ name          │       │ id (PK)       │       │ tenantId (FK) │──────┐
│ slug (UNIQUE) │       │ email (UNIQUE)│       │ name          │      │
│ planKey       │       │ passwordHash  │       │ address       │      │
│ billingStatus │       │ firstName     │       │ isDefault     │      │
│ defaultCurrency       │ lastName      │       │ isActive      │      │
│ createdAt     │       │ role          │       │ archivedAt    │      │
│ updatedAt     │       │ isActive      │       │ createdAt     │      │
│               │       │ createdAt     │       │ updatedAt     │      │
│               │       │ updatedAt     │       │               │      │
└───────────────┘       └───────────────┘       └───────────────┘      │
       │                                                                │
       │                                                                │
       │ 1:N                                                            │
       │                                                                │
       ▼                                                                │
┌───────────────┐       ┌───────────────┐       ┌───────────────┐      │
│MembershipPlan │       │    Member     │       │   Payment     │      │
├───────────────┤       ├───────────────┤       ├───────────────┤      │
│ id (PK)       │       │ id (PK)       │       │ id (PK)       │      │
│ tenantId (FK) │       │ tenantId (FK) │       │ tenantId (FK) │◄─────┘
│ branchId (FK)?│◄──────│ branchId (FK) │       │ branchId (FK) │
│ scope         │       │ membershipPlanId      │ memberId (FK) │
│ name          │       │ firstName     │       │ amount        │
│ price         │       │ lastName      │       │ paidOn        │
│ durationType  │       │ phone         │       │ paymentMethod │
│ durationValue │       │ email         │       │ isCorrection  │
│ status        │       │ status        │       │ isCorrected   │
│ ...           │       │ ...           │       │ createdBy     │
└───────────────┘       └───────────────┘       └───────────────┘
```

### Key Tables

#### Tenant

| Column                 | Type               | Constraints     |
| ---------------------- | ------------------ | --------------- |
| id                     | String             | PK, CUID        |
| name                   | String             | Required        |
| slug                   | String             | UNIQUE          |
| planKey                | PlanKey enum       | Default: SINGLE |
| billingStatus          | BillingStatus enum | Default: TRIAL  |
| billingStatusUpdatedAt | DateTime?          | -               |
| defaultCurrency        | String             | Default: USD    |

#### User

| Column       | Type      | Constraints    |
| ------------ | --------- | -------------- |
| id           | String    | PK, CUID       |
| tenantId     | String    | FK → Tenant    |
| email        | String    | UNIQUE         |
| passwordHash | String    | Required       |
| firstName    | String    | Required       |
| lastName     | String    | Required       |
| role         | Role enum | Default: ADMIN |
| isActive     | Boolean   | Default: true  |

#### Branch

| Column     | Type      | Constraints       |
| ---------- | --------- | ----------------- |
| id         | String    | PK, CUID          |
| tenantId   | String    | FK → Tenant       |
| name       | String    | UNIQUE per tenant |
| address    | String    | Required          |
| isDefault  | Boolean   | Default: false    |
| isActive   | Boolean   | Default: true     |
| archivedAt | DateTime? | -                 |

### Enums

```typescript
enum Role {
  ADMIN
  // Future: OWNER, STAFF, TRAINER, ACCOUNTANT
}

enum PlanKey {
  SINGLE
}

enum BillingStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  SUSPENDED
}
```

### Missing Tables/Columns for Registration

| Table/Column                | Status     | Needed For              |
| --------------------------- | ---------- | ----------------------- |
| `User.emailVerifiedAt`      | ❌ Missing | Email verification      |
| `User.verificationToken`    | ❌ Missing | Email verification flow |
| `Subscription` table        | ❌ Missing | Trial periods, upgrades |
| `User.passwordResetToken`   | ❌ Missing | Forgot password flow    |
| `User.passwordResetExpires` | ❌ Missing | Forgot password flow    |

---

## Endpoint Inventory

### Salon Ayarları (Tenant Settings) Page

| Endpoint                        | Method | Auth     | Purpose                           |
| ------------------------------- | ------ | -------- | --------------------------------- |
| `GET /api/v1/tenants/current`   | GET    | Required | Get tenant info + billing status  |
| `PATCH /api/v1/tenants/current` | PATCH  | Required | Update tenant name/currency       |
| `GET /api/v1/branches`          | GET    | Required | Get branch count for plan display |

**Controller:** [backend/src/tenants/tenants.controller.ts](../backend/src/tenants/tenants.controller.ts)

### Şubeler (Branches) Page

| Endpoint                                | Method | Auth             | Purpose            |
| --------------------------------------- | ------ | ---------------- | ------------------ |
| `GET /api/v1/branches`                  | GET    | Required         | List branches      |
| `POST /api/v1/branches`                 | POST   | Required + ADMIN | Create branch      |
| `PATCH /api/v1/branches/:id`            | PATCH  | Required         | Update branch      |
| `POST /api/v1/branches/:id/archive`     | POST   | Required         | Archive branch     |
| `POST /api/v1/branches/:id/restore`     | POST   | Required         | Restore branch     |
| `POST /api/v1/branches/:id/set-default` | POST   | Required         | Set default branch |

**Controller:** [backend/src/branches/branches.controller.ts](../backend/src/branches/branches.controller.ts)

### Auth Endpoints

| Endpoint                  | Method | Auth     | Purpose                    |
| ------------------------- | ------ | -------- | -------------------------- |
| `POST /api/v1/auth/login` | POST   | No       | User login                 |
| `GET /api/v1/auth/me`     | GET    | Required | Get current user + billing |

**Controller:** [backend/src/auth/auth.controller.ts](../backend/src/auth/auth.controller.ts)

---

## Recommendations for /auth/register

### Overview

Adding `POST /auth/register` requires creating:

1. A new tenant
2. A new user (tenant admin)
3. An initial default branch

All within a single transaction.

### Proposed Implementation Plan

#### Phase 1: Core Registration (MVP)

```typescript
// POST /api/v1/auth/register
interface RegisterDto {
  // Tenant info
  tenantName: string; // e.g., "Fitness Plus"

  // User info
  email: string; // Must be unique
  password: string; // Min 8 chars, 1 number, 1 special
  firstName: string;
  lastName: string;

  // Optional
  defaultBranchName?: string; // Default: "Ana Şube"
  defaultBranchAddress?: string;
}
```

#### Transaction Flow

```typescript
async register(dto: RegisterDto) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Check email uniqueness
    const existingUser = await tx.user.findUnique({
      where: { email: dto.email }
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // 2. Generate unique slug
    const slug = await this.generateUniqueSlug(tx, dto.tenantName);

    // 3. Create tenant
    const tenant = await tx.tenant.create({
      data: {
        name: dto.tenantName,
        slug,
        planKey: 'SINGLE',
        billingStatus: 'TRIAL',
        defaultCurrency: 'TRY', // Default for Turkish users
      }
    });

    // 4. Create default branch
    const branch = await tx.branch.create({
      data: {
        tenantId: tenant.id,
        name: dto.defaultBranchName || 'Ana Şube',
        address: dto.defaultBranchAddress || '',
        isDefault: true,
        isActive: true,
      }
    });

    // 5. Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 6. Create user
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'ADMIN',
        isActive: true,
      }
    });

    // 7. Generate tokens
    return this.authService.login(user);
  });
}
```

#### Files to Modify/Create

| File                         | Action | Changes                           |
| ---------------------------- | ------ | --------------------------------- |
| `auth/dto/register.dto.ts`   | Create | New DTO with validation           |
| `auth/auth.controller.ts`    | Modify | Add `@Post('register')` endpoint  |
| `auth/auth.service.ts`       | Modify | Add `register()` method           |
| `tenants/tenants.service.ts` | Modify | Add `generateUniqueSlug()` helper |

#### Validation Rules (register.dto.ts)

```typescript
export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(/^(?=.*[0-9])(?=.*[!@#$%^&*])/, {
    message: "Password must contain at least 1 number and 1 special character",
  })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultBranchName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultBranchAddress?: string;
}
```

### Reusable Patterns

| Pattern                | Source                                                                                   | Reuse For                               |
| ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| Transaction style      | [branches.service.ts#setDefaultBranch](../backend/src/branches/branches.service.ts#L248) | Registration transaction                |
| Password hashing       | [test-helpers.ts#createAdminUser](../backend/test/test-helpers.ts#L55)                   | Hashing new password                    |
| Token generation       | [auth.service.ts#login](../backend/src/auth/auth.service.ts#L42)                         | Returning tokens after registration     |
| Rate limiting          | [auth.controller.ts#login](../backend/src/auth/auth.controller.ts#L34)                   | Prevent registration spam               |
| SkipBillingStatusCheck | [auth.controller.ts](../backend/src/auth/auth.controller.ts#L27)                         | Registration doesn't need billing check |

### Phase 2: Enhanced Features (Future)

| Feature               | Schema Changes                                         | Priority |
| --------------------- | ------------------------------------------------------ | -------- |
| Email verification    | `User.emailVerifiedAt`, `User.verificationToken`       | High     |
| Trial period tracking | New `Subscription` table                               | High     |
| Forgot password       | `User.passwordResetToken`, `User.passwordResetExpires` | Medium   |
| Multiple plans        | Expand `PlanKey` enum, DB-driven config                | Medium   |
| Referral tracking     | `Tenant.referralCode`, `Tenant.referredBy`             | Low      |

### Risks & Mitigations

| Risk                    | Mitigation                                        |
| ----------------------- | ------------------------------------------------- |
| Registration spam       | Apply `@Throttle()` decorator (3 req/hour per IP) |
| Duplicate emails        | Unique constraint + explicit check in transaction |
| Duplicate slugs         | Auto-generate with uniqueness check               |
| Incomplete registration | Use database transaction                          |
| Weak passwords          | DTO validation with complexity rules              |

### Impact on Existing Pages

| Page             | Impact   | Changes Needed                    |
| ---------------- | -------- | --------------------------------- |
| Salon Ayarları   | ✅ None  | Works as-is                       |
| Şubeler          | ✅ None  | Works as-is (gets default branch) |
| Login            | ⚠️ Minor | Add "Register" link               |
| Frontend routing | ⚠️ Minor | Add `/register` route             |

---

## Appendices

### A. Environment Variables

```bash
# Required for auth
JWT_ACCESS_SECRET=your-secure-secret
JWT_REFRESH_SECRET=your-secure-refresh-secret
JWT_ACCESS_EXPIRES_IN=900s      # 15 minutes
JWT_REFRESH_EXPIRES_IN=30d      # 30 days
```

### B. Error Codes

```typescript
// backend/src/common/constants/billing-messages.ts
export const BILLING_ERROR_CODES = {
  TENANT_BILLING_LOCKED: "TENANT_BILLING_LOCKED",
};

export const BILLING_ERROR_MESSAGES = {
  SUSPENDED_LOGIN: "Hesabınız askıya alınmıştır...",
  SUSPENDED_ACCESS: "Hesabınız askıya alınmıştır...",
  PAST_DUE_MUTATION: "Ödeme gecikmesi nedeniyle...",
};
```

### C. Frontend Auth Storage

```typescript
// localStorage key: gymms_auth
interface AuthStorage {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  billingStatus?: BillingStatus;
  billingStatusUpdatedAt?: string | null;
}
```

### D. Test Utilities

For testing the new registration endpoint, use patterns from [test-helpers.ts](../backend/test/test-helpers.ts):

```typescript
// Create test tenant + user
const { tenant, user } = await createTestTenantAndUser(prisma, {
  tenantName: "Test Gym",
  userEmail: "test@example.com",
  userPassword: "Pass123!",
});

// Login and get tokens
const { accessToken, refreshToken } = await loginUser(
  app,
  "test@example.com",
  "Pass123!",
);
```

---

## Conclusion

The current authentication and tenant/branch system is well-structured and follows NestJS best practices:

1. **JWT-based auth** with proper guards and decorators
2. **Tenant isolation** via JWT claims (secure, not header-based)
3. **Branch resolution** is stateless (per-request)
4. **Plan limits** are enforced on both frontend and backend

The main gaps for self-signup are:

- No registration endpoint
- No email verification
- No subscription/trial management
- Plan config is hardcoded

**Recommendation:** Implement a minimal `/auth/register` endpoint first (Phase 1), then add email verification and trial management as separate features.
