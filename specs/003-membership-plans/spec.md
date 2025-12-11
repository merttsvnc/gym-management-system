# Feature Specification: Membership Plan Management (Üyelik Paketleri)

**Version:** 1.0.0  
**Author:** System Architect  
**Date:** 2025-01-20  
**Status:** Draft

---

## Overview

### Purpose

The Membership Plan Management module introduces a first-class MembershipPlan entity to replace the current string-based `membershipType` field on Member records. This change enables consistent plan definitions across tenants, automatic membership end date calculation based on plan duration, and enforcement of business rules such as pricing, freeze policies, and auto-renewal settings.

Today, member records store `membershipType` as a plain string (e.g., "Basic", "Standard", "Premium"), which is not safe or consistent across tenants and makes it impossible to enforce business rules like duration, price, freezes, and auto-renewal. This module establishes a proper data model where plans are defined at the tenant level and linked to members through foreign keys, enabling automatic date calculations and future billing integrations.

This is a core business feature that provides the foundation for consistent membership management, pricing control, and future payment processing capabilities.

### Scope

**What IS included:**

- MembershipPlan entity with tenant ownership and full CRUD operations
- Plan definition fields: name, description, duration (DAYS/MONTHS), price, currency, freeze rules, auto-renewal flag
- Plan status management (ACTIVE/ARCHIVED) with soft-delete protection
- Member model integration: replace `membershipType` string with `membershipPlanId` foreign key
- Automatic membership end date calculation based on plan duration and start date
- Tenant admin UI for plan management (backend API contract defined)
- Plan archival protection: plans with active members cannot be deleted, only archived
- Tenant-scoped plan isolation (plans are private to each tenant)
- Plan selection in member creation/update flows
- Optional storage of purchase price on Member for historical reporting

**What is NOT included:**

- Advanced billing integration (payment gateways, recurring charges, invoicing)
- Complex freeze logic implementation (we store `maxFreezeDays` but do not implement freeze workflows)
- Auto-renewal job implementation (we store `autoRenew` flag but do not implement renewal automation)
- Reporting/dashboard for revenue per plan (separate module)
- Branch-level plan definitions (plans are tenant-level only in v1)
- Plan change workflows for existing members (first version disallows changing plans after creation)
- Price change notifications or member communication
- Plan templates or plan copying between tenants

### Constitution Alignment

This feature aligns with multiple constitutional principles:

- **Principle 6 (Multi-Tenant SaaS):** Enforces strict tenant isolation for plans and plan-member relationships
- **Principle 1 (Long-Term Maintainability):** Establishes proper data model foundation for future billing and payment features
- **Principle 3 (Explicit Domain Rules):** Defines clear plan duration calculation rules and archival constraints
- **Principle 5 (Modular Architecture):** Creates reusable plan management patterns for future subscription and billing modules
- **Principle 9 (Performance & Scalability):** Implements proper indexing for plan queries and member-plan joins

---

## Clarifications

### Session 2025-01-20

- Q: When calculating membership end date for MONTHS duration, what should happen when the start date falls on a day that doesn't exist in the target month (e.g., Jan 31 + 1 month)? → A: Add calendar months and clamp to the last day of the target month if the day doesn't exist. For example: Jan 31 + 1 month = Feb 28/29 (depending on leap year), Mar 31 + 1 month = Apr 30. This ensures business-friendly behavior and prevents invalid dates.

- Q: When determining if a plan has "active members" for archival protection, which members should be considered? → A: Only members with `status = ACTIVE` AND `membershipEndDate >= today`. This aligns with the business meaning of "active membership" (members currently using the gym) and prevents archiving plans that have members actively using facilities. PAUSED, INACTIVE, or ARCHIVED members do not count toward active member count for archival protection.

- Q: If a tenant doesn't have a `defaultCurrency` set (null/empty) during migration, what currency should be used for migrated plans? → A: Use "TRY" (Turkish Lira) as fallback if tenant `defaultCurrency` is null/empty. This provides a safe default that matches the primary market and ensures all migrated plans have a valid currency code.

- Q: Should duration value ranges (DAYS: 1-730, MONTHS: 1-24) be strictly enforced or serve as guidelines? → A: Strict validation: Reject values outside the stated ranges with clear error messages. This prevents unrealistic plans (e.g., 10-year memberships) and keeps the system predictable. The ranges are generous enough (730 days = 2 years, 24 months = 2 years) to cover legitimate use cases.

---

## Domain Model

### Core Concepts

**What is a MembershipPlan?**

A MembershipPlan represents a membership package definition owned by a tenant. Each plan defines the duration, pricing, and optional rules (freeze days, auto-renewal) for memberships. Plans are defined at the tenant level, meaning all branches within a tenant share the same set of plans. When a member is created, they select a plan, and the system automatically calculates their membership end date based on the plan's duration.

**Plan Status Semantics:**

