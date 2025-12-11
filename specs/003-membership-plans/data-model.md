# Data Model: Membership Plan Management

**Version:** 1.0.0  
**Date:** 2025-01-20  
**Feature:** 003-membership-plans

---

## Overview

This document defines the data model for the Membership Plan Management feature, including entities, relationships, validation rules, and state transitions.

---

## Entities

### MembershipPlan

**Purpose:** Represents a membership package definition owned by a tenant. Each plan defines duration, pricing, and optional rules (freeze days, auto-renewal) for memberships.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String (CUID) | Yes | Primary key |
| `tenantId` | String (CUID) | Yes | Foreign key to Tenant (tenant ownership) |
| `name` | String | Yes | Plan name, unique per tenant (e.g., "Basic 1 Month", "Premium 12 Months") |
| `description` | String? | No | Optional longer text description for UI display |
| `durationType` | DurationType | Yes | Enum: "DAYS" or "MONTHS" |
| `durationValue` | Integer | Yes | Duration value (e.g., 30 for 30 days, or 12 for 12 months) |
| `price` | Decimal(10,2) | Yes | Price >= 0 (e.g., 5000.00 for JPY) |
| `currency` | String | Yes | ISO 4217 currency code (e.g., "JPY", "USD", "EUR") |
| `maxFreezeDays` | Integer? | No | Maximum freeze days allowed (0, 7, 30, etc.), null means no freeze allowed |
| `autoRenew` | Boolean | Yes | Default false, indicates if membership should auto-renew |
| `status` | PlanStatus | Yes | Enum: "ACTIVE" or "ARCHIVED" |
| `sortOrder` | Integer? | No | Integer for UI display ordering (lower numbers appear first) |
| `createdAt` | DateTime | Yes | Timestamp of plan creation |
| `updatedAt` | DateTime | Yes | Timestamp of last update |

**Validation Rules:**

1. **Name:**
   - Required, 1-100 characters
   - Trim whitespace
   - Must be unique within tenant (case-insensitive)
   - Validation occurs on create and update operations

2. **Description:**
   - Optional, max 1000 characters

3. **Duration Type:**
   - Required, must be "DAYS" or "MONTHS" (case-sensitive enum)

4. **Duration Value:**
   - Required, must be integer > 0
   - **Strict range enforcement:**
     - For DAYS: Must be between 1 and 730 (inclusive) - maximum 2 years
     - For MONTHS: Must be between 1 and 24 (inclusive) - maximum 2 years
   - Values outside these ranges are rejected with error message: "Duration value must be between 1 and [max] [DAYS/MONTHS]"

5. **Price:**
   - Required, must be number >= 0 (zero-price plans allowed for promotional purposes)
   - Max 2 decimal places

6. **Currency:**
   - Required, must be valid ISO 4217 currency code (3 uppercase letters, e.g., "JPY", "USD", "EUR")
   - Regex: `/^[A-Z]{3}$/`

7. **Max Freeze Days:**
   - Optional, must be integer >= 0 if provided
   - null means no freeze allowed

8. **Auto Renew:**
   - Required, defaults to false if not provided

9. **Status:**
   - Required, must be "ACTIVE" or "ARCHIVED"
   - New plans are created with status ACTIVE

10. **Sort Order:**
    - Optional, integer (can be negative)
    - If not provided, plans are ordered by `createdAt` (oldest first)
    - Lower values appear first in UI lists
    - Multiple plans can have the same `sortOrder` (secondary sort by `createdAt`)

**Indexes:**
- `@@index([tenantId])` - Tenant-scoped plan queries
- `@@index([tenantId, status])` - Filter active plans efficiently
- `@@index([tenantId, sortOrder])` - Ordered plan lists
- `@@unique([tenantId, name])` - Enforce name uniqueness per tenant (case-insensitive handled in application)

**Relationships:**
- `tenant`: Many-to-One with Tenant (CASCADE delete)
- `members`: One-to-Many with Member

---

### Member (Modified)

**Purpose:** Member entity updated to reference MembershipPlan instead of string-based `membershipType`.

**Fields Changed:**

| Field | Type | Required | Change |
|-------|------|----------|--------|
| `membershipType` | String | - | **REMOVED** |
| `membershipPlanId` | String (CUID) | Yes | **ADDED** - Foreign key to MembershipPlan |
| `membershipPriceAtPurchase` | Decimal(10,2)? | No | **ADDED** - Optional price at purchase time |

