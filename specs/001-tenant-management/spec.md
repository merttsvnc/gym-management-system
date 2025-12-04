# Feature Specification: Tenant Management

**Version:** 1.0.0  
**Author:** System Architect  
**Date:** 2025-12-04  
**Status:** Draft

---

## Overview

### Purpose

The Tenant Management module establishes the foundational multi-tenant architecture for the Gym Management System. It defines how gym businesses (Tenants) and their physical locations (Branches) are represented, managed, and isolated within the SaaS platform. This module ensures that each gym's data remains completely separate and that administrative users can only access their own tenant's information.

This is a core infrastructure feature that all other modules will depend on for tenant isolation and organizational structure.

### Scope

**What IS included:**

- Tenant entity representing a gym business account
- Branch entity representing physical gym locations
- CRUD operations for tenant settings (read and update only - creation handled elsewhere)
- Full CRUD operations for branches within a tenant
- Tenant isolation enforcement at database, application, and API levels
- Single-branch and multi-branch gym support with transparent handling
- Current tenant and branch context for logged-in ADMIN users
- Soft-delete/archive capability for branches
- Pagination for branch listings

**What is NOT included:**

- Tenant onboarding and initial creation (handled in separate Onboarding spec)
- ADMIN user creation and invitation workflow (handled in separate User Management spec)
- Subscription and billing management (referenced but not implemented)
- Role-based access control beyond ADMIN (designed to accommodate, not implemented)
- Branch-specific permissions or access controls (future enhancement)
- Tenant deactivation or deletion (future administrative feature)
- Multi-currency support implementation (structure included, logic deferred)

### Constitution Alignment

This feature aligns with multiple constitutional principles:

- **Principle 6 (Multi-Tenant SaaS):** Implements strict tenant isolation at all layers
- **Principle 1 (Long-Term Maintainability):** Establishes clean foundational architecture for future modules
- **Principle 3 (Explicit Domain Rules):** Defines clear tenant-branch relationships and scoping rules
- **Principle 5 (Modular Architecture):** Creates reusable tenant context pattern for all future features
- **Principle 9 (Performance & Scalability):** Implements proper indexing and pagination for multi-tenant queries

---

## Domain Model

### Core Concepts

**What is a Tenant?**
A Tenant represents a single gym business account within the SaaS platform. Each tenant is a completely isolated entity with its own data, users, members, subscriptions, and configuration. Tenants cannot see or access data from other tenants under any circumstances.

**What is a Branch?**
A Branch represents a physical gym location belonging to a Tenant. A gym business may operate one or multiple locations. Each branch has its own address and operational context, but shares the tenant's overall configuration and administrative users.

**How does an ADMIN interact with tenant-level and branch-level data?**
ADMIN users are associated with a single tenant and can access all data within that tenant. They can:

- View and update their tenant's settings
- Create, read, update, and archive branches within their tenant
- Access tenant-wide reporting and analytics (future)
- Manage users, members, and subscriptions across all branches (handled in other modules)

**Assumption about Onboarding:**
This spec assumes that a separate Onboarding module will handle the initial creation of tenants and the first ADMIN user. By the time this module is invoked, a valid tenant exists with at least one authenticated ADMIN user.

### Entities

#### Tenant

```typescript
interface Tenant {
  id: string; // CUID primary key
  name: string; // Gym business name (e.g., "FitLife Gyms")
  slug: string; // URL-friendly identifier (e.g., "fitlife-gyms")
  defaultCurrency: string; // ISO 4217 code (e.g., "USD", "EUR") - for future use
  createdAt: Date; // Timestamp of tenant creation
  updatedAt: Date; // Timestamp of last update

  // Future fields (mentioned, not implemented):
  // subscriptionTier: string    // Free, Pro, Enterprise
  // billingEmail: string        // Email for invoices
  // subscriptionExpiresAt: Date // Subscription end date
}
```

#### Branch

```typescript
interface Branch {
  id: string; // CUID primary key
  tenantId: string; // Foreign key to Tenant (REQUIRED)
  name: string; // Branch name (e.g., "Downtown Location", "Main Branch")
  address: string; // Physical address
  isDefault: boolean; // True for the default branch (exactly one per tenant)
  isActive: boolean; // False if archived/soft-deleted
  createdAt: Date; // Timestamp of branch creation
  updatedAt: Date; // Timestamp of last update
  archivedAt: Date | null; // Timestamp of archival (null if active)
}
```

### Relationships