- **ACTIVE:** Plan is available for selection when creating new members. Active plans appear in dropdown menus and can be assigned to members.
- **ARCHIVED:** Plan is no longer available for new memberships but remains visible in historical member records. Archived plans do not appear in plan selection dropdowns for new members. Plans with active members cannot be deleted; they must be archived instead.

**Membership Duration Calculation:**

- When a member is created with a plan, `membershipEndDate` is automatically calculated from `membershipStartDate` + plan duration
- Duration can be specified in DAYS (e.g., 30, 90, 365) or MONTHS (e.g., 1, 3, 12)
- For MONTHS, the calculation accounts for varying month lengths (e.g., 1 month from Jan 31 → Feb 28/29)
- Once calculated and stored on the Member record, the dates are the source of truth. Future plan duration changes do not retroactively affect existing members.

**Plan-Member Relationship:**

- Each member has a `membershipPlanId` foreign key linking to a MembershipPlan
- The plan reference is immutable after member creation (v1 restriction)
- Historical price tracking: optionally store `membershipPriceAtPurchase` on Member to preserve purchase-time pricing for reporting

**Tenant Isolation:**

- Plans belong to exactly one Tenant
- Plans are not shared across tenants
- Plan lookups for members are automatically scoped to the member's tenant
- Tenant A cannot see or use Tenant B's plans

### Entities

#### MembershipPlan

```typescript
interface MembershipPlan {
  id: string; // CUID primary key
  tenantId: string; // REQUIRED: Tenant this plan belongs to
  name: string; // Required: Plan name, unique per tenant (e.g., "Basic 1 Month", "Premium 12 Months")
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

enum DurationType {
  DAYS = "DAYS",
  MONTHS = "MONTHS"
}

enum PlanStatus {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED"
}
```

#### Member (Modified)

```typescript
interface Member {
  // ... existing fields ...
  
  // REPLACED: membershipType: string;
  // NEW: Foreign key to plan
  membershipPlanId: string; // REQUIRED: Foreign key to MembershipPlan
  
  // KEPT: Existing date fields remain unchanged
  membershipStartDate: Date; // Start date of membership
  membershipEndDate: Date; // End date of membership (calculated from plan duration)
  
  // OPTIONAL: Store purchase-time price for historical reporting
  membershipPriceAtPurchase?: number; // Optional: Price at time of purchase (for historical reporting)
  
  // ... other existing fields ...
  
  // Computed/relation fields (returned in API, not stored)
  membershipPlan?: MembershipPlan; // Optional: Include plan details if requested
}
```

### Relationships

```
Tenant (1) ──< (many) MembershipPlan
MembershipPlan (1) ──< (many) Member
Tenant (1) ──< (many) Member (existing)
Branch (1) ──< (many) Member (existing)
```

- A MembershipPlan MUST belong to exactly one Tenant
- A Member MUST reference exactly one MembershipPlan (via `membershipPlanId`)
- A Member MUST belong to exactly one Tenant (existing relationship)
- A Member MUST belong to exactly one Branch (existing relationship)
- Therefore, a Member's plan is implicitly scoped to their tenant

### Business Rules

1. **Tenant Isolation (CRITICAL):**
   - All plan queries MUST filter by `tenantId` automatically
   - Plans cannot be accessed across tenant boundaries
   - Member-plan relationships are validated to ensure plan belongs to member's tenant
   - Attempting to assign a plan from a different tenant returns 403 Forbidden

2. **Plan Name Uniqueness:**
   - Plan names MUST be unique within a tenant (case-insensitive)
   - Plan names MAY be duplicated across different tenants
   - Validation occurs on create and update operations

3. **Plan Duration Validation:**
   - `durationValue` MUST be greater than 0
   - `durationType` MUST be either DAYS or MONTHS
   - **Strict range enforcement:**
     - For DAYS: `durationValue` MUST be between 1 and 730 (inclusive) - maximum 2 years
     - For MONTHS: `durationValue` MUST be between 1 and 24 (inclusive) - maximum 2 years
   - Values outside these ranges are rejected with clear error message: "Duration value must be between 1 and [max] [DAYS/MONTHS]"
   - These ranges prevent unrealistic plans while covering legitimate business use cases

4. **Plan Price Validation:**
   - `price` MUST be >= 0 (zero-price plans allowed for promotional purposes)
   - `currency` MUST be a valid ISO 4217 currency code
   - Currency is stored as-is; no currency conversion logic in v1

5. **Plan Archival Protection:**
   - Plans with active members CANNOT be deleted (hard delete)
   - Plans with active members CAN be archived (status → ARCHIVED)
   - **Active member definition:** Members with `status = ACTIVE` AND `membershipEndDate >= today` (members currently using the gym)
   - PAUSED, INACTIVE, or ARCHIVED members do NOT count toward active member count for archival protection
   - Archived plans do not appear in plan selection dropdowns for new members
   - Archived plans remain visible in member detail views and historical records
   - When archiving a plan, system checks for active members (status = ACTIVE AND membershipEndDate >= today) and warns if any exist (but allows archival)