**Fields Kept:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `membershipStartDate` | DateTime | Yes | Start date of membership |
| `membershipEndDate` | DateTime | Yes | End date of membership (calculated from plan duration) |

**Validation Rules:**

1. **Membership Plan ID:**
   - Required, must be valid CUID
   - Must belong to authenticated user's tenant
   - Must be ACTIVE (for new members)
   - Plan assignment is immutable after member creation (v1 restriction)

2. **Membership Start Date:**
   - Required, must be valid date
   - Defaults to today if not provided

3. **Membership End Date:**
   - Required, must be valid date
   - Calculated automatically from `membershipStartDate` + plan duration
   - Must be after `membershipStartDate`
   - Not accepted in create request (calculated automatically)

4. **Membership Price at Purchase:**
   - Optional, if provided defaults to plan's current `price`
   - Used for historical reporting (preserves purchase-time pricing)

**Indexes:**
- `@@index([membershipPlanId])` - Plan-member relationship queries
- `@@index([tenantId, membershipPlanId])` - Count members per plan per tenant

**Relationships:**
- `membershipPlan`: Many-to-One with MembershipPlan (via `membershipPlanId`)

---

## Enums

### DurationType

```typescript
enum DurationType {
  DAYS = "DAYS",
  MONTHS = "MONTHS"
}
```

**Usage:**
- `DAYS`: Duration specified in days (e.g., 30, 90, 365)
- `MONTHS`: Duration specified in months (e.g., 1, 3, 12)

### PlanStatus

```typescript
enum PlanStatus {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED"
}
```

**Status Semantics:**
- **ACTIVE:** Plan is available for selection when creating new members. Active plans appear in dropdown menus and can be assigned to members.
- **ARCHIVED:** Plan is no longer available for new memberships but remains visible in historical member records. Archived plans do not appear in plan selection dropdowns for new members. Plans with active members cannot be deleted; they must be archived instead.

---

## Relationships

```
Tenant (1) ──< (many) MembershipPlan
MembershipPlan (1) ──< (many) Member
Tenant (1) ──< (many) Member (existing)
Branch (1) ──< (many) Member (existing)
```

**Relationship Rules:**

1. **Tenant → MembershipPlan:**
   - A MembershipPlan MUST belong to exactly one Tenant
   - Foreign key: `tenantId` on MembershipPlan
   - CASCADE delete: If tenant is deleted, all plans are deleted

2. **MembershipPlan → Member:**
   - A Member MUST reference exactly one MembershipPlan (via `membershipPlanId`)
   - Foreign key: `membershipPlanId` on Member
   - Plan reference is immutable after member creation (v1 restriction)

3. **Tenant → Member:**
   - A Member MUST belong to exactly one Tenant (existing relationship)
   - Therefore, a Member's plan is implicitly scoped to their tenant

4. **Branch → Member:**
   - A Member MUST belong to exactly one Branch (existing relationship)

---

## Business Rules

### 1. Tenant Isolation (CRITICAL)

- All plan queries MUST filter by `tenantId` automatically
- Plans cannot be accessed across tenant boundaries
- Member-plan relationships are validated to ensure plan belongs to member's tenant
- Attempting to assign a plan from a different tenant returns 403 Forbidden

### 2. Plan Name Uniqueness

- Plan names MUST be unique within a tenant (case-insensitive)
- Plan names MAY be duplicated across different tenants
- Validation occurs on create and update operations

### 3. Plan Duration Validation

- `durationValue` MUST be greater than 0
- `durationType` MUST be either DAYS or MONTHS
- **Strict range enforcement:**
  - For DAYS: `durationValue` MUST be between 1 and 730 (inclusive) - maximum 2 years
  - For MONTHS: `durationValue` MUST be between 1 and 24 (inclusive) - maximum 2 years
- Values outside these ranges are rejected with clear error message

### 4. Plan Price Validation

- `price` MUST be >= 0 (zero-price plans allowed for promotional purposes)
- `currency` MUST be a valid ISO 4217 currency code
- Currency is stored as-is; no currency conversion logic in v1

### 5. Plan Archival Protection