```
Tenant (1) ──< (many) Branch
Tenant (1) ──< (many) User (ADMIN, future roles)
Branch (1) ──< (many) Member (future module)
Branch (1) ──< (many) CheckIn (future module)
```

- A Tenant MUST have at least one Branch
- A Tenant CAN have multiple Branches
- A Branch MUST belong to exactly one Tenant
- A User (ADMIN) belongs to exactly one Tenant and can access all branches
- The first branch created for a tenant is automatically marked as the default branch

### Business Rules

1. **Tenant Isolation (CRITICAL):**

   - All queries MUST filter by `tenantId` automatically
   - No API endpoint or database query may cross tenant boundaries
   - JWT tokens MUST include `tenantId` to establish tenant context
   - Attempting to access data from another tenant results in 403 Forbidden

2. **Minimum Branch Requirement:**

   - Every tenant MUST have at least one active branch at all times
   - When a tenant is created, a default branch (named "Main Branch") is automatically created
   - The last active branch of a tenant cannot be archived

3. **Default Branch:**

   - Exactly one branch per tenant MUST be marked as `isDefault = true`
   - When the default branch is archived, another active branch must be promoted to default
   - Single-branch gyms transparently use their default branch for all operations

4. **Branch Uniqueness:**

   - Branch names MUST be unique within a tenant (case-insensitive)
   - Branch names MAY be duplicated across different tenants

5. **Branch Archival:**

   - Archiving a branch sets `isActive = false` and `archivedAt = NOW()`
   - Archived branches are excluded from standard listings (unless explicitly requested)
   - Archived branches cannot be used for new operations (member registration, check-ins)
   - Archived branches can be restored (sets `isActive = true`, `archivedAt = null`)
   - Historical data (members, check-ins) associated with archived branches remains intact

6. **Tenant Settings:**
   - Only ADMIN users can update tenant settings
   - Tenant name and slug changes must be validated for conflicts (future consideration)
   - Currency changes do not retroactively affect existing financial records

---

## API Specification

### Base URL

All endpoints are prefixed with `/api/v1`

### Authentication

All endpoints require valid JWT token with `tenantId` claim. Requests without valid authentication return 401 Unauthorized.

---

### Tenant Endpoints

#### GET /api/v1/tenants/current

**Purpose:** Retrieve information about the currently authenticated user's tenant

**Authorization:** ADMIN (and future roles)

**Request:** None (tenant context from JWT)

**Response:**

```typescript
interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
}
```

**Status Codes:**

- 200: Success
- 401: Unauthorized (missing or invalid token)
- 500: Server error

**Example Response:**

```json
{
  "id": "clx1234567890",
  "name": "FitLife Gyms",
  "slug": "fitlife-gyms",
  "defaultCurrency": "USD",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

---

#### PATCH /api/v1/tenants/current

**Purpose:** Update settings for the current tenant

**Authorization:** ADMIN only

**Request:**

```typescript
interface UpdateTenantRequest {
  name?: string; // Optional: new tenant name
  defaultCurrency?: string; // Optional: ISO 4217 currency code
}
```

**Response:** Same as `TenantResponse`

**Status Codes:**

- 200: Success
- 400: Validation error
- 401: Unauthorized
- 403: Forbidden (user is not ADMIN)
- 500: Server error

**Validation Rules:**

- `name`: 3-100 characters, alphanumeric and spaces allowed
- `defaultCurrency`: Must be valid ISO 4217 code (USD, EUR, GBP, etc.)
- At least one field must be provided

**Error Response:**

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}
```

**Example Request:**

```json
{
  "name": "FitLife Wellness Centers",
  "defaultCurrency": "EUR"
}
```

---

### Branch Endpoints

#### GET /api/v1/branches

**Purpose:** List all branches for the current tenant with pagination

**Authorization:** ADMIN (and future roles)

**Query Parameters:**

```typescript
interface BranchListQuery {
  page?: number; // Default: 1
  limit?: number; // Default: 20, Max: 100
  includeArchived?: boolean; // Default: false
}
```

**Response:**

```typescript
interface BranchListResponse {
  data: Branch[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
```

**Status Codes:**

- 200: Success
- 400: Invalid query parameters
- 401: Unauthorized
- 500: Server error

**Example Response:**