6. **Member-Plan Assignment:**
   - When creating a member, user MUST select a plan (from ACTIVE plans only)
   - User can optionally set custom `membershipStartDate` (defaults to today)
   - System automatically calculates `membershipEndDate` = `membershipStartDate` + plan duration
   - Plan assignment is immutable after member creation (v1 restriction: cannot change plan for existing member)
   - If plan is archived after member creation, member's plan reference remains valid (historical record)

7. **Membership End Date Calculation:**
   - For DAYS: `membershipEndDate` = `membershipStartDate` + `durationValue` days
   - For MONTHS: `membershipEndDate` = `membershipStartDate` + `durationValue` months, clamping to last day of target month if day doesn't exist
     - Example: Jan 31 + 1 month = Feb 28/29 (leap year dependent)
     - Example: Mar 31 + 1 month = Apr 30
     - Example: Jan 15 + 1 month = Feb 15 (day exists, no clamping needed)
   - Calculation uses standard date arithmetic libraries that handle month-end clamping automatically (e.g., JavaScript Date, Python dateutil.relativedelta, SQL DATE_ADD with month arithmetic)
   - Once calculated and stored, dates are source of truth; plan duration changes do not affect existing members

8. **Plan Status Transitions:**
   - New plans are created with status ACTIVE
   - ACTIVE → ARCHIVED: Allowed at any time (with warning if active members exist)
   - ARCHIVED → ACTIVE: Allowed (restore functionality)
   - ACTIVE → DELETED: Not allowed if plan has any members (must archive first)
   - ARCHIVED → DELETED: Not allowed if plan has any members (historical records must be preserved)

9. **Sort Order:**
   - `sortOrder` is optional; if not provided, plans are ordered by `createdAt` (oldest first)
   - Lower `sortOrder` values appear first in UI lists
   - `sortOrder` can be negative (e.g., -1, 0, 1, 2...)
   - Multiple plans can have the same `sortOrder` (secondary sort by `createdAt`)

---

## Success Criteria

The Membership Plan Management module will be considered successful when:

