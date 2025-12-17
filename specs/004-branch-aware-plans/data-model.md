# Data Model: Branch-Aware Membership Plans

**Version:** 1.0.0  
**Date:** 2025-01-27  
**Status:** Design Complete

---

## Overview

This document defines the data model for Branch-Aware Membership Plans, including entities, relationships, validation rules, and state transitions. This feature extends the existing MembershipPlan model to support both tenant-scoped (TENANT) and branch-scoped (BRANCH) plans.

---

## Entity: MembershipPlan (Modified)

### Purpose
Represents a membership plan that can be defined either globally for a tenant (TENANT scope) or specifically for a single branch (BRANCH scope). Plans define pricing, duration, and terms for gym memberships.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | String (CUID) | PRIMARY KEY | Unique identifier |
| `tenantId` | String (CUID) | FOREIGN KEY, NOT NULL | Reference to tenant (required for tenant isolation) |
| `scope` | PlanScope enum | NOT NULL, DEFAULT TENANT | Plan scope: TENANT or BRANCH |
| `branchId` | String (CUID) | FOREIGN KEY, NULLABLE | Reference to branch (required if scope=BRANCH, null if scope=TENANT) |
| `scopeKey` | String | NOT NULL | Computed: "TENANT" for TENANT scope, branchId for BRANCH scope |
| `name` | String | NOT NULL, 1-100 chars | Plan name, unique per tenant (TENANT scope) or per branch (BRANCH scope) |
| `description` | String | NULLABLE, max 1000 chars | Optional plan description |
| `durationType` | DurationType enum | NOT NULL | Duration unit: DAYS or MONTHS |
| `durationValue` | Integer | NOT NULL, > 0 | Duration value (1-730 for DAYS, 1-24 for MONTHS) |
| `price` | Decimal(10,2) | NOT NULL, >= 0 | Plan price |
| `currency` | String | NOT NULL, ISO 4217 | Currency code (3 uppercase letters) |
| `maxFreezeDays` | Integer | NULLABLE, >= 0 | Maximum freeze days allowed (null = no freeze) |
| `autoRenew` | Boolean | NOT NULL, DEFAULT false | Auto-renewal flag |
| `status` | PlanStatus enum | NOT NULL, DEFAULT ACTIVE | Plan status: ACTIVE or ARCHIVED |
| `sortOrder` | Integer | NULLABLE | Display order (lower numbers appear first) |
| `createdAt` | DateTime | NOT NULL, AUTO | Timestamp of plan creation |
| `updatedAt` | DateTime | NOT NULL, AUTO | Timestamp of last update |

### Enums

**PlanScope:**
- `TENANT`: Plan applies to all branches within the tenant
- `BRANCH`: Plan applies only to the specific branch referenced by `branchId`

**DurationType:**
- `DAYS`: Duration measured in days (1-730 days)
- `MONTHS`: Duration measured in months (1-24 months)

**PlanStatus:**
- `ACTIVE`: Plan is available for selection by new members
- `ARCHIVED`: Plan is no longer available for new members (historical record)

### Validation Rules

**scope:**
- Required field, must be either "TENANT" or "BRANCH"
- Immutable after plan creation (cannot change scope)
- Default value: "TENANT" (for backward compatibility)

**branchId:**
- Required if `scope = BRANCH`, must be null if `scope = TENANT`
- Must reference an existing Branch
- Branch must belong to the same tenant as the plan
- Branch must be active (`isActive = true`) when creating BRANCH-scoped plan
- Immutable after plan creation (cannot change branchId)
- Foreign key constraint: `ON DELETE RESTRICT` (prevents deleting branch with plans)

**scopeKey:**
- Required, computed column
- For TENANT scope: `scopeKey = "TENANT"` (constant string)
- For BRANCH scope: `scopeKey = branchId` (actual branch ID)
- Used in database unique constraint: `@@unique([tenantId, scope, scopeKey, name])`
- Ensures database-level uniqueness enforcement for both scopes