```json
{
  "data": [
    {
      "id": "clx2345678901",
      "tenantId": "clx1234567890",
      "name": "Main Branch",
      "address": "123 Fitness St, New York, NY 10001",
      "isDefault": true,
      "isActive": true,
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-15T10:30:00Z",
      "archivedAt": null
    },
    {
      "id": "clx3456789012",
      "tenantId": "clx1234567890",
      "name": "Downtown Location",
      "address": "456 Health Ave, New York, NY 10002",
      "isDefault": false,
      "isActive": true,
      "createdAt": "2025-02-01T14:20:00Z",
      "updatedAt": "2025-02-01T14:20:00Z",
      "archivedAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

---

#### GET /api/v1/branches/:id

**Purpose:** Get details of a specific branch

**Authorization:** ADMIN (and future roles)

**URL Parameters:**

- `id`: Branch ID (CUID)

**Response:** Single `Branch` object

**Status Codes:**

- 200: Success
- 401: Unauthorized
- 403: Forbidden (branch belongs to different tenant)
- 404: Branch not found
- 500: Server error

---

#### POST /api/v1/branches

**Purpose:** Create a new branch for the current tenant

**Authorization:** ADMIN only

**Request:**

```typescript
interface CreateBranchRequest {
  name: string; // Required: branch name
  address: string; // Required: physical address
}
```

**Response:** Single `Branch` object (201 Created)

**Status Codes:**

- 201: Created successfully
- 400: Validation error
- 401: Unauthorized
- 403: Forbidden (user is not ADMIN)
- 409: Conflict (branch name already exists for this tenant)
- 500: Server error

**Validation Rules:**

- `name`: 2-100 characters, required, must be unique within tenant
- `address`: 5-300 characters, required

**Example Request:**

```json
{
  "name": "Westside Gym",
  "address": "789 Workout Blvd, Los Angeles, CA 90001"
}
```

---

#### PATCH /api/v1/branches/:id

**Purpose:** Update an existing branch

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Branch ID (CUID)

**Request:**

```typescript
interface UpdateBranchRequest {
  name?: string; // Optional: new name
  address?: string; // Optional: new address
}
```

**Response:** Updated `Branch` object

**Status Codes:**

- 200: Success
- 400: Validation error
- 401: Unauthorized
- 403: Forbidden (branch belongs to different tenant or user is not ADMIN)
- 404: Branch not found
- 409: Conflict (new name already exists for this tenant)
- 500: Server error

**Validation Rules:**

- `name`: 2-100 characters, must be unique within tenant if provided
- `address`: 5-300 characters if provided
- At least one field must be provided

---

#### POST /api/v1/branches/:id/archive

**Purpose:** Archive (soft-delete) a branch

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Branch ID (CUID)

**Request:** None

**Response:** Updated `Branch` object with `isActive: false` and `archivedAt` timestamp

**Status Codes:**

- 200: Success
- 400: Validation error (cannot archive last active branch or default branch without reassignment)
- 401: Unauthorized
- 403: Forbidden (branch belongs to different tenant or user is not ADMIN)
- 404: Branch not found
- 500: Server error

**Business Rule Validation:**

- Cannot archive the last active branch of a tenant (returns 400 with message: "Cannot archive the last active branch")
- If archiving the default branch, must specify which other branch should become default

---

#### POST /api/v1/branches/:id/restore

**Purpose:** Restore an archived branch

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Branch ID (CUID)

**Request:** None

**Response:** Updated `Branch` object with `isActive: true` and `archivedAt: null`

**Status Codes:**

- 200: Success
- 400: Branch is not archived
- 401: Unauthorized
- 403: Forbidden (branch belongs to different tenant or user is not ADMIN)
- 404: Branch not found
- 500: Server error

---

#### POST /api/v1/branches/:id/set-default

**Purpose:** Set a branch as the default branch for the tenant

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Branch ID (CUID)

**Request:** None

**Response:** Updated `Branch` object with `isDefault: true`

**Status Codes:**

- 200: Success (also unsets previous default branch)
- 400: Branch is archived (cannot set archived branch as default)
- 401: Unauthorized
- 403: Forbidden (branch belongs to different tenant or user is not ADMIN)
- 404: Branch not found
- 500: Server error

**Side Effect:**

- Automatically sets `isDefault: false` on the previously default branch

---

## Data Model (Prisma Schema)

```prisma
model Tenant {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  defaultCurrency String   @default("USD") // ISO 4217 code
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  branches        Branch[]
  users           User[]
  // Future: members, subscriptions, payments, etc.

  @@index([slug])
}

model Branch {
  id         String    @id @default(cuid())
  tenantId   String
  name       String
  address    String
  isDefault  Boolean   @default(false)
  isActive   Boolean   @default(true)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  archivedAt DateTime?

  // Relations
  tenant     Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // Future: members, checkIns, staff assignments, etc.

  @@unique([tenantId, name]) // Branch names must be unique within a tenant
  @@index([tenantId])
  @@index([tenantId, isActive])
  @@index([tenantId, isDefault])
}