1. **Data Model Integrity:**
   - 100% of plan queries enforce tenant isolation (zero cross-tenant plan access)
   - All member-plan relationships maintain referential integrity (plan belongs to member's tenant)
   - Plan archival protection prevents deletion of plans with active members
   - Membership end dates are calculated correctly for both DAYS and MONTHS duration types

2. **Plan Management Operations:**
   - Tenant admins can create a new plan with all required fields in under 1 minute
   - Plan list page loads with filters applied in under 1 second for up to 100 plans per tenant
   - Plan archival completes successfully with proper status transition and member relationship preservation
   - Plan updates (name, price, duration) complete successfully without affecting existing members

3. **Member Integration:**
   - Member creation with plan selection automatically calculates membership end date correctly
   - All existing members can be migrated from `membershipType` string to `membershipPlanId` foreign key
   - Member detail views display plan information correctly
   - Plan selection dropdowns show only ACTIVE plans for the tenant

4. **User Experience:**
   - Plan management UI provides clear feedback when archiving plans with active members
   - Plan creation form validates all fields and provides clear error messages
   - Member creation form shows plan selection with duration preview (e.g., "1 Month - ends on 2025-02-20")
   - Archived plans are visually distinguished in UI (e.g., grayed out, "Archived" badge)

5. **Performance:**
   - Plan list queries complete in under 300ms for typical datasets (up to 100 plans per tenant)
   - Member creation with plan selection completes in under 1 second
   - Plan lookup for member detail page completes in under 200ms

6. **Migration Success:**
   - All existing members with `membershipType` strings are successfully migrated to plan references
   - Migration creates default plans for each unique `membershipType` value per tenant
   - No data loss occurs during migration
   - Post-migration, all members have valid `membershipPlanId` references

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
  status?: PlanStatus; // Optional: Filter by status (ACTIVE, ARCHIVED), default: all
  search?: string; // Optional: Search by plan name (partial match, case-insensitive)
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
- 400: Invalid query parameters
- 401: Unauthorized
- 500: Server error

**Sorting:**

- Results are sorted by `sortOrder` ASC, then `createdAt` ASC
- If `status` filter is provided, only plans matching that status are returned
- If `search` is provided, plans matching the name substring are returned

---

#### GET /api/v1/membership-plans/active

**Purpose:** Get all ACTIVE plans for the current tenant (for dropdown selection)

**Authorization:** ADMIN (and future roles)

**Response:** Array of `MembershipPlan` objects (status ACTIVE only), sorted by `sortOrder` ASC, then `createdAt` ASC

**Status Codes:**

- 200: Success
- 401: Unauthorized
- 500: Server error

**Use Case:** This endpoint is optimized for plan selection dropdowns in member creation forms. Returns only ACTIVE plans without pagination (typically < 50 plans per tenant).

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
  name: string; // Required: Plan name, unique per tenant
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
- 400: Validation error (including duplicate plan name)
- 401: Unauthorized
- 403: Forbidden (user is not ADMIN)
- 500: Server error

**Validation Rules:**

- `name`: Required, 1-100 characters, trim whitespace, must be unique within tenant (case-insensitive)
- `description`: Optional, max 1000 characters
- `durationType`: Required, must be "DAYS" or "MONTHS" (case-sensitive enum)
- `durationValue`: Required, must be integer > 0, strict range: 1-730 for DAYS (inclusive), 1-24 for MONTHS (inclusive). Values outside range are rejected with error message.
- `price`: Required, must be number >= 0, max 2 decimal places
- `currency`: Required, must be valid ISO 4217 currency code (3 uppercase letters, e.g., "JPY", "USD", "EUR")
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

**Example Request:**

```json
{
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

---

#### PATCH /api/v1/membership-plans/:id

**Purpose:** Update an existing membership plan

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Plan ID (CUID)

**Request:**

```typescript
interface UpdatePlanRequest {
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
- 400: Validation error (including duplicate plan name if name changed)
- 401: Unauthorized
- 403: Forbidden (plan belongs to different tenant or user is not ADMIN)
- 404: Plan not found
- 500: Server error

**Validation Rules:**

- Same as create request for provided fields
- `name`: If provided, must be unique within tenant (case-insensitive), excluding current plan
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
- Note: For archival protection warnings, only ACTIVE members with valid end dates are counted; for deletion protection, ALL members are counted (to preserve historical records)
- This endpoint is rarely used; archival is the preferred method for removing plans from active use

---

### Member Endpoint Modifications

#### POST /api/v1/members (Modified)

**Purpose:** Create a new member (updated to use plan selection)

**Authorization:** ADMIN only

**Request:**

```typescript
interface CreateMemberRequest {
  // ... existing fields ...
  
  // REPLACED: membershipType?: string;
  // NEW: Plan selection (required)
  membershipPlanId: string; // Required: ID of ACTIVE plan to assign
  
  // MODIFIED: Start date is optional (defaults to today)
  membershipStartDate?: string; // Optional: ISO 8601 date, defaults to today
  
  // REMOVED: membershipEndDate (now calculated automatically)
  // membershipEndDate is calculated from plan duration + start date
  
  // OPTIONAL: Store purchase price
  membershipPriceAtPurchase?: number; // Optional: Price at purchase time
}
```

**Response:** Single `Member` object with `membershipPlanId` and calculated `membershipEndDate`

**Validation Rules:**

- `membershipPlanId`: Required, must be valid CUID, must belong to authenticated user's tenant, must be ACTIVE
- `membershipStartDate`: Optional, must be valid date, defaults to today if not provided
- `membershipEndDate`: Not accepted in request (calculated automatically)
- `membershipPriceAtPurchase`: Optional, if provided, defaults to plan's current `price`

**Business Logic:**

1. Validate `membershipPlanId` exists and is ACTIVE for the tenant
2. Set `membershipStartDate` to provided value or today
3. Calculate `membershipEndDate` = `membershipStartDate` + plan duration
4. If `membershipPriceAtPurchase` not provided, set it to plan's current `price`
5. Create member with plan reference

---

#### PATCH /api/v1/members/:id (Modified)

**Purpose:** Update an existing member (plan change NOT allowed in v1)

**Authorization:** ADMIN only

**Request:**

```typescript
interface UpdateMemberRequest {
  // ... existing fields ...
  
  // NOT ALLOWED in v1: membershipPlanId (plan change requires explicit future feature)
  // membershipPlanId?: string; // Disallowed: Cannot change plan after creation
  
  // ALLOWED: Update dates manually if needed
  membershipStartDate?: string; // Optional: Update start date
  membershipEndDate?: string; // Optional: Update end date manually
}
```

**Validation Rules:**

- `membershipPlanId`: Not accepted in update request (v1 restriction)
- `membershipStartDate`: Optional, if provided, must be valid date
- `membershipEndDate`: Optional, if provided, must be valid date after `membershipStartDate`

**Note:** In v1, plan changes for existing members are explicitly disallowed. This will be a future enhancement requiring explicit spec and implementation.

---

#### GET /api/v1/members/:id (Modified)

**Purpose:** Get member details (includes plan information)

**Response:**

```typescript
interface Member {
  // ... existing fields ...
  membershipPlanId: string; // NEW: Foreign key to plan
  membershipPlan?: MembershipPlan; // Optional: Include plan details if requested
  membershipPriceAtPurchase?: number; // Optional: Purchase-time price
  // ... other fields ...
}
```

**Query Parameters:**

- `includePlan`: Optional boolean, if true, includes full `membershipPlan` object in response

---

## Data Model (Prisma Schema)

### MembershipPlan Model

```prisma
model MembershipPlan {
  id           String      @id @default(cuid())
  tenantId     String      // REQUIRED for tenant scoping
  name         String      // Plan name (unique per tenant)
  description  String?     // Optional description
  durationType String      // "DAYS" or "MONTHS" (enum)
  durationValue Int        // Duration value (e.g., 30, 12)
  price        Decimal     @db.Decimal(10, 2) // Price with 2 decimal places
  currency     String      // ISO 4217 currency code (e.g., "JPY")
  maxFreezeDays Int?       // Optional freeze days (null = no freeze)
  autoRenew    Boolean     @default(false)
  status       String      // "ACTIVE" or "ARCHIVED" (enum)
  sortOrder    Int?        // Optional sort order
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  members Member[] // Members using this plan

  @@unique([tenantId, name]) // Plan name unique per tenant (case-insensitive handled in application)
  @@index([tenantId])
  @@index([tenantId, status]) // For filtering active plans
  @@index([tenantId, sortOrder]) // For ordered plan lists
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

### Member Model (Modified)

```prisma
model Member {
  // ... existing fields ...
  
  // REMOVED: membershipType String
  
  // NEW: Plan reference
  membershipPlanId String // REQUIRED: Foreign key to MembershipPlan
  membershipPlan   MembershipPlan @relation(fields: [membershipPlanId], references: [id])
  
  // KEPT: Existing date fields
  membershipStartDate DateTime // Start date
  membershipEndDate    DateTime // End date (calculated from plan)
  
  // OPTIONAL: Purchase-time price
  membershipPriceAtPurchase Decimal? @db.Decimal(10, 2) // Price at purchase time
  
  // ... other existing fields ...
  
  @@index([membershipPlanId]) // For plan-member queries
  @@index([tenantId, membershipPlanId]) // For tenant-scoped plan member counts
}
```

### Migration Considerations

1. **Backward Compatibility:**
   - Existing members have `membershipType` string field
   - Migration script must:
     a. Create default plans for each unique `membershipType` value per tenant
     b. Assign members to appropriate plans based on their `membershipType`
     c. Remove `membershipType` field after migration
   - Migration should be reversible (backup `membershipType` values before removal)

2. **Data Migration Strategy:**
   - For each tenant, collect all unique `membershipType` values
   - Create a MembershipPlan for each unique value with:
     - `name` = original `membershipType` value
     - `durationType` = MONTHS (default assumption)
     - `durationValue` = 12 (default assumption, can be adjusted manually later)
     - `price` = 0 (unknown, to be set manually)
     - `currency` = tenant's `defaultCurrency` if set, otherwise "TRY" as fallback
     - `status` = ACTIVE
   - Update all Member records: set `membershipPlanId` to corresponding plan
   - Set `membershipPriceAtPurchase` = plan's current price (or null if price unknown)
   - Remove `membershipType` column in final migration step

3. **Index Strategy:**
   - `@@index([tenantId])` on MembershipPlan for tenant-scoped queries
   - `@@index([tenantId, status])` for filtering active plans efficiently
   - `@@index([tenantId, sortOrder])` for ordered plan lists
   - `@@index([membershipPlanId])` on Member for plan-member relationship queries
   - `@@index([tenantId, membershipPlanId])` for counting members per plan per tenant

4. **Migration Rollback Plan:**
   - Keep `membershipType` column as nullable during migration
   - Migration script populates `membershipType` from plan name before removing column
   - If rollback needed, restore `membershipType` from backup and remove `membershipPlanId`

---

## Frontend Specification

### User Interface

#### Screens/Views

**New Screens:**

1. **Plan List Page** (`/membership-plans`)
   - Table view of all plans for the tenant
   - Columns: Name, Duration, Price, Currency, Status, Member Count, Actions
   - Filters: Status (All/Active/Archived), Search by name
   - Actions: Create Plan, Edit Plan, Archive Plan, Restore Plan (if archived)
   - Sortable by sort order, name, price

2. **Create Plan Page** (`/membership-plans/new`)
   - Form with all plan fields
   - Duration type selector (DAYS/MONTHS) with value input
   - Price and currency inputs
   - Freeze days and auto-renew toggles
   - Form validation with Turkish error messages
   - Preview: "Membership duration: 12 months"

3. **Edit Plan Page** (`/membership-plans/:id/edit`)
   - Same form as create, pre-filled with plan data
   - Warning banner if plan has active members: "This plan has X active members. Changes to duration/price will not affect existing members."
   - Archive/Restore button in header

**Modified Screens:**

1. **Member Creation Form** (`/members/new`)
   - Replace `membershipType` dropdown with `membershipPlanId` dropdown
   - Dropdown shows only ACTIVE plans for the tenant
   - Display plan details: name, duration, price
   - Preview calculated end date: "Membership will end on: [calculated date]"
   - Optional: `membershipStartDate` date picker (defaults to today)
   - Optional: `membershipPriceAtPurchase` override (defaults to plan price)

2. **Member Detail Page** (`/members/:id`)
   - Display plan name and details (with link to plan detail)
   - Show purchase price if stored
   - Plan change: Disabled in v1 (show message: "Plan changes coming soon")

3. **Member Edit Form** (`/members/:id/edit`)
   - Plan selection: Disabled/read-only (v1 restriction)
   - Dates can be manually adjusted if needed

#### User Flows

**Flow 1: Create a New Plan**

1. Admin navigates to Plan List page
2. Clicks "Create Plan" button
3. Fills out form:
   - Plan name: "Premium 12 Months"
   - Description: "Annual premium membership"
   - Duration: Select "MONTHS", enter "12"
   - Price: "120000", Currency: "JPY"
   - Max freeze days: "30"
   - Auto-renew: Toggle ON
   - Sort order: "1"
4. Clicks "Create"
5. System validates:
   - Name uniqueness within tenant
   - Duration value > 0
   - Price >= 0
6. Plan is created with status ACTIVE
7. Admin is redirected to Plan List with success message

**Flow 2: Create Member with Plan**

1. Admin navigates to Member Creation form
2. Fills member profile fields (name, phone, etc.)
3. Selects plan from dropdown (shows only ACTIVE plans)
4. System previews: "Plan: Premium 12 Months - Ends on: 2026-01-20"
5. Optionally adjusts start date (defaults to today)
6. Clicks "Create Member"
7. System calculates `membershipEndDate` = start date + 12 months
8. Member is created with plan reference

**Flow 3: Archive a Plan**

1. Admin navigates to Plan List
2. Clicks "Archive" on a plan
3. System checks for active members:
   - If active members exist: Shows warning "This plan has X active members. Archiving will prevent new memberships but existing members will remain unaffected."
   - Admin confirms archive action
4. Plan status changes to ARCHIVED
5. Plan disappears from active plan dropdowns
6. Plan remains visible in member detail views (historical record)

**Flow 4: Edit Plan (with Active Members)**

1. Admin navigates to Edit Plan page
2. Sees warning banner: "This plan has 15 active members. Changes to duration/price will not affect existing members."
3. Updates plan price from 120000 to 150000
4. Clicks "Save"
5. Plan is updated
6. Existing members' `membershipPriceAtPurchase` remains unchanged (historical record)
7. New members created with this plan will use new price (150000)

#### Components

**New Components:**

1. **PlanSelector** (`components/membership-plans/PlanSelector.tsx`)
   - Dropdown component for selecting plans
   - Props: `tenantId`, `status` (default: "ACTIVE"), `onSelect`, `selectedPlanId`
   - Fetches active plans via API
   - Displays: Plan name, duration preview, price
   - Uses shadcn/ui Select component

2. **PlanCard** (`components/membership-plans/PlanCard.tsx`)
   - Card component displaying plan details
   - Shows: Name, duration, price, status badge
   - Actions: Edit, Archive/Restore
   - Used in Plan List page

3. **PlanForm** (`components/membership-plans/PlanForm.tsx`)
   - Reusable form for create/edit
   - Fields: name, description, duration type/value, price, currency, freeze days, auto-renew, sort order
   - Validation with Turkish error messages
   - Used in Create/Edit Plan pages

4. **DurationPreview** (`components/membership-plans/DurationPreview.tsx`)
   - Displays calculated end date preview
   - Props: `startDate`, `durationType`, `durationValue`
   - Shows: "Membership will end on: [date]" or "Duration: 12 months"

5. **PlanStatusBadge** (`components/membership-plans/PlanStatusBadge.tsx`)
   - Badge component for ACTIVE/ARCHIVED status
   - Color coding: ACTIVE = green, ARCHIVED = gray

**Modified Components:**

1. **MemberForm** (`components/members/MemberForm.tsx`)
   - Replace `MembershipTypeSelector` with `PlanSelector`
   - Add `DurationPreview` component
   - Add optional `membershipStartDate` date picker
   - Remove `membershipEndDate` input (calculated automatically)

### State Management

**API Client:**

- `api/membership-plans.ts`: Plan CRUD operations
- Methods: `listPlans()`, `getActivePlans()`, `getPlan()`, `createPlan()`, `updatePlan()`, `archivePlan()`, `restorePlan()`, `deletePlan()`

**React Query Hooks:**

- `useMembershipPlans()`: List plans with filters
- `useActivePlans()`: Get active plans for dropdowns
- `useMembershipPlan(id)`: Get single plan
- `useCreatePlan()`, `useUpdatePlan()`, `useArchivePlan()`: Mutations

**State Considerations:**

- Plan list should be cached (React Query default: 5 minutes)
- Active plans list should be cached longer (used in multiple forms)
- Plan updates should invalidate member queries (if member includes plan data)
- Optimistic updates for plan status changes (archive/restore)

### Performance Considerations

- **Plan List:** Pagination for tenants with many plans (> 50)
- **Active Plans Dropdown:** No pagination (typically < 50 plans), cache aggressively
- **Member Creation:** Pre-fetch active plans on form load
- **Loading States:** Skeleton loaders for plan list, spinner for dropdowns
- **Optimistic Updates:** Archive/restore operations update UI immediately

---

## Security & Tenant Isolation

### Tenant Scoping

**Database Queries:**

- All MembershipPlan queries MUST include `WHERE tenantId = :tenantId` filter
- Plan lookups for members MUST validate `plan.tenantId = member.tenantId`
- Plan creation MUST set `tenantId` from authenticated user's JWT claim
- Plan updates/deletes MUST verify plan belongs to user's tenant

**API Endpoints:**

- All plan endpoints extract `tenantId` from JWT token
- Plan IDs are validated against tenant before any operation
- Cross-tenant plan access returns 403 Forbidden
- Member-plan assignment validates plan belongs to member's tenant

**UI State:**

- Plan lists are filtered by authenticated user's tenant
- Plan dropdowns only show plans for current tenant
- Plan selection in member forms validates tenant match

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

---

## Testing Requirements

### Unit Tests

Critical domain logic that MUST have unit tests:

- [ ] Membership end date calculation for DAYS duration type
- [ ] Membership end date calculation for MONTHS duration type (handles month length variations)
- [ ] Plan name uniqueness validation within tenant (case-insensitive)
- [ ] Plan archival protection (cannot delete plan with members)
- [ ] Plan status transition validation (ACTIVE ↔ ARCHIVED)
- [ ] Duration value validation (> 0, strict ranges: DAYS 1-730, MONTHS 1-24)
- [ ] Duration value validation: Reject DAYS > 730 with error message
- [ ] Duration value validation: Reject MONTHS > 24 with error message
- [ ] Price validation (>= 0, decimal precision)

### Integration Tests

API endpoints and flows that MUST have integration tests:

- [ ] GET /api/v1/membership-plans - List plans with tenant isolation
- [ ] GET /api/v1/membership-plans/active - Return only ACTIVE plans
- [ ] GET /api/v1/membership-plans/:id - Get plan with tenant validation
- [ ] POST /api/v1/membership-plans - Create plan with validation
- [ ] POST /api/v1/membership-plans - Duplicate plan name returns 400
- [ ] PATCH /api/v1/membership-plans/:id - Update plan (existing members unaffected)
- [ ] POST /api/v1/membership-plans/:id/archive - Archive plan with active members warning
- [ ] DELETE /api/v1/membership-plans/:id - Cannot delete plan with members
- [ ] POST /api/v1/members - Create member with plan (end date calculated correctly)
- [ ] Tenant isolation: Plan from Tenant A not accessible to Tenant B (403)
- [ ] Cross-tenant plan assignment returns 403

### Edge Cases

Known edge cases to test:

- [ ] Plan with zero price (promotional plan)
- [ ] Plan duration calculation: 1 month from Jan 31 → Feb 28/29 (leap year, clamped to last day)
- [ ] Plan duration calculation: 1 month from Mar 31 → Apr 30 (clamped to last day)
- [ ] Plan duration calculation: 1 month from Jan 15 → Feb 15 (day exists, no clamping)
- [ ] Plan duration calculation: 12 months spans leap year boundary
- [ ] Archive plan with 0 active members (status = ACTIVE AND membershipEndDate >= today) - should succeed without warning
- [ ] Archive plan with PAUSED members only (should succeed without warning, PAUSED members don't count)
- [ ] Archive plan with 100+ active members (should show correct count of ACTIVE members only)
- [ ] Update plan name to duplicate (should fail validation)
- [ ] Update plan duration while plan has active members (should succeed, members unaffected)
- [ ] Delete plan with archived members only (should succeed if no active members)
- [ ] Member creation with past start date (should calculate end date correctly)
- [ ] Member creation with future start date (should calculate end date correctly)
- [ ] Plan sort order: Multiple plans with same sortOrder (secondary sort by createdAt)

---

## Performance & Scalability

### Expected Load

- **Typical Usage:** 10-50 plans per tenant (small to medium gyms)
- **Large Tenants:** Up to 100 plans per tenant (enterprise gyms with many package types)
- **Plan Queries:** Frequent (every member creation form load)
- **Plan Updates:** Infrequent (monthly or quarterly pricing/duration adjustments)
- **Member-Plan Joins:** Very frequent (every member detail page load)

### Database Indexes

Required indexes for performance:

- [ ] `@@index([tenantId])` on MembershipPlan: Tenant-scoped plan queries
- [ ] `@@index([tenantId, status])` on MembershipPlan: Filter active plans efficiently
- [ ] `@@index([tenantId, sortOrder])` on MembershipPlan: Ordered plan lists
- [ ] `@@unique([tenantId, name])` on MembershipPlan: Enforce name uniqueness
- [ ] `@@index([membershipPlanId])` on Member: Plan-member relationship queries
- [ ] `@@index([tenantId, membershipPlanId])` on Member: Count members per plan per tenant

### Query Optimization

**N+1 Query Concerns:**

- Member list with plan details: Use Prisma `include` to eager-load plans
- Plan list with member counts: Use aggregation query (`_count` relation) instead of separate queries
- Active plans dropdown: Cache query results (React Query default caching)

**Efficient Loading:**

- Plan lists: Use pagination for tenants with > 50 plans
- Active plans: Load all at once (typically < 50, cache aggressively)
- Member-plan joins: Always use `include: { membershipPlan: true }` to avoid N+1

---

## Implementation Checklist

### Backend

- [ ] MembershipPlan domain entity created
- [ ] Member model updated (remove `membershipType`, add `membershipPlanId`, add `membershipPriceAtPurchase`)
- [ ] Prisma schema updated with MembershipPlan model and Member modifications
- [ ] Migration created for MembershipPlan table
- [ ] Migration created for Member model changes (with data migration script)
- [ ] Data migration script: Create default plans from existing `membershipType` values
- [ ] Service layer implemented (PlansService with CRUD operations)
- [ ] Duration calculation utility functions (DAYS and MONTHS)
- [ ] Controllers implemented (HTTP only, no business logic)
- [ ] Validation DTOs created (CreatePlanDto, UpdatePlanDto)
- [ ] Plan archival protection logic (check for active members)
- [ ] Member creation updated to use plan selection and calculate end date
- [ ] Unit tests written (duration calculation, validation, business rules)
- [ ] Integration tests written (API endpoints, tenant isolation, edge cases)

### Frontend

- [ ] Shared TypeScript types updated (MembershipPlan, DurationType, PlanStatus)
- [ ] API client methods created (`api/membership-plans.ts`)
- [ ] React Query hooks created (useMembershipPlans, useActivePlans, mutations)
- [ ] Plan List page implemented (`/membership-plans`)
- [ ] Create Plan page implemented (`/membership-plans/new`)
- [ ] Edit Plan page implemented (`/membership-plans/:id/edit`)
- [ ] PlanSelector component implemented (dropdown for plan selection)
- [ ] PlanCard component implemented (plan display card)
- [ ] PlanForm component implemented (reusable create/edit form)
- [ ] DurationPreview component implemented (end date calculation preview)
- [ ] PlanStatusBadge component implemented (status display)
- [ ] MemberForm updated (replace membershipType with plan selection)
- [ ] MemberDetail page updated (display plan information)
- [ ] Loading/error states handled (skeletons, error messages)
- [ ] Responsive design verified (mobile-friendly forms and tables)
- [ ] Accessibility checked (keyboard nav, ARIA labels, focus states)

### Documentation

- [ ] API documentation updated (OpenAPI/Swagger spec)
- [ ] Migration guide written (how to migrate existing members)
- [ ] README updated with plan management instructions
- [ ] Inline code comments for complex logic (duration calculation, archival protection)

---

## Open Questions

None at this time. All requirements are clear from the feature description.

---

## Future Enhancements

Features or improvements intentionally deferred:

1. **Plan Change Workflow for Existing Members:**
   - Why deferred: Requires complex business logic (prorating, refunds, date adjustments)
   - Future: Explicit feature spec for "Member Plan Upgrades/Downgrades"

2. **Advanced Freeze Logic Implementation:**
   - Why deferred: We store `maxFreezeDays` but do not implement freeze workflows
   - Future: Freeze request/approval workflow, automatic membership extension

3. **Auto-Renewal Job Implementation:**
   - Why deferred: Requires background job system and payment processing
   - Future: Cron job to check `autoRenew=true` plans and extend memberships

4. **Branch-Level Plan Definitions:**
   - Why deferred: Adds complexity; tenant-level plans sufficient for v1
   - Future: Allow different plans per branch (e.g., premium branch has exclusive plans)

5. **Billing Integration:**
   - Why deferred: Requires payment gateway integration (Stripe, PayPal, etc.)
   - Future: Charge members based on plan price, handle recurring payments

6. **Revenue Reporting per Plan:**
   - Why deferred: Requires aggregation queries and dashboard UI
   - Future: Analytics module showing revenue by plan, member acquisition by plan

7. **Plan Templates:**
   - Why deferred: Not needed for v1; admins can create plans manually
   - Future: Pre-defined plan templates (e.g., "Basic", "Standard", "Premium" templates)

8. **Plan Copying Between Tenants:**
   - Why deferred: Not a common use case; each tenant defines their own plans
   - Future: Allow super-admin to copy plans between tenants (enterprise feature)

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