**name:**
- Required, 1-100 characters (trimmed)
- Uniqueness rules:
  - **TENANT scope:** Must be unique within tenant (case-insensitive, ACTIVE plans only)
  - **BRANCH scope:** Must be unique within branch (case-insensitive, ACTIVE plans only)
  - Duplicate names allowed across different branches (even within same tenant)
  - Duplicate names allowed between TENANT and BRANCH scopes (same tenant can have "Premium" as both TENANT and BRANCH plan)
  - Archived plans do not count toward uniqueness constraints
  - **Database constraint:** `@@unique([tenantId, scope, scopeKey, name])` provides database-level enforcement
  - **Application validation:** Case-insensitive comparison and ACTIVE-only checks

**description:**
- Optional, max 1000 characters (trimmed)

**durationType:**
- Required, must be either "DAYS" or "MONTHS"
- Immutable after plan creation (business rule: changing duration doesn't affect existing members)

**durationValue:**
- Required, must be integer > 0
- Range validation:
  - DAYS: 1-730 (inclusive) - maximum 2 years
  - MONTHS: 1-24 (inclusive) - maximum 2 years
- Immutable after plan creation (business rule: changing duration doesn't affect existing members)

**price:**
- Required, must be >= 0 (zero-price plans allowed for promotional purposes)
- Decimal precision: 10 digits, 2 decimal places
- Currency-specific (no conversion logic)

**currency:**
- Required, must be valid ISO 4217 currency code
- Format: 3 uppercase letters (e.g., "USD", "EUR", "JPY")
- Stored as-is, no currency conversion

**maxFreezeDays:**
- Optional, integer >= 0 if provided
- null means no freeze allowed
- Typical values: 0, 7, 30

**autoRenew:**
- Required, boolean
- Default: false
- Indicates if membership should auto-renew at end date

**status:**
- Required, enum: ACTIVE or ARCHIVED
- Default: ACTIVE
- ACTIVE: Plan available for selection by new members
- ARCHIVED: Plan no longer available for new members (soft delete)

**sortOrder:**
- Optional, integer (can be negative)
- Lower numbers appear first in UI
- Used for display ordering in plan selection dropdowns

### Relationships

```
Tenant (1) ──< (many) MembershipPlan
Branch (1) ──< (many) MembershipPlan (when scope is BRANCH)
MembershipPlan (1) ──< (many) Member
```

- A MembershipPlan MUST belong to exactly one Tenant (via `tenantId`)
- A MembershipPlan with BRANCH scope MUST reference exactly one Branch (via `branchId`)
- A MembershipPlan with TENANT scope MUST have `branchId = null`
- A Member MUST reference exactly one MembershipPlan (via `membershipPlanId`)
- A Member's plan is implicitly scoped to their tenant, and BRANCH-scoped plans are further scoped to their branch

### Indexes

**Performance Indexes:**
- `PRIMARY KEY (id)`
- `INDEX (tenantId)` - Tenant-scoped queries
- `INDEX (tenantId, scope)` - Filter plans by scope
- `INDEX (tenantId, scope, status)` - Filter active plans by scope
- `INDEX (tenantId, branchId)` - Filter BRANCH-scoped plans by branch
- `INDEX (branchId)` - Branch-scoped plan queries
- `INDEX (tenantId, status)` - Filter active plans
- `INDEX (tenantId, sortOrder)` - Ordered plan lists

**Uniqueness Constraints:**
- `UNIQUE (tenantId, scope, scopeKey, name)` - Enforces uniqueness for both scopes
  - **TENANT scope:** Enforced by `(tenantId, scope="TENANT", scopeKey="TENANT", name)`
  - **BRANCH scope:** Enforced by `(tenantId, scope="BRANCH", scopeKey=branchId, name)`
  - Database-level enforcement prevents race conditions
  - Application-level validation enforces case-insensitive comparison and ACTIVE-only checks

### State Transitions

**Plan Creation:**
1. Plan created with `status = ACTIVE`
2. Scope and branchId are set and cannot be changed
3. Name uniqueness validated (case-insensitive, ACTIVE only)

**Plan Update:**
- Can update: name, description, price, currency, maxFreezeDays, autoRenew, sortOrder
- Cannot update: scope, branchId, durationType, durationValue (immutable fields)
- Name uniqueness re-validated if name changes

**Plan Archival:**
1. `status` changes from ACTIVE → ARCHIVED
2. Plan no longer appears in plan selection dropdowns
3. Existing members with this plan remain unaffected
4. Archived plans do not count toward uniqueness constraints

**Plan Restoration:**
1. If plan is already ACTIVE, returns 400 Bad Request
2. Name uniqueness validated before restoration (must not conflict with existing ACTIVE plan in same scope context)
3. If conflict exists, restore is rejected with 400 Bad Request: "Cannot restore plan: an ACTIVE plan with the same name already exists for this scope."
4. If no conflict, `status` changes from ARCHIVED → ACTIVE
5. Plan becomes available for selection by new members

**Plan Deletion:**
- Hard delete only allowed if plan has zero members (any status)
- If members exist, plan must be archived instead

### Business Rules

1. **Scope Validation:**
   - TENANT scope requires `branchId = null`
   - BRANCH scope requires `branchId` (not null)
   - Scope is immutable after creation

2. **Branch Validation:**
   - `branchId` must reference an existing Branch
   - Branch must belong to the same tenant as the plan
   - Branch must be active when creating BRANCH-scoped plan
   - If branch is archived after plan creation, plan remains ACTIVE (historical record)

3. **Uniqueness Validation:**
   - TENANT scope: Unique per tenant (case-insensitive, ACTIVE only)
   - BRANCH scope: Unique per branch (case-insensitive, ACTIVE only)
   - Archived plans do not count toward uniqueness
   - Duplicate names allowed across scopes and branches

4. **Tenant Isolation:**
   - All plan queries MUST filter by `tenantId`
   - Plans cannot be accessed across tenant boundaries
   - Branch validation ensures branch belongs to tenant

5. **Plan Availability:**
   - TENANT-scoped plans: Available to members at any branch within the tenant
   - BRANCH-scoped plans: Available only to members at the specific branch

---

## Entity Relationships Diagram

```
┌─────────┐
│ Tenant  │
└────┬────┘
     │
     │ 1:N
     │
┌────▼──────────────────┐
│  MembershipPlan       │
│  - id                 │
│  - tenantId (FK)      │
│  - scope (TENANT|BRANCH)│
│  - branchId (FK, nullable)│
│  - name               │
│  - ...                │
└────┬──────────────────┘
     │
     │ N:1 (when scope=BRANCH)
     │
┌────▼────┐
│ Branch  │
└─────────┘

┌──────────────┐
│ MembershipPlan│
└──────┬───────┘
       │
       │ 1:N
       │
┌──────▼──────┐
│   Member    │
│   - membershipPlanId (FK)│
└─────────────┘
```

---

## Database Schema (Prisma)

```prisma
model MembershipPlan {
  id            String       @id @default(cuid())
  tenantId      String       // REQUIRED for tenant scoping
  scope         PlanScope    @default(TENANT) // TENANT or BRANCH
  branchId      String?      // REQUIRED if scope is BRANCH, null if scope is TENANT
  scopeKey      String        // Computed: "TENANT" for TENANT scope, branchId for BRANCH scope
  name          String
  description   String?
  durationType  DurationType
  durationValue Int
  price         Decimal      @db.Decimal(10, 2)
  currency      String
  maxFreezeDays Int?
  autoRenew     Boolean      @default(false)
  status        PlanStatus   @default(ACTIVE)
  sortOrder     Int?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  tenant  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch  Branch?  @relation(fields: [branchId], references: [id], onDelete: Restrict)
  members Member[]

  // Uniqueness: Database-level enforcement using scopeKey
  // scopeKey = "TENANT" for TENANT scope, scopeKey = branchId for BRANCH scope
  // This ensures uniqueness per tenant for TENANT scope and per branch for BRANCH scope
  @@unique([tenantId, scope, scopeKey, name])
  @@index([tenantId])
  @@index([tenantId, scope])
  @@index([tenantId, status])
  @@index([tenantId, branchId])
  @@index([tenantId, scope, status])
  @@index([branchId])
  @@index([tenantId, sortOrder])
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

---

## Migration Notes

### Existing Plans Migration
- All existing plans are migrated to `scope = TENANT`
- All existing plans have `branchId = null` (already the case)
- All existing plans have `scopeKey = "TENANT"` (computed)
- Existing unique constraint `@@unique([tenantId, name])` is removed
- New constraint `@@unique([tenantId, scope, scopeKey, name])` is added

### Backward Compatibility
- Migration is backward compatible (adds nullable columns with defaults)
- Existing functionality remains intact
- No data loss or transformation required

---

**End of Data Model**

