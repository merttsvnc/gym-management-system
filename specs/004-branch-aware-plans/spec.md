# Feature Specification: Branch-Aware Membership Plans

**Version:** 1.0.0  
**Author:** System Architect  
**Date:** 2025-01-27  
**Status:** Draft

---

## Overview

### Purpose

Enable membership plans to be defined either globally for a tenant or specifically for a single branch. This enhancement extends the existing membership plan system to support branch-level plan definitions, enabling future features such as accounting, payments, and branch-level reporting.

Currently, membership plans are tenant-scoped only, meaning all branches within a tenant share the same set of plans. This feature introduces plan scoping (TENANT or BRANCH), allowing plans to be defined at either the tenant level (applying to all branches) or at the branch level (applying only to a specific branch).

This enhancement provides the foundation for branch-specific pricing strategies, branch-level revenue tracking, and future accounting integrations that require branch-level financial data.

### Scope

**What IS included:**

- Plan scope field (TENANT | BRANCH) added to MembershipPlan entity
- Optional `branchId` field for BRANCH-scoped plans
- Validation rules enforcing scope and branchId consistency
- Uniqueness constraints based on plan scope (TENANT: unique per tenant, BRANCH: unique per branch)
- API endpoints updated to support scope filtering and branchId filtering
- Plan creation and update operations with scope validation
- Plan listing with scope and branchId filters
- Plan archival (soft delete) with scope awareness
- Tenant isolation maintained for all plan operations
- Branch validation ensuring branchId belongs to current tenant

**What is NOT included:**

- Frontend implementation (UI changes deferred to future feature)
- Payment logic (payment processing deferred to future feature)
- Accounting logic (accounting integration deferred to future feature)
- Plan migration from TENANT to BRANCH scope (or vice versa)
- Branch-level plan templates or copying
- Plan assignment rules based on member's branch (members can use any plan available to their tenant/branch)

### Constitution Alignment

This feature aligns with multiple constitutional principles:

- **Principle 6 (Multi-Tenant SaaS):** Maintains strict tenant isolation while adding branch-level scoping within tenants
- **Principle 1 (Long-Term Maintainability):** Establishes foundation for branch-level financial features (accounting, payments, reporting)
- **Principle 3 (Explicit Domain Rules):** Defines clear scope validation rules and uniqueness constraints
- **Principle 5 (Modular Architecture):** Extends existing membership plan module without breaking existing functionality
- **Principle 9 (Performance & Scalability):** Implements proper indexing for scope-based queries

---

## Domain Model

### Core Concepts

**Plan Scope:**

- **TENANT scope:** A membership plan that applies to all branches under the same tenant. When a plan has TENANT scope, it is available for selection by members at any branch within the tenant. The `branchId` field must be null for TENANT-scoped plans.
- **BRANCH scope:** A membership plan that applies only to one specific branch. When a plan has BRANCH scope, it is available for selection only by members belonging to that specific branch. The `branchId` field is required and must reference a branch that belongs to the current tenant.

**Scope Semantics:**

- A membership plan MUST have exactly one scope (TENANT or BRANCH)
- Scope is immutable after plan creation (cannot change scope of existing plan)
- Plan scope determines uniqueness constraints and availability rules
- Members can select plans based on their branch context (TENANT plans available to all branches, BRANCH plans available only to the specific branch)

**Plan Availability:**

- TENANT-scoped plans: Available to members at any branch within the tenant
- BRANCH-scoped plans: Available only to members at the specific branch referenced by `branchId`
- Plan selection logic (future frontend feature) will filter available plans based on member's branch and plan scope

### Entities

#### MembershipPlan (Modified)

```typescript
interface MembershipPlan {
  id: string; // CUID primary key
  tenantId: string; // REQUIRED: Tenant this plan belongs to
  scope: PlanScope; // REQUIRED: "TENANT" or "BRANCH"
  branchId: string | null; // REQUIRED if scope is BRANCH, MUST be null if scope is TENANT
  name: string; // Required: Plan name, unique per tenant (TENANT scope) or per branch (BRANCH scope)
  description?: string; // Optional: Longer text description for UI display
  durationType: DurationType; // Required: DAYS or MONTHS
  durationValue: number; // Required: Integer > 0 (e.g., 30 for 30 days, or 12 for 12 months)
  price: number; // Required: Decimal >= 0 (e.g., 5000.00 for JPY)
  currency: string; // Required: ISO 4217 currency code (e.g., "JPY", "USD", "EUR")
  maxFreezeDays?: number; // Optional: Maximum freeze days allowed (0, 7, 30, etc.), null means no freeze allowed
  autoRenew: boolean; // Required: Default false, indicates if membership should auto-renew
  status: PlanStatus; // Required: ACTIVE or ARCHIVED
  sortOrder?: number; // Optional: Integer for UI display ordering (lower numbers appear first)
  createdAt: Date; // Timestamp of plan creation
  updatedAt: Date; // Timestamp of last update
}

enum PlanScope {
  TENANT = "TENANT",
  BRANCH = "BRANCH"
}

enum DurationType {
  DAYS = "DAYS",
  MONTHS = "MONTHS"
}

enum PlanStatus {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED"
}
```