model User {
  id        String   @id @default(cuid())
  tenantId  String
  email     String   @unique
  password  String   // Hashed with bcrypt
  firstName String
  lastName  String
  role      Role     @default(ADMIN)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([email])
}

enum Role {
  ADMIN
  // Future: OWNER, STAFF, TRAINER, ACCOUNTANT
}
```

### Migration Considerations

**Initial Migration:**

- Creates `Tenant`, `Branch`, and updates `User` tables
- Adds foreign key constraints and cascading deletes
- Creates indexes for tenant-scoped queries

**Backward Compatibility:**

- This is a foundational feature, so no backward compatibility concerns
- Future migrations must maintain tenant isolation constraints

**Index Strategy:**

- Single-column index on `Tenant.slug` for lookup during login
- Composite index on `Branch(tenantId, isActive)` for listing active branches
- Composite index on `Branch(tenantId, isDefault)` for quick default branch lookup
- Single-column index on `User.tenantId` for tenant-scoped user queries

**Data Seeding (Development Only):**

- Create a sample tenant "Demo Gym" with slug "demo-gym"
- Create a default branch "Main Branch" for the demo tenant
- Create an ADMIN user associated with the demo tenant

---

## Frontend Specification

### User Interface

#### Screens/Views

1. **Tenant Settings Page (`/settings/tenant`)**

   - Displays current tenant information
   - Form to update tenant name and default currency
   - Read-only display of tenant ID and creation date

2. **Branch Management Page (`/settings/branches`)**

   - Table listing all branches with columns: Name, Address, Status (Active/Archived), Default, Actions
   - "Add Branch" button (top-right)
   - Filter toggle for showing archived branches
   - Pagination controls (if > 20 branches)

3. **Create Branch Modal**

   - Form with fields: Branch Name, Address
   - Cancel and Create buttons
   - Client-side validation feedback

4. **Edit Branch Modal**

   - Form with fields: Branch Name, Address
   - Cancel and Save buttons
   - Client-side validation feedback

5. **Branch Actions Menu (Dropdown)**
   - Edit
   - Set as Default (if not already default)
   - Archive (if not the last active branch)
   - Restore (if archived)

#### User Flows

**Flow 1: Update Tenant Settings**

1. Admin navigates to `/settings/tenant`
2. Views current tenant name and currency
3. Clicks "Edit Settings" button
4. Modifies name or currency in form
5. Clicks "Save Changes"
6. System validates input
7. API call to `PATCH /api/v1/tenants/current`
8. Success: Form displays updated data with success toast
9. Error: Form shows validation errors inline

**Flow 2: Create New Branch**

1. Admin navigates to `/settings/branches`
2. Clicks "Add Branch" button
3. Modal opens with empty form
4. Admin enters branch name and address
5. Clicks "Create"
6. System validates input client-side
7. API call to `POST /api/v1/branches`
8. Success: Modal closes, branch list refreshes, success toast
9. Error: Modal shows error message

**Flow 3: Archive Branch**

1. Admin views branch list
2. Clicks actions dropdown for a branch
3. Selects "Archive"
4. Confirmation dialog appears: "Are you sure you want to archive [Branch Name]? Historical data will be preserved."
5. Admin confirms
6. API call to `POST /api/v1/branches/:id/archive`
7. Success: Branch row updates to show "Archived" status, success toast
8. Error: Error toast with message

**Flow 4: Set Default Branch**

1. Admin views branch list
2. Clicks actions dropdown for a non-default branch
3. Selects "Set as Default"
4. API call to `POST /api/v1/branches/:id/set-default`
5. Success: UI updates default badge on new branch, removes from old default
6. Error: Error toast with message

#### Components (shadcn/ui)

**New Components:**

- `TenantSettingsForm`: Form for editing tenant name and currency
- `BranchTable`: Data table displaying branches with sorting and pagination
- `BranchFormModal`: Modal dialog with form for creating/editing branches
- `BranchActionsMenu`: Dropdown menu for branch actions
- `ConfirmDialog`: Reusable confirmation dialog for destructive actions

**Reused Components (from shadcn/ui):**

- `Button`, `Input`, `Label`, `Select`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`
- `DropdownMenu`, `DropdownMenuItem`
- `Badge` (for "Default" and "Archived" status)
- `AlertDialog` (for confirmations)
- `toast` (for success/error notifications)