- Plans with active members CANNOT be deleted (hard delete)
- Plans with active members CAN be archived (status → ARCHIVED)
- **Active member definition:** Members with `status = ACTIVE` AND `membershipEndDate >= today` (members currently using the gym)
- PAUSED, INACTIVE, or ARCHIVED members do NOT count toward active member count for archival protection
- Archived plans do not appear in plan selection dropdowns for new members
- Archived plans remain visible in member detail views and historical records
- When archiving a plan, system checks for active members and warns if any exist (but allows archival)

### 6. Member-Plan Assignment

- When creating a member, user MUST select a plan (from ACTIVE plans only)
- User can optionally set custom `membershipStartDate` (defaults to today)
- System automatically calculates `membershipEndDate` = `membershipStartDate` + plan duration
- Plan assignment is immutable after member creation (v1 restriction: cannot change plan for existing member)
- If plan is archived after member creation, member's plan reference remains valid (historical record)

### 7. Membership End Date Calculation

- For DAYS: `membershipEndDate` = `membershipStartDate` + `durationValue` days
- For MONTHS: `membershipEndDate` = `membershipStartDate` + `durationValue` months, clamping to last day of target month if day doesn't exist
  - Example: Jan 31 + 1 month = Feb 28/29 (leap year dependent)
  - Example: Mar 31 + 1 month = Apr 30
  - Example: Jan 15 + 1 month = Feb 15 (day exists, no clamping needed)
- Calculation uses `date-fns` `addMonths` function for reliable month-end clamping
- Once calculated and stored, dates are source of truth; plan duration changes do not affect existing members

### 8. Plan Status Transitions

- New plans are created with status ACTIVE
- ACTIVE → ARCHIVED: Allowed at any time (with warning if active members exist)
- ARCHIVED → ACTIVE: Allowed (restore functionality)
- ACTIVE → DELETED: Not allowed if plan has any members (must archive first)
- ARCHIVED → DELETED: Not allowed if plan has any members (historical records must be preserved)

### 9. Sort Order

- `sortOrder` is optional; if not provided, plans are ordered by `createdAt` (oldest first)
- Lower `sortOrder` values appear first in UI lists
- `sortOrder` can be negative (e.g., -1, 0, 1, 2...)
- Multiple plans can have the same `sortOrder` (secondary sort by `createdAt`)

---

## State Transitions

### Plan Status Transitions

```
[New Plan] → ACTIVE
ACTIVE → ARCHIVED (allowed, with warning if active members)
ARCHIVED → ACTIVE (restore)
ACTIVE → DELETED (only if no members)
ARCHIVED → DELETED (only if no members)
```

**Transition Rules:**
- ACTIVE → ARCHIVED: Check for active members, warn but allow
- ARCHIVED → ACTIVE: No restrictions
- Any status → DELETED: Only allowed if plan has zero members (all statuses)

---

## Prisma Schema

### MembershipPlan Model

```prisma
model MembershipPlan {
  id           String      @id @default(cuid())
  tenantId     String
  name         String
  description  String?
  durationType String      // "DAYS" or "MONTHS" (enum)
  durationValue Int
  price        Decimal     @db.Decimal(10, 2)
  currency     String      // ISO 4217 currency code
  maxFreezeDays Int?
  autoRenew    Boolean     @default(false)
  status       String      // "ACTIVE" or "ARCHIVED" (enum)
  sortOrder    Int?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  members Member[]

  @@unique([tenantId, name]) // Plan name unique per tenant (case-insensitive handled in application)
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, sortOrder])
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

---

## Migration Considerations

### Backward Compatibility

- Existing members have `membershipType` string field
- Migration script must:
  a. Create default plans for each unique `membershipType` value per tenant
  b. Assign members to appropriate plans based on their `membershipType`
  c. Remove `membershipType` field after migration
- Migration should be reversible (backup `membershipType` values before removal)

### Data Migration Strategy

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

### Index Strategy

- `@@index([tenantId])` on MembershipPlan for tenant-scoped queries
- `@@index([tenantId, status])` for filtering active plans efficiently
- `@@index([tenantId, sortOrder])` for ordered plan lists
- `@@index([membershipPlanId])` on Member for plan-member relationship queries
- `@@index([tenantId, membershipPlanId])` for counting members per plan per tenant

### Migration Rollback Plan

- Keep `membershipType` column as nullable during migration
- Migration script populates `membershipType` from plan name before removing column
- If rollback needed, restore `membershipType` from backup and remove `membershipPlanId`

---

**End of Data Model**