### Relationships

```
Tenant (1) ──< (many) MembershipPlan
Branch (1) ──< (many) MembershipPlan (when scope is BRANCH)
MembershipPlan (1) ──< (many) Member
Tenant (1) ──< (many) Member (existing)
Branch (1) ──< (many) Member (existing)
```

- A MembershipPlan MUST belong to exactly one Tenant
- A MembershipPlan with BRANCH scope MUST reference exactly one Branch (via `branchId`)
- A MembershipPlan with TENANT scope MUST have `branchId = null`
- A Member MUST reference exactly one MembershipPlan (via `membershipPlanId`)
- A Member MUST belong to exactly one Tenant (existing relationship)
- A Member MUST belong to exactly one Branch (existing relationship)
- Therefore, a Member's plan is implicitly scoped to their tenant, and BRANCH-scoped plans are further scoped to their branch

### Business Rules

1. **Plan Scope Validation (CRITICAL):**
   - A membership plan MUST have exactly one scope: TENANT or BRANCH
   - If scope is TENANT: `branchId` MUST be null
   - If scope is BRANCH: `branchId` is REQUIRED and MUST reference a branch that belongs to the current tenant
   - Scope is immutable after plan creation (cannot change scope of existing plan)
   - Attempting to create a TENANT plan with a branchId returns 400 Bad Request
   - Attempting to create a BRANCH plan without a branchId returns 400 Bad Request
   - Attempting to create a BRANCH plan with a branchId from a different tenant returns 403 Forbidden

2. **Tenant Isolation (CRITICAL):**
   - All plan queries MUST filter by `tenantId` automatically
   - Plans cannot be accessed across tenant boundaries
   - Member-plan relationships are validated to ensure plan belongs to member's tenant
   - Attempting to assign a plan from a different tenant returns 403 Forbidden
   - Branch validation: When `branchId` is provided, it MUST belong to the authenticated user's tenant

3. **Plan Name Uniqueness (Scope-Dependent):**
   - **TENANT scope:** Plan names MUST be unique within a tenant (case-insensitive) for ACTIVE plans only
   - **BRANCH scope:** Plan names MUST be unique within a branch (case-insensitive) for ACTIVE plans only
   - Plan names MAY be duplicated across different tenants
   - Plan names MAY be duplicated across different branches (even within the same tenant)
   - Plan names MAY be duplicated between TENANT and BRANCH scopes (same tenant can have "Premium" as both TENANT and BRANCH plan)
   - Archived plans do not count toward uniqueness constraints (archived plans can have duplicate names)
   - Validation occurs on create and update operations (for ACTIVE plans only)

4. **Plan Duration Validation:**
   - `durationValue` MUST be greater than 0
   - `durationType` MUST be either DAYS or MONTHS
   - For DAYS: `durationValue` MUST be between 1 and 730 (inclusive) - maximum 2 years
   - For MONTHS: `durationValue` MUST be between 1 and 24 (inclusive) - maximum 2 years
   - Values outside these ranges are rejected with clear error message

5. **Plan Price Validation:**
   - `price` MUST be >= 0 (zero-price plans allowed for promotional purposes)
   - `currency` MUST be a valid ISO 4217 currency code
   - Currency is stored as-is; no currency conversion logic

6. **Plan Archival Protection:**
   - Plans with active members CANNOT be deleted (hard delete)
   - Plans with active members CAN be archived (status → ARCHIVED)
   - **Active member definition:** Members with `status = ACTIVE` AND `membershipEndDate >= today`
   - PAUSED, INACTIVE, or ARCHIVED members do NOT count toward active member count
   - Archived plans do not appear in plan selection dropdowns for new members
   - Archived plans remain visible in member detail views and historical records

7. **Branch Validation:**
   - When creating/updating a BRANCH-scoped plan, `branchId` MUST reference an existing Branch
   - The Branch MUST belong to the authenticated user's tenant
   - The Branch MUST be active (`isActive = true`) - cannot create plans for archived branches
   - If a branch is archived after plan creation, the plan remains valid (historical records preserved)

8. **Plan Listing and Filtering:**
   - All plan queries MUST be scoped to the current tenant
   - Plans can be filtered by scope (TENANT | BRANCH)
   - Plans can be filtered by branchId (returns BRANCH-scoped plans for that branch)
   - Plans can be filtered by name search (partial match, case-insensitive)
   - Plans can be filtered by archived status (includeArchived flag, default: false)
   - Archived plans are excluded by default unless `includeArchived = true`

---

## Success Criteria

The Branch-Aware Membership Plans feature will be considered successful when:

1. **Data Model Integrity:**
   - 100% of plan queries enforce tenant isolation (zero cross-tenant plan access)
   - All plan scope validation rules are enforced (TENANT plans have null branchId, BRANCH plans have valid branchId)
   - All branchId references are validated to belong to the current tenant
   - Plan uniqueness constraints are enforced correctly based on scope (TENANT: unique per tenant, BRANCH: unique per branch)
   - Plan archival protection prevents deletion of plans with active members