#### Component Structure

```
pages/
  settings/
    tenant/
      page.tsx                 # Tenant settings page
      TenantSettingsForm.tsx   # Form component
    branches/
      page.tsx                 # Branch management page
      BranchTable.tsx          # Table component
      BranchFormModal.tsx      # Create/Edit modal
      BranchActionsMenu.tsx    # Actions dropdown

components/
  ui/
    # shadcn/ui components

shared/
  types/
    tenant.ts                  # Shared TS types for Tenant
    branch.ts                  # Shared TS types for Branch
```

### State Management

**React Query (TanStack Query) for Server State:**

- `useCurrentTenant()`: Fetches current tenant data
- `useUpdateTenant()`: Mutation for updating tenant
- `useBranches(page, includeArchived)`: Fetches paginated branch list
- `useCreateBranch()`: Mutation for creating branch
- `useUpdateBranch()`: Mutation for updating branch
- `useArchiveBranch()`: Mutation for archiving branch
- `useRestoreBranch()`: Mutation for restoring branch
- `useSetDefaultBranch()`: Mutation for setting default branch

**Local UI State:**

- Modal open/closed state (React `useState`)
- Form input values (React Hook Form)
- Filter toggle for archived branches (`useState`)
- Pagination state (`useState` or URL search params)

**Caching Strategy:**

- Tenant data cached indefinitely (rarely changes)
- Branch list cached with 5-minute stale time
- Mutations automatically invalidate relevant queries

### Performance Considerations

**Loading States:**

- Skeleton loaders for tenant settings and branch table during initial load
- Disabled form inputs during mutation
- Spinner in modal submit button during API call

**Optimistic Updates:**

- Branch archival: Immediately update UI, rollback on error
- Set default branch: Immediately update badges, rollback on error

**Pagination:**

- Render only current page of branches (not all branches)
- Pre-fetch next page on hover over "Next" button
- URL includes page number for deep linking and browser back/forward

**Error Handling:**

- Network errors: Retry button and error message
- Validation errors: Inline field-level error messages
- Unexpected errors: Generic error boundary with message

**Responsive Design:**

- Mobile: Stack form fields vertically, use full-width modals
- Tablet: Two-column form layout
- Desktop: Branch table with all columns visible

---

## Security & Tenant Isolation

### Tenant Scoping

**Database Level:**

- All queries for `Branch` MUST include `WHERE tenantId = ?`
- Use Prisma middleware to automatically inject `tenantId` filter on all tenant-scoped models
- Example middleware:
  ```typescript
  prisma.$use(async (params, next) => {
    if (params.model === "Branch" && params.action === "findMany") {
      params.args.where = { ...params.args.where, tenantId: currentTenantId };
    }
    return next(params);
  });
  ```

**Application Level:**

- Extract `tenantId` from JWT in authentication middleware
- Attach `tenantId` to request context (e.g., `req.user.tenantId`)
- Service layer methods MUST accept `tenantId` as a parameter
- Enforce tenant scoping in service layer before database queries

**API Level:**

- All API routes protected by authentication guard
- Tenant context established from JWT token
- Route handlers validate that resource `tenantId` matches JWT `tenantId`
- Attempting to access resource from different tenant returns 403 Forbidden

**Example Enforcement Flow:**

1. Request arrives with JWT in `Authorization` header
2. Auth middleware validates JWT and extracts `tenantId` and `userId`
3. Request context populated with `req.user = { userId, tenantId, role }`
4. Controller calls service method with `tenantId` from context
5. Service queries database with `tenantId` filter
6. Service validates result belongs to correct tenant before returning

### Authorization

**Current Role: ADMIN**

- Full access to tenant settings (read and update)
- Full access to branch management (create, read, update, archive, restore)
- Cannot access other tenants' data (enforced by tenant scoping)

**Future Role Design:**

- Authorization logic centralized in `AuthorizationService` or policy classes
- Policies define permissions per role (e.g., `OWNER`, `STAFF`, `TRAINER`)
- Example future permissions:
  - `OWNER`: Same as ADMIN, plus billing and subscription management
  - `STAFF`: Read-only access to branches, no tenant settings access
  - `TRAINER`: Read-only access to own branch only
- New roles can be added by extending `Role` enum and creating new policy rules

**Policy Pattern (Future-Ready):**

```typescript
// Example policy structure (not implemented in this spec)
interface Policy {
  canUpdateTenant(user: User): boolean;
  canCreateBranch(user: User): boolean;
  canArchiveBranch(user: User, branch: Branch): boolean;
}
```

### Data Sensitivity

**PII and Sensitive Data:**

- Tenant name is business information, not PII
- Branch addresses are public business locations, not sensitive
- No PII stored in Tenant or Branch entities

**Logging Restrictions:**

- Do NOT log full JWT tokens
- Do NOT log sensitive tenant data in plaintext
- DO log tenant ID for audit trail (tenant creation, settings updates)
- DO log branch operations with timestamp and user ID (create, archive, restore)

**Audit Trail (Future Enhancement):**

- Consider adding audit log table for tenant/branch changes
- Track who made changes and when for compliance

---

## Testing Requirements

### Unit Tests

Critical domain logic that MUST have unit tests:

- [ ] **Tenant Isolation Validation**

  - Verify queries automatically filter by `tenantId`
  - Verify cross-tenant access is blocked at service layer

- [ ] **Branch Business Rules**

  - Cannot archive the last active branch
  - Exactly one branch must be default per tenant
  - Branch name uniqueness within tenant (not globally)
  - Archiving default branch requires reassigning default

- [ ] **Validation Logic**

  - Tenant name validation (length, characters)
  - Currency code validation (valid ISO 4217 codes)
  - Branch name and address validation

- [ ] **Default Branch Logic**
  - Setting a branch as default unsets previous default
  - Creating first branch automatically sets it as default

### Integration Tests

API endpoints and flows that MUST have integration tests:

- [ ] **GET /api/v1/tenants/current**

  - Returns current tenant data
  - Returns 401 if not authenticated

- [ ] **PATCH /api/v1/tenants/current**

  - Updates tenant name successfully
  - Updates default currency successfully
  - Returns 400 for invalid currency code
  - Returns 400 for invalid tenant name

- [ ] **GET /api/v1/branches**

  - Returns branches for current tenant only
  - Respects pagination parameters
  - Filters archived branches by default
  - Includes archived branches when requested

- [ ] **POST /api/v1/branches**

  - Creates branch successfully
  - Returns 409 for duplicate branch name within tenant
  - Allows duplicate branch name across different tenants
  - Validates required fields

- [ ] **PATCH /api/v1/branches/:id**

  - Updates branch name and address
  - Returns 403 if branch belongs to different tenant
  - Returns 409 for duplicate name

- [ ] **POST /api/v1/branches/:id/archive**

  - Archives branch successfully
  - Returns 400 if trying to archive last active branch
  - Sets `isActive: false` and `archivedAt` timestamp

- [ ] **POST /api/v1/branches/:id/restore**

  - Restores archived branch
  - Returns 400 if branch is not archived

- [ ] **POST /api/v1/branches/:id/set-default**

  - Sets branch as default
  - Unsets previous default branch
  - Returns 400 if branch is archived

- [ ] **Tenant Isolation Verification**
  - User from Tenant A cannot access branches from Tenant B
  - API returns 403 for cross-tenant access attempts

### Edge Cases

Known edge cases to test:

- [ ] Archiving default branch when it's not the last active branch (should require explicit default reassignment)
- [ ] Concurrent requests to set different branches as default (last write wins, but exactly one remains default)
- [ ] Creating branch with very long name (test max length validation)
- [ ] Listing branches with no branches (empty state)
- [ ] Pagination with exactly 20 branches (boundary condition)
- [ ] Restoring a branch that was never archived (should return 400)
- [ ] Updating tenant with empty name (should return 400)
- [ ] Invalid currency code (e.g., "XXX", "INVALID")

### Testing Tools

- **Backend Testing:** Jest + Supertest for integration tests
- **Database Testing:** In-memory SQLite or test database with Prisma
- **Mocking:** Mock Prisma client for unit tests
- **Test Data:** Use factories/fixtures for creating test tenants and branches

---

## Performance & Scalability

### Expected Load

**Typical Usage Patterns:**

- Tenants: Thousands (target: 10,000+ tenants)
- Branches per tenant: 1-50 (most tenants have 1-5 branches)
- Branch reads: High frequency (every page load, dashboard queries)
- Branch writes: Low frequency (occasional creates, rare updates/archives)
- Tenant settings reads: Moderate frequency
- Tenant settings writes: Very low frequency

**Data Volume Expectations:**

- 10,000 tenants = 10,000 rows in `Tenant` table
- Average 3 branches per tenant = 30,000 rows in `Branch` table
- Growth rate: +100 tenants/month = +300 branches/month

### Database Indexes

Required indexes for performance:

- [ ] **Tenant Indexes**

  - `Tenant.slug` (unique index) - for login lookup by slug
  - `Tenant.id` (primary key) - automatic

- [ ] **Branch Indexes**

  - `Branch.id` (primary key) - automatic
  - `Branch.tenantId` (foreign key index) - for filtering branches by tenant
  - `Branch(tenantId, isActive)` (composite index) - for listing active branches
  - `Branch(tenantId, name)` (unique composite index) - for uniqueness check and lookups
  - `Branch(tenantId, isDefault)` (composite index) - for quick default branch lookup

- [ ] **User Indexes**
  - `User.email` (unique index) - for login lookup
  - `User.tenantId` (foreign key index) - for tenant-scoped user queries

### Query Optimization

**Common Queries and Optimization:**

1. **List active branches for tenant:**

   ```sql
   SELECT * FROM Branch
   WHERE tenantId = ? AND isActive = true
   ORDER BY name ASC
   LIMIT 20 OFFSET 0;
   ```

   - Uses `(tenantId, isActive)` composite index
   - Pagination prevents full table scans

2. **Get default branch for tenant:**

   ```sql
   SELECT * FROM Branch
   WHERE tenantId = ? AND isDefault = true
   LIMIT 1;
   ```

   - Uses `(tenantId, isDefault)` composite index
   - Very fast lookup (< 1ms expected)

3. **Check branch name uniqueness:**
   ```sql
   SELECT id FROM Branch
   WHERE tenantId = ? AND LOWER(name) = LOWER(?)
   LIMIT 1;
   ```
   - Uses `(tenantId, name)` composite unique index
   - Case-insensitive check handled in application layer

**N+1 Query Prevention:**

- When loading branches, avoid loading tenant separately for each branch
- Use Prisma's `include` to fetch relations in a single query if needed
- For branch list endpoint, don't include full tenant object (tenant context already known)

**Caching Considerations (Future):**

- Consider caching tenant data in Redis (rarely changes)
- Consider caching default branch ID per tenant (frequently accessed)
- Invalidate cache on tenant/branch updates

---

## Implementation Checklist

### Backend

- [ ] **Domain Entities**

  - [ ] Create `Tenant` entity with validation rules
  - [ ] Create `Branch` entity with validation rules
  - [ ] Implement tenant isolation business rules
  - [ ] Implement default branch logic

- [ ] **Service Layer**

  - [ ] `TenantService.getCurrentTenant(tenantId)`
  - [ ] `TenantService.updateTenant(tenantId, data)`
  - [ ] `BranchService.listBranches(tenantId, options)`
  - [ ] `BranchService.getBranchById(tenantId, branchId)`
  - [ ] `BranchService.createBranch(tenantId, data)`
  - [ ] `BranchService.updateBranch(tenantId, branchId, data)`
  - [ ] `BranchService.archiveBranch(tenantId, branchId)`
  - [ ] `BranchService.restoreBranch(tenantId, branchId)`
  - [ ] `BranchService.setDefaultBranch(tenantId, branchId)`

- [ ] **Prisma Schema**

  - [ ] Add `Tenant` model with fields and indexes
  - [ ] Add `Branch` model with fields and indexes
  - [ ] Update `User` model with `tenantId` foreign key
  - [ ] Add `Role` enum

- [ ] **Database Migration**

  - [ ] Create migration for `Tenant`, `Branch`, and `User` changes
  - [ ] Review migration for safety (no data loss)
  - [ ] Add seed script for development data

- [ ] **API Controllers**

  - [ ] `GET /api/v1/tenants/current` - controller logic
  - [ ] `PATCH /api/v1/tenants/current` - controller logic
  - [ ] `GET /api/v1/branches` - controller logic
  - [ ] `GET /api/v1/branches/:id` - controller logic
  - [ ] `POST /api/v1/branches` - controller logic
  - [ ] `PATCH /api/v1/branches/:id` - controller logic
  - [ ] `POST /api/v1/branches/:id/archive` - controller logic
  - [ ] `POST /api/v1/branches/:id/restore` - controller logic
  - [ ] `POST /api/v1/branches/:id/set-default` - controller logic

- [ ] **Validation DTOs**

  - [ ] `UpdateTenantDto` with class-validator decorators
  - [ ] `CreateBranchDto` with class-validator decorators
  - [ ] `UpdateBranchDto` with class-validator decorators
  - [ ] `BranchListQueryDto` for pagination params

- [ ] **Middleware & Guards**

  - [ ] Prisma middleware for automatic tenant scoping
  - [ ] Authentication guard (JWT validation)
  - [ ] Authorization guard (ADMIN role check)
  - [ ] Tenant isolation guard (validate resource tenantId)