2. **Plan Management Operations:**
   - Tenant admins can create a TENANT-scoped plan with null branchId in under 1 minute
   - Tenant admins can create a BRANCH-scoped plan with valid branchId in under 1 minute
   - Plan creation rejects invalid scope/branchId combinations with clear error messages
   - Plan list page loads with scope and branchId filters applied in under 1 second for up to 100 plans per tenant
   - Plan updates maintain scope immutability (cannot change scope after creation)
   - Plan archival completes successfully with proper status transition

3. **Filtering and Listing:**
   - Plan list endpoint returns only plans for the current tenant
   - Scope filter (TENANT | BRANCH) correctly filters plans
   - branchId filter returns only BRANCH-scoped plans for that branch
   - Name search (q parameter) filters plans correctly (case-insensitive partial match)
   - includeArchived flag correctly includes/excludes archived plans
   - Filter combinations work correctly (e.g., scope=TENANT + includeArchived=true)

4. **Uniqueness Enforcement:**
   - Creating two ACTIVE TENANT plans with the same name within a tenant returns 400 Bad Request
   - Creating two ACTIVE BRANCH plans with the same name within the same branch returns 400 Bad Request
   - Creating ACTIVE plans with duplicate names across different branches succeeds (allowed)
   - Creating ACTIVE plans with duplicate names between TENANT and BRANCH scopes succeeds (allowed)
   - Archived plans do not prevent creation of plans with duplicate names

5. **Performance:**
   - Plan list queries complete in under 300ms for typical datasets (up to 100 plans per tenant)
   - Scope-based filtering queries complete in under 200ms
   - BranchId filtering queries complete in under 200ms
   - Uniqueness validation checks complete in under 100ms

---

## API Specification

### Base URL

All endpoints are prefixed with `/api/v1/membership-plans`

### Authentication

All endpoints require valid JWT token with `tenantId` claim. Requests without valid authentication return 401 Unauthorized.

---

### Endpoints

#### GET /api/v1/membership-plans

**Purpose:** List all membership plans for the current tenant with filtering and pagination

**Authorization:** ADMIN (and future roles)

**Query Parameters:**

```typescript
interface PlanListQuery {
  page?: number; // Default: 1
  limit?: number; // Default: 20, Max: 100
  scope?: PlanScope; // Optional: Filter by scope (TENANT | BRANCH)
  branchId?: string; // Optional: Filter by branchId (returns BRANCH-scoped plans for that branch)
  q?: string; // Optional: Search by plan name (partial match, case-insensitive)
  includeArchived?: boolean; // Optional: Include archived plans, default: false
}
```

**Response:**

```typescript
interface PlanListResponse {
  data: MembershipPlan[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface MembershipPlan {
  id: string;
  tenantId: string;
  scope: PlanScope; // "TENANT" or "BRANCH"
  branchId: string | null; // null for TENANT scope, branch ID for BRANCH scope
  name: string;
  description?: string;
  durationType: DurationType; // "DAYS" or "MONTHS"
  durationValue: number;
  price: number;
  currency: string;
  maxFreezeDays?: number;
  autoRenew: boolean;
  status: PlanStatus; // "ACTIVE" or "ARCHIVED"
  sortOrder?: number;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  // Computed field (optional, if requested)
  activeMemberCount?: number; // Number of active members using this plan
}
```

**Status Codes:**

- 200: Success
- 400: Invalid query parameters (e.g., invalid scope value, invalid branchId format)
- 401: Unauthorized
- 500: Server error

**Filtering Logic:**

- All plans are automatically filtered by `tenantId` (from authenticated user's JWT)
- If `scope` is provided, only plans matching that scope are returned
- If `branchId` is provided, only BRANCH-scoped plans for that branch are returned (TENANT-scoped plans are not returned)
- If `q` is provided, plans matching the name substring are returned (case-insensitive)
- If `includeArchived` is false (default), only ACTIVE plans are returned
- If `includeArchived` is true, both ACTIVE and ARCHIVED plans are returned
- Filter combinations are ANDed together (e.g., scope=TENANT + includeArchived=true returns archived TENANT plans)

**Sorting:**

- Results are sorted by `sortOrder` ASC, then `createdAt` ASC
- If `sortOrder` is not set, plans are sorted by `createdAt` ASC

---

#### GET /api/v1/membership-plans/active

**Purpose:** Get all ACTIVE plans for the current tenant (for dropdown selection)

**Authorization:** ADMIN (and future roles)

**Query Parameters:**

```typescript
interface ActivePlansQuery {
  branchId?: string; // Optional: Filter plans available to a specific branch
  // If branchId provided: Returns TENANT-scoped plans + BRANCH-scoped plans for that branch
  // If branchId not provided: Returns all TENANT-scoped plans only
}
```

**Response:** Array of `MembershipPlan` objects (status ACTIVE only), sorted by `sortOrder` ASC, then `createdAt` ASC

**Status Codes:**

- 200: Success
- 400: Invalid branchId format
- 401: Unauthorized
- 403: Forbidden (branchId belongs to different tenant)
- 500: Server error

**Use Case:** This endpoint is optimized for plan selection dropdowns in member creation forms. Returns ACTIVE plans without pagination (typically < 50 plans per tenant).

**Filtering Logic:**

- If `branchId` is provided:
  - Returns all TENANT-scoped ACTIVE plans (available to all branches)
  - Plus all BRANCH-scoped ACTIVE plans for the specified branch
  - Validates that branchId belongs to the current tenant
- If `branchId` is not provided:
  - Returns all TENANT-scoped ACTIVE plans only
  - BRANCH-scoped plans are not returned (they require a branchId context)

---

#### GET /api/v1/membership-plans/:id

**Purpose:** Get details of a specific membership plan

**Authorization:** ADMIN (and future roles)

**URL Parameters:**

- `id`: Plan ID (CUID)

**Response:** Single `MembershipPlan` object

**Status Codes:**

- 200: Success
- 401: Unauthorized
- 403: Forbidden (plan belongs to different tenant)
- 404: Plan not found
- 500: Server error

---

#### POST /api/v1/membership-plans

**Purpose:** Create a new membership plan for the current tenant

**Authorization:** ADMIN only

**Request:**

```typescript
interface CreatePlanRequest {
  scope: PlanScope; // Required: "TENANT" or "BRANCH"
  branchId?: string; // Required if scope is BRANCH, must be omitted or null if scope is TENANT
  name: string; // Required: Plan name, unique per tenant (TENANT scope) or per branch (BRANCH scope)
  description?: string; // Optional: Plan description
  durationType: DurationType; // Required: "DAYS" or "MONTHS"
  durationValue: number; // Required: Integer > 0
  price: number; // Required: Decimal >= 0
  currency: string; // Required: ISO 4217 currency code
  maxFreezeDays?: number; // Optional: Integer >= 0, null means no freeze
  autoRenew?: boolean; // Optional: Default false
  sortOrder?: number; // Optional: Integer for UI ordering
}
```

**Response:** Single `MembershipPlan` object (201 Created)

**Status Codes:**

- 201: Created successfully
- 400: Validation error (including duplicate plan name, invalid scope/branchId combination)
- 401: Unauthorized
- 403: Forbidden (user is not ADMIN, or branchId belongs to different tenant)
- 500: Server error

**Validation Rules:**

- `scope`: Required, must be "TENANT" or "BRANCH" (case-sensitive enum)
- `branchId`: 
  - If scope is TENANT: Must be omitted or null, returns 400 if provided
  - If scope is BRANCH: Required, must be valid CUID, must reference an active branch belonging to current tenant
- `name`: Required, 1-100 characters, trim whitespace, must be unique within tenant (TENANT scope) or within branch (BRANCH scope) for ACTIVE plans only
- `description`: Optional, max 1000 characters
- `durationType`: Required, must be "DAYS" or "MONTHS" (case-sensitive enum)
- `durationValue`: Required, must be integer > 0, strict range: 1-730 for DAYS (inclusive), 1-24 for MONTHS (inclusive)
- `price`: Required, must be number >= 0, max 2 decimal places
- `currency`: Required, must be valid ISO 4217 currency code (3 uppercase letters)
- `maxFreezeDays`: Optional, must be integer >= 0 if provided, null means no freeze allowed
- `autoRenew`: Optional, defaults to false if not provided
- `sortOrder`: Optional, integer (can be negative)

**Error Response:**

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string; // Error message
  errors?: Array<{
    field: string;
    message: string;
  }>;
}
```

**Example Request (TENANT scope):**

```json
{
  "scope": "TENANT",
  "name": "Premium 12 Months",
  "description": "Annual premium membership with all facilities access",
  "durationType": "MONTHS",
  "durationValue": 12,
  "price": 120000,
  "currency": "JPY",
  "maxFreezeDays": 30,
  "autoRenew": true,
  "sortOrder": 1
}
```

**Example Request (BRANCH scope):**

```json
{
  "scope": "BRANCH",
  "branchId": "clx1234567890abcdef",
  "name": "Downtown Premium",
  "description": "Premium plan exclusive to downtown branch",
  "durationType": "MONTHS",
  "durationValue": 6,
  "price": 80000,
  "currency": "JPY",
  "maxFreezeDays": 15,
  "autoRenew": false,
  "sortOrder": 2
}
```

---

#### PATCH /api/v1/membership-plans/:id

**Purpose:** Update an existing membership plan

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Plan ID (CUID)

**Request:**

```typescript
interface UpdatePlanRequest {
  scope?: PlanScope; // NOT ALLOWED: Scope is immutable after creation
  branchId?: string; // NOT ALLOWED: branchId is immutable after creation (determined by scope)
  name?: string; // Optional: Update plan name
  description?: string; // Optional: Update description
  durationType?: DurationType; // Optional: Update duration type
  durationValue?: number; // Optional: Update duration value
  price?: number; // Optional: Update price
  currency?: string; // Optional: Update currency
  maxFreezeDays?: number; // Optional: Update freeze days (null to remove)
  autoRenew?: boolean; // Optional: Update auto-renew flag
  sortOrder?: number; // Optional: Update sort order
  status?: PlanStatus; // Optional: Update status (ACTIVE/ARCHIVED)
}
```

**Response:** Single `MembershipPlan` object (updated)

**Status Codes:**

- 200: Success
- 400: Validation error (including duplicate plan name if name changed, or attempting to change scope/branchId)
- 401: Unauthorized
- 403: Forbidden (plan belongs to different tenant or user is not ADMIN)
- 404: Plan not found
- 500: Server error

**Validation Rules:**

- `scope`: NOT ALLOWED in update request (scope is immutable after creation)
- `branchId`: NOT ALLOWED in update request (branchId is immutable after creation, determined by scope)
- Same validation rules as create request for provided fields
- `name`: If provided, must be unique within tenant (TENANT scope) or within branch (BRANCH scope) for ACTIVE plans only, excluding current plan
- `status`: If changing to ARCHIVED, system checks for active members and returns warning (but allows update)
- Plan updates do NOT retroactively affect existing members (their dates remain unchanged)

**Important:** Changing `durationType` or `durationValue` does NOT affect existing members. Only new members created after the update will use the new duration.

---

#### POST /api/v1/membership-plans/:id/archive

**Purpose:** Archive a membership plan (soft delete)

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Plan ID (CUID)

**Request:** Empty body

**Response:**

```typescript
interface ArchivePlanResponse {
  id: string;
  status: "ARCHIVED";
  message: string; // Informational message
  activeMemberCount?: number; // Number of active members using this plan (if any)
}
```

**Status Codes:**

- 200: Success
- 400: Bad request (plan already archived)
- 401: Unauthorized
- 403: Forbidden (plan belongs to different tenant or user is not ADMIN)
- 404: Plan not found
- 500: Server error

**Business Logic:**

- Sets plan `status` to ARCHIVED
- Plan is no longer selectable for new members
- Existing members with this plan remain unaffected
- Returns count of active members (status = ACTIVE AND membershipEndDate >= today) using this plan (informational warning)

---

#### POST /api/v1/membership-plans/:id/restore

**Purpose:** Restore an archived plan to ACTIVE status

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Plan ID (CUID)

**Request:** Empty body

**Response:** Single `MembershipPlan` object with status ACTIVE

**Status Codes:**

- 200: Success
- 400: Bad request (plan already active)
- 401: Unauthorized
- 403: Forbidden (plan belongs to different tenant or user is not ADMIN)
- 404: Plan not found
- 500: Server error

**Business Logic:**

- Sets plan `status` to ACTIVE
- Plan becomes available for selection by new members
- Uniqueness validation runs when restoring (must not conflict with existing ACTIVE plans)

---

#### DELETE /api/v1/membership-plans/:id

**Purpose:** Hard delete a membership plan (only allowed if plan has no members)

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Plan ID (CUID)

**Request:** Empty body

**Response:** 204 No Content

**Status Codes:**

- 204: Successfully deleted
- 400: Bad request (plan has members, cannot delete - must archive instead)
- 401: Unauthorized
- 403: Forbidden (plan belongs to different tenant or user is not ADMIN)
- 404: Plan not found
- 500: Server error

**Business Logic:**

- Hard delete is only allowed if plan has zero members (checked by counting all Member records with this `membershipPlanId`, regardless of status)
- If plan has any members (active, paused, inactive, or archived), returns 400 with message: "Cannot delete plan with existing members. Archive the plan instead."
- This endpoint is rarely used; archival is the preferred method for removing plans from active use

---

## Data Model (Prisma Schema)

### MembershipPlan Model (Modified)

```prisma
model MembershipPlan {
  id            String       @id @default(cuid())
  tenantId      String       // REQUIRED for tenant scoping
  scope         String       // "TENANT" or "BRANCH" (enum)
  branchId      String?      // REQUIRED if scope is BRANCH, null if scope is TENANT
  name          String
  description   String?
  durationType  DurationType
  durationValue Int
  price         Decimal      @db.Decimal(10, 2)
  currency      String
  maxFreezeDays Int?
  autoRenew     Boolean      @default(false)
  status        PlanStatus
  sortOrder     Int?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  tenant  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch  Branch?  @relation(fields: [branchId], references: [id], onDelete: Restrict)
  members Member[]

  // Uniqueness: TENANT scope - unique per tenant, BRANCH scope - unique per branch
  // Note: Prisma does not support conditional unique constraints, so we enforce this in application logic
  @@unique([tenantId, name]) // This will be replaced by application-level validation
  @@index([tenantId])
  @@index([tenantId, scope])
  @@index([tenantId, status])
  @@index([tenantId, branchId])
  @@index([tenantId, scope, status]) // For filtering active plans by scope
  @@index([branchId]) // For branch-scoped plan queries
}