- [ ] **Unit Tests**

  - [ ] Tenant isolation validation tests
  - [ ] Branch business rules tests
  - [ ] Default branch logic tests
  - [ ] Validation logic tests

- [ ] **Integration Tests**
  - [ ] All tenant endpoint tests
  - [ ] All branch endpoint tests
  - [ ] Tenant isolation verification tests
  - [ ] Edge case tests

### Frontend

- [ ] **Shared Types**

  - [ ] `Tenant` interface in `shared/types/tenant.ts`
  - [ ] `Branch` interface in `shared/types/branch.ts`
  - [ ] API request/response types

- [ ] **API Client**

  - [ ] `api/tenants.ts` - tenant API methods
  - [ ] `api/branches.ts` - branch API methods
  - [ ] React Query hooks for all endpoints

- [ ] **UI Components**

  - [ ] `TenantSettingsForm` component
  - [ ] `BranchTable` component
  - [ ] `BranchFormModal` component (create/edit modes)
  - [ ] `BranchActionsMenu` component
  - [ ] `ConfirmDialog` reusable component

- [ ] **Pages**

  - [ ] `/settings/tenant` page
  - [ ] `/settings/branches` page

- [ ] **State Management**

  - [ ] React Query setup and configuration
  - [ ] Query hooks for tenant and branches
  - [ ] Mutation hooks for all write operations
  - [ ] Optimistic update logic

- [ ] **Loading & Error States**

  - [ ] Skeleton loaders for tables and forms
  - [ ] Error boundaries for unexpected errors
  - [ ] Toast notifications for success/error
  - [ ] Empty state for no branches

- [ ] **Responsive Design**

  - [ ] Mobile layout for tenant settings form
  - [ ] Mobile layout for branch table (card view)
  - [ ] Tablet layout adjustments
  - [ ] Desktop full layout

- [ ] **Accessibility**
  - [ ] Keyboard navigation for forms and tables
  - [ ] ARIA labels for interactive elements
  - [ ] Focus states for all inputs and buttons
  - [ ] Screen reader friendly error messages

### Documentation

- [ ] **API Documentation**

  - [ ] Document all tenant endpoints in API reference
  - [ ] Document all branch endpoints in API reference
  - [ ] Include example requests and responses
  - [ ] Document error codes and messages

- [ ] **README Updates**

  - [ ] Add "Tenant Management" section to README
  - [ ] Explain multi-tenant architecture
  - [ ] Document environment variables (if any new ones)

- [ ] **Inline Code Comments**
  - [ ] Comment complex business rules (archival logic, default branch)
  - [ ] Comment Prisma middleware for tenant scoping
  - [ ] Comment authorization guards

---

## Open Questions

No open questions at this time. All requirements are clearly defined based on the provided feature description.

---

## Future Enhancements

Features or improvements intentionally deferred:

- **Branch-Specific Permissions:** Allow restricting ADMIN/STAFF users to specific branches within a tenant. Deferred because current ADMIN role has full tenant access, and this adds significant complexity to authorization logic.

- **Tenant Deactivation/Deletion:** Administrative feature to deactivate or permanently delete a tenant and all associated data. Deferred because this is a sensitive operation requiring careful audit trails and GDPR compliance considerations.

- **Multi-Currency Transaction Support:** Full implementation of currency conversion and multi-currency financial records. Deferred because this spec only establishes the `defaultCurrency` field; actual currency logic belongs in the Payments/Billing module.

- **Branch Contact Information:** Phone number, email, operating hours, and other branch-specific details. Deferred to keep this spec focused on core tenant-branch structure; can be added later without breaking changes.

- **Tenant Branding/Customization:** Logo upload, custom colors, white-label options. Deferred because it's a premium feature and not required for MVP.

- **Advanced Branch Analytics:** Dashboard metrics per branch (member count, revenue, check-ins). Deferred because it depends on other modules (Members, Subscriptions, Check-Ins) being implemented first.

- **Audit Log for Tenant/Branch Changes:** Comprehensive audit trail of who changed what and when. Deferred because it requires a dedicated audit logging system; current approach logs basic operations in application logs.

---

**Approval**

- [ ] Domain model reviewed and approved
- [ ] API design reviewed and approved
- [ ] Security implications reviewed (tenant isolation is critical)
- [ ] Performance implications reviewed (indexes and pagination)
- [ ] Ready for implementation

---

**End of Specification**