enum PlanScope {
  TENANT
  BRANCH
}

enum DurationType {
  DAYS
  MONTHS
}

enum PlanStatus {
  ACTIVE
  ARCHIVED
}
```

**Note on Uniqueness Constraints:**

Prisma does not support conditional unique constraints (unique per tenant for TENANT scope, unique per branch for BRANCH scope). Therefore, uniqueness validation must be enforced in application logic:

- For TENANT scope: Check that no ACTIVE plan with the same name exists for the tenant (case-insensitive)
- For BRANCH scope: Check that no ACTIVE plan with the same name exists for the branch (case-insensitive)
- Archived plans do not count toward uniqueness constraints

The `@@unique([tenantId, name])` constraint in Prisma schema provides a database-level safeguard but does not fully enforce scope-based uniqueness. Application-level validation is required.

### Migration Considerations

1. **Backward Compatibility:**
   - Existing plans are TENANT-scoped (they have tenantId but no branchId)
   - Migration script must:
     a. Add `scope` field with default value "TENANT" for all existing plans
     b. Ensure `branchId` is null for all existing plans (already the case)
     c. Add `branchId` column as nullable
     d. Add `branch` relation to MembershipPlan model
   - Migration should be reversible (backup existing data before changes)

2. **Data Migration Strategy:**
   - Add `scope` column with default value "TENANT"
   - Add `branchId` column as nullable (default null)
   - Add foreign key constraint for `branchId` → `Branch.id`
   - Update all existing plans: set `scope = "TENANT"` and ensure `branchId = null`
   - Existing uniqueness constraint `@@unique([tenantId, name])` remains but will be supplemented by application-level validation

3. **Index Strategy:**
   - `@@index([tenantId])` on MembershipPlan for tenant-scoped queries
   - `@@index([tenantId, scope])` for filtering plans by scope
   - `@@index([tenantId, status])` for filtering active plans efficiently
   - `@@index([tenantId, branchId])` for filtering BRANCH-scoped plans by branch
   - `@@index([tenantId, scope, status])` for filtering active plans by scope
   - `@@index([branchId])` for branch-scoped plan queries
   - `@@index([tenantId, sortOrder])` for ordered plan lists

4. **Migration Rollback Plan:**
   - Keep existing `tenantId` and `name` columns unchanged during migration
   - If rollback needed, remove `scope` and `branchId` columns and restore previous schema

---

## Security & Tenant Isolation

### Tenant Scoping

**Database Queries:**

- All MembershipPlan queries MUST include `WHERE tenantId = :tenantId` filter
- Plan lookups for members MUST validate `plan.tenantId = member.tenantId`
- Plan creation MUST set `tenantId` from authenticated user's JWT claim
- Plan updates/deletes MUST verify plan belongs to user's tenant
- Branch validation: When `branchId` is provided, MUST verify `branch.tenantId = authenticatedUser.tenantId`

**API Endpoints:**

- All plan endpoints extract `tenantId` from JWT token
- Plan IDs are validated against tenant before any operation
- Cross-tenant plan access returns 403 Forbidden
- Branch IDs are validated against tenant before allowing BRANCH-scoped plan creation
- Cross-tenant branch references return 403 Forbidden

**UI State:**

- Plan lists are filtered by authenticated user's tenant
- Plan dropdowns only show plans for current tenant
- Plan selection in member forms validates tenant match
- Branch selection validates branch belongs to current tenant

### Authorization

**Current Roles:**

- **ADMIN:** Full access to plan management (create, read, update, archive, delete)
- **Future Roles:** OWNER (same as ADMIN), STAFF (read-only), BRANCH_MANAGER (read-only for their branch's tenant)

**Permission Checks:**

- Plan creation: Requires ADMIN role
- Plan updates: Requires ADMIN role + plan belongs to tenant
- Plan archival: Requires ADMIN role + plan belongs to tenant
- Plan deletion: Requires ADMIN role + plan belongs to tenant + plan has zero members
- Plan viewing: Requires authenticated user + plan belongs to tenant

### Data Sensitivity

- Plan pricing information is tenant-private (business data)
- No PII in plan data (plans are product definitions, not personal data)
- Plan archival history should be preserved for audit purposes
- Log plan creation/update/archive events for audit trail
- Branch-scoped plans reveal branch-level pricing strategies (sensitive business data)

---

## Testing Requirements

### Unit Tests

Critical domain logic that MUST have unit tests:

- [ ] Plan scope validation: TENANT scope requires null branchId
- [ ] Plan scope validation: BRANCH scope requires valid branchId
- [ ] Plan scope validation: Reject TENANT plan with branchId
- [ ] Plan scope validation: Reject BRANCH plan without branchId
- [ ] Plan name uniqueness: TENANT scope - unique per tenant (case-insensitive, ACTIVE only)
- [ ] Plan name uniqueness: BRANCH scope - unique per branch (case-insensitive, ACTIVE only)
- [ ] Plan name uniqueness: Duplicate names allowed across different branches
- [ ] Plan name uniqueness: Duplicate names allowed between TENANT and BRANCH scopes
- [ ] Plan name uniqueness: Archived plans do not count toward uniqueness
- [ ] Branch validation: branchId must belong to current tenant
- [ ] Branch validation: Cannot create BRANCH plan for archived branch
- [ ] Scope immutability: Cannot change scope after plan creation
- [ ] Scope immutability: Cannot change branchId after plan creation
- [ ] Plan archival protection (cannot delete plan with members)
- [ ] Plan status transition validation (ACTIVE ↔ ARCHIVED)

### Integration Tests

API endpoints and flows that MUST have integration tests:

- [ ] GET /api/v1/membership-plans - List plans with tenant isolation
- [ ] GET /api/v1/membership-plans - Filter by scope (TENANT | BRANCH)
- [ ] GET /api/v1/membership-plans - Filter by branchId
- [ ] GET /api/v1/membership-plans - Filter by name search (q parameter)
- [ ] GET /api/v1/membership-plans - Filter by includeArchived flag
- [ ] GET /api/v1/membership-plans/active - Returns TENANT plans when branchId not provided
- [ ] GET /api/v1/membership-plans/active - Returns TENANT + BRANCH plans when branchId provided
- [ ] GET /api/v1/membership-plans/active - Validates branchId belongs to tenant
- [ ] GET /api/v1/membership-plans/:id - Get plan with tenant validation
- [ ] POST /api/v1/membership-plans - Create TENANT-scoped plan with null branchId
- [ ] POST /api/v1/membership-plans - Create BRANCH-scoped plan with valid branchId
- [ ] POST /api/v1/membership-plans - Reject TENANT plan with branchId (400)
- [ ] POST /api/v1/membership-plans - Reject BRANCH plan without branchId (400)
- [ ] POST /api/v1/membership-plans - Reject BRANCH plan with branchId from different tenant (403)
- [ ] POST /api/v1/membership-plans - Reject duplicate TENANT plan name (400)
- [ ] POST /api/v1/membership-plans - Reject duplicate BRANCH plan name within same branch (400)
- [ ] POST /api/v1/membership-plans - Allow duplicate plan names across different branches
- [ ] POST /api/v1/membership-plans - Allow duplicate plan names between TENANT and BRANCH scopes
- [ ] PATCH /api/v1/membership-plans/:id - Reject scope change (400)
- [ ] PATCH /api/v1/membership-plans/:id - Reject branchId change (400)
- [ ] PATCH /api/v1/membership-plans/:id - Update plan (existing members unaffected)
- [ ] POST /api/v1/membership-plans/:id/archive - Archive plan with active members warning
- [ ] DELETE /api/v1/membership-plans/:id - Cannot delete plan with members
- [ ] Tenant isolation: Plan from Tenant A not accessible to Tenant B (403)
- [ ] Branch isolation: BRANCH plan from Branch A not accessible when querying Branch B plans

### Edge Cases

Known edge cases to test:

- [ ] Create TENANT plan with branchId provided (should return 400)
- [ ] Create BRANCH plan without branchId (should return 400)
- [ ] Create BRANCH plan with branchId from different tenant (should return 403)
- [ ] Create BRANCH plan for archived branch (should return 400)
- [ ] Create duplicate TENANT plan name (should return 400 for ACTIVE plans)
- [ ] Create duplicate BRANCH plan name within same branch (should return 400 for ACTIVE plans)
- [ ] Create duplicate plan names across different branches (should succeed)
- [ ] Create duplicate plan names between TENANT and BRANCH scopes (should succeed)
- [ ] Archive plan, then create new plan with same name (should succeed, archived plan doesn't count)
- [ ] Update plan scope (should return 400, scope is immutable)
- [ ] Update plan branchId (should return 400, branchId is immutable)
- [ ] Filter plans by scope=TENANT (should return only TENANT-scoped plans)
- [ ] Filter plans by scope=BRANCH (should return only BRANCH-scoped plans)
- [ ] Filter plans by branchId (should return only BRANCH-scoped plans for that branch)
- [ ] Filter plans by branchId for different tenant's branch (should return empty, tenant isolation)
- [ ] Archive branch, then query BRANCH plans for that branch (plan remains valid, historical record)
- [ ] List active plans with branchId filter (should return TENANT + BRANCH plans for that branch)
- [ ] List active plans without branchId filter (should return only TENANT plans)

---

## Performance & Scalability

### Expected Load

- **Typical Usage:** 10-50 plans per tenant (small to medium gyms)
- **Large Tenants:** Up to 100 plans per tenant (enterprise gyms with many package types)
- **Branch-Scoped Plans:** Typically 0-10 BRANCH plans per branch (most plans will be TENANT-scoped)
- **Plan Queries:** Frequent (every member creation form load)
- **Plan Updates:** Infrequent (monthly or quarterly pricing/duration adjustments)
- **Scope Filtering:** Common operation (filtering by scope or branchId)

### Database Indexes

Required indexes for performance:

- [ ] `@@index([tenantId])` on MembershipPlan: Tenant-scoped plan queries
- [ ] `@@index([tenantId, scope])` on MembershipPlan: Filter plans by scope efficiently
- [ ] `@@index([tenantId, status])` on MembershipPlan: Filter active plans efficiently
- [ ] `@@index([tenantId, branchId])` on MembershipPlan: Filter BRANCH-scoped plans by branch
- [ ] `@@index([tenantId, scope, status])` on MembershipPlan: Filter active plans by scope
- [ ] `@@index([branchId])` on MembershipPlan: Branch-scoped plan queries
- [ ] `@@index([tenantId, sortOrder])` on MembershipPlan: Ordered plan lists

### Query Optimization

**N+1 Query Concerns:**

- Plan list with branch details: Use Prisma `include` to eager-load branch information for BRANCH-scoped plans
- Plan list with member counts: Use aggregation query (`_count` relation) instead of separate queries
- Active plans dropdown: Cache query results (React Query default caching)

**Efficient Loading:**

- Plan lists: Use pagination for tenants with > 50 plans
- Active plans: Load all at once (typically < 50, cache aggressively)
- Scope filtering: Use indexed queries (`tenantId + scope`)
- BranchId filtering: Use indexed queries (`tenantId + branchId` or `branchId`)

---

## Implementation Checklist

### Backend

- [ ] MembershipPlan domain entity updated (add scope and branchId fields)
- [ ] PlanScope enum created (TENANT | BRANCH)
- [ ] Prisma schema updated with scope and branchId fields
- [ ] Migration created for adding scope and branchId columns
- [ ] Migration script: Set scope = "TENANT" for all existing plans
- [ ] Migration script: Ensure branchId = null for all existing plans
- [ ] Service layer updated (PlansService with scope validation)
- [ ] Scope validation logic implemented (TENANT requires null branchId, BRANCH requires valid branchId)
- [ ] Branch validation logic implemented (branchId must belong to tenant, branch must be active)
- [ ] Uniqueness validation logic implemented (scope-based uniqueness: TENANT per tenant, BRANCH per branch)
- [ ] Scope immutability enforced (cannot change scope or branchId after creation)
- [ ] Controllers updated (HTTP only, no business logic)
- [ ] Validation DTOs updated (CreatePlanDto, UpdatePlanDto with scope validation)
- [ ] Plan list endpoint updated with scope and branchId filters
- [ ] Active plans endpoint updated with branchId filter logic
- [ ] Unit tests written (scope validation, uniqueness validation, branch validation)
- [ ] Integration tests written (API endpoints, tenant isolation, scope filtering, edge cases)

### Frontend

**Note:** Frontend implementation is out of scope for this feature. This section is included for future reference.

- [ ] Shared TypeScript types updated (MembershipPlan with scope and branchId fields, PlanScope enum)
- [ ] API client methods updated (`api/membership-plans.ts` with scope and branchId parameters)
- [ ] React Query hooks updated (useMembershipPlans with scope/branchId filters)
- [ ] Plan List page updated (add scope filter dropdown, branchId filter)
- [ ] Plan Creation form updated (add scope selector, conditional branchId field)
- [ ] Plan Edit form updated (scope and branchId fields read-only)
- [ ] PlanSelector component updated (filter plans by branchId context)
- [ ] Loading/error states handled
- [ ] Responsive design verified
- [ ] Accessibility checked

### Documentation

- [ ] API documentation updated (OpenAPI/Swagger spec with scope and branchId fields)
- [ ] Migration guide written (how to migrate existing plans to TENANT scope)
- [ ] README updated with branch-aware plan management instructions
- [ ] Inline code comments for complex logic (scope validation, uniqueness validation)

---

## Open Questions

None at this time. All requirements are clear from the feature description.

---

## Future Enhancements

Features or improvements intentionally deferred:

1. **Frontend Implementation:**
   - Why deferred: Explicitly out of scope for this feature
   - Future: UI for creating/editing branch-aware plans, scope filtering, branch selection

2. **Plan Migration Between Scopes:**
   - Why deferred: Complex migration logic, potential data conflicts
   - Future: Allow converting TENANT plans to BRANCH plans (or vice versa) with member migration strategy

3. **Plan Assignment Rules:**
   - Why deferred: Business logic complexity, requires member context
   - Future: Automatic plan assignment based on member's branch, plan availability rules

4. **Branch-Level Plan Templates:**
   - Why deferred: Not needed for v1; admins can create plans manually
   - Future: Pre-defined plan templates per branch, plan copying between branches

5. **Payment and Accounting Integration:**
   - Why deferred: Explicitly out of scope, requires separate features
   - Future: Branch-level revenue tracking, branch-specific payment processing

---

**Approval**

- [ ] Domain model reviewed and approved
- [ ] API design reviewed and approved
- [ ] Security implications reviewed
- [ ] Performance implications reviewed
- [ ] Migration strategy reviewed and approved
- [ ] Ready for implementation

---

**End of Specification**
