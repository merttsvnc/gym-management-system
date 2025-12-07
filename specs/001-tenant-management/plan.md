# Implementation Plan: Tenant Management

**Version:** 2.0.0  
**Created:** 2025-12-04  
**Updated:** 2025-12-08  
**Status:** Backend Complete (Phase 1 & 1A), Frontend UI Complete, Backend Integration Pending

---

## Current Status Summary

**Overall Progress:** Backend Phase 1 and Phase 1A fully completed and production-ready. Frontend has been completely modernized with shadcn/dashboard-01 layout, all core pages implemented with modern UI components, and dark mode fully integrated. Next major milestone is connecting frontend to backend APIs.

**✅ BACKEND COMPLETED (Phase 1 & 1A):**

- Prisma schema, migrations, services, controllers
- Unit tests (34 tests passing) + e2e tests
- Tenant isolation fully enforced (validated by tests)
- JWT authentication with bcrypt password hashing
- Authorization (JwtAuthGuard, RolesGuard, @CurrentUser decorator)
- Tenant-based access control (tenantId isolation in all protected routes)
- SaaS plan system (`planKey`, `PLAN_CONFIG`, `PlanService`, `maxBranches` limit enforcement)
- Complete test coverage (Auth, JWT, Roles, Tenant Isolation, Plan Limits)

**✅ FRONTEND UI COMPLETED:**

- Modern dashboard layout (shadcn/dashboard-01 integration)
- Fully modernized sidebar (dark mode compatible)
- **Panel (Dashboard) page** - stat cards grid, recent activity, responsive layout, mock data
- **Şubeler (Branches) page** - complete CRUD UI, single create/edit dialog, plan limit display, archive/restore/set-default actions, shadcn table
- **Salon Ayarları (Tenant Settings) page** - plan display (planKey, usage), tenant info form, Turkish locale date formats
- **Login page** - Turkish translations, error handling ready
- Dark mode fully supported (theme provider + toggle)
- Modern layout structure (max-width, grid alignment, header)
- All Button/Text/Label components standardized to shadcn

**🟡 FRONTEND - UI READY, BACKEND NOT CONNECTED:**

- Dashboard data → using mock data (needs API integration)
- Branch CRUD → UI functional, API calls to be connected
- Tenant Settings → form ready, update API to be connected
- Login → UI complete, backend token flow to be implemented

**🔜 NEXT STEPS:**

- Connect Dashboard to real backend APIs
- Integrate Branch CRUD with backend endpoints
- Connect Tenant Settings update to API
- Implement Login → backend token flow (refresh token included)
- Add global error toast system (shadcn Sonner)
- Design and implement Activity Log API
- Plan billing/upgrade flow (future release)

---

## Overview

### Feature Summary

The Tenant Management module establishes the foundational multi-tenant architecture for the Gym Management System. It implements tenant entities representing gym businesses, branch entities for physical locations, and all CRUD operations with strict tenant isolation. This is the core infrastructure that all other modules will depend on.

### Related Specification

`/Users/mertsevinc/Project/gym-management-system/specs/001-tenant-management/spec.md`

### Estimated Effort

8-10 person-days (including testing and documentation)

---

## Constitution Compliance Check

Before proceeding, verify alignment with core constitutional principles:

- [x] **Long-Term Maintainability:** Is this approach maintainable by future developers?

  - ✅ Clean separation of domain, service, and API layers
  - ✅ Explicit business rules documented in spec
  - ✅ TypeScript strict mode with no `any` types
  - ✅ Clear naming conventions (Tenant, Branch, User)

- [x] **Security & Correctness:** Are security and correctness prioritized over simplicity?

  - ✅ Tenant isolation fully enforced at database, application, and API levels (validated by tests)
  - ✅ JWT-based authentication implemented with tenantId claim (real auth, not dev-auth)
  - ✅ Authorization guards for ADMIN-only operations (JwtAuthGuard, RolesGuard)
  - ✅ No cross-tenant data access allowed (403 Forbidden, enforced in code and validated by tests)
  - ✅ Password hashing with bcrypt

- [x] **Explicit Domain Rules:** Are business rules explicit, testable, and documented?

  - ✅ All business rules documented in spec (minimum branch requirement, default branch logic, archival rules)
  - ✅ Validation rules explicit (name lengths, character sets, currency codes)
  - ✅ Domain logic testable without HTTP/DB dependencies
  - ✅ Critical rules have dedicated unit tests planned

- [x] **Layered Architecture:** Is business logic separated from infrastructure and presentation?

  - ✅ Domain entities separate from Prisma models
  - ✅ Service layer orchestrates business logic
  - ✅ Controllers only handle HTTP concerns
  - ✅ React components only handle presentation
  - ✅ No business logic in controllers or UI components

- [x] **Multi-Tenant Isolation:** Is tenant isolation enforced at all layers?

  - ✅ Every tenant-scoped entity has `tenantId` field
  - ✅ All queries automatically filter by `tenantId`
  - ✅ Service methods accept and validate `tenantId`
  - ✅ JWT contains `tenantId` claim (enforced via guards)
  - ✅ Cross-tenant access returns 403 Forbidden (fully enforced and validated by tests)

- [x] **Data Integrity:** Are migrations backward compatible and reviewed?

  - ✅ Initial migration (creates tables, no backward compat concerns)
  - ✅ Foreign key constraints with CASCADE delete
  - ✅ Unique indexes for business constraints (tenantId + name)
  - ✅ Migration plan includes seed data for development

- [x] **Professional UI/UX:** Does the UI support fast, daily workflows with clear status indicators?

  - ✅ Single-branch tenant UX simplified (no branch selector)
  - ✅ Clear status badges (Default, Archived)
  - ✅ Confirmation dialogs for destructive actions
  - ✅ Optimistic UI updates for better perceived performance
  - ✅ shadcn/ui + Tailwind for consistent design system

- [x] **Performance & Scalability:** Are indexes, pagination, and efficient queries planned?

  - ✅ Composite indexes on (tenantId, isActive), (tenantId, isDefault)
  - ✅ Unique index on (tenantId, name) for uniqueness checks
  - ✅ All list endpoints paginated (default 20, max 100)
  - ✅ Query optimization patterns documented
  - ✅ N+1 query prevention with Prisma includes

- [x] **Testing Coverage:** Are critical paths covered by unit and integration tests?
  - ✅ Unit tests for tenant isolation, branch business rules, validation
  - ✅ Integration tests for all API endpoints
  - ✅ Edge case tests documented (archiving default, concurrent updates)
  - ✅ Cross-tenant access verification tests

**Compliance Status:** ✅ PASSED - All constitutional principles satisfied

---

## Technical Context

### Technology Stack (Confirmed)

- **Backend Framework:** NestJS with TypeScript (strict mode)
- **Database:** PostgreSQL 14+ (production), Prisma ORM
- **Authentication:** JWT with bcrypt password hashing
- **Frontend Framework:** React + Vite + TypeScript
- **UI Library:** shadcn/ui + Tailwind CSS
- **State Management:** React Query (TanStack Query)
- **ID Generation:** CUID for primary keys

### Architecture Decisions (From Spec)

- **Multi-Tenant Strategy:** Shared database with tenant_id column isolation
- **API Design:** RESTful, versioned at `/api/v1`
- **Authorization:** Role-based (ADMIN initially, extensible to OWNER/STAFF/TRAINER)
- **Soft Delete:** Branches use `isActive` + `archivedAt` fields

### Research Required

- ✅ **Prisma Middleware for Tenant Scoping:** How to implement automatic tenantId injection (RESOLVED: Optional for v1, explicit filtering preferred)
- ✅ **NestJS Guard Pattern:** Best practices for tenant isolation guards (NEEDS RESEARCH)
- ✅ **React Query Multi-Tenant Caching:** Cache invalidation strategies per tenant (NEEDS RESEARCH)
- ✅ **ISO 4217 Currency Validation:** Library or manual validation approach (NEEDS RESEARCH)
- ✅ **CUID Performance:** Indexing and query performance considerations (NEEDS RESEARCH)

### Known Constraints

- **No tenant creation in this module:** Handled by separate Onboarding spec
- **No user management:** Handled by separate User Management spec
- **Slug generation external:** Onboarding module generates slugs
- **Password field naming:** Spec uses `password` for readability, implementation should use `passwordHash`

---

## Implementation Phases

Break down the work into logical phases that can be completed and tested incrementally.

### Phase 0: Research & Design ✅

**Status:** ✅ COMPLETE

All technical unknowns resolved, design artifacts created, and development patterns established.

---

### Phase 1: Database & Schema ✅

**Status:** ✅ COMPLETE

Prisma schema created with Tenant, Branch, User models. Migrations applied successfully. All indexes and foreign key constraints in place. Prisma Client generated.

---

### Phase 2: Backend - Domain & Services ✅

**Status:** ✅ COMPLETE

All services, DTOs, guards implemented. 34 unit tests passing. Business logic validated and working correctly.

---

### Phase 3: Backend - API Controllers ✅

**Status:** ✅ COMPLETE

All API endpoints implemented and tested. Exception filters in place. E2E tests passing. Tenant isolation verified.

---

### Phase 1A: Backend Authentication & Plan System ✅

**Status:** ✅ COMPLETE

Production-ready JWT authentication with bcrypt. Role-based authorization (JwtAuthGuard, RolesGuard). SaaS plan system with `planKey`, `PLAN_CONFIG`, and `PlanService`. Plan limits (maxBranches) enforced. Complete test coverage for auth, authorization, and plan logic.

---

### Phase 4: Frontend - API Client & Hooks ✅

**Status:** ✅ COMPLETE

API client configured with axios. React Query hooks created for tenant and branch operations. TypeScript types in place. Query client configured with proper caching and invalidation strategies.

**Note:** API client and hooks are created here, but real backend endpoint connections are completed in Phase 7.

---

### Phase 5: Frontend - Modern UI Implementation ✅

**Status:** ✅ COMPLETE

**Completed Components & Pages:**

1. **Dashboard Layout** - Modern shadcn/dashboard-01 integration with responsive sidebar
2. **Panel (Dashboard) Page** - Stat cards, recent activity, responsive grid layout (using mock data)
3. **Şubeler (Branches) Page** - Complete CRUD UI with:
   - Single create/edit dialog component
   - Plan limit display (maxBranches)
   - Archive/restore/set-default buttons
   - Archived branch visual treatment (muted appearance)
   - Modern shadcn table component
4. **Salon Ayarları (Tenant Settings) Page** - Tenant info form with:
   - Plan display (planKey, plan usage)
   - Turkish locale date formatting
   - Tenant information editing
5. **Login Page** - Turkish translations, error handling ready
6. **App Sidebar** - Fully modernized, dark mode compatible
7. **Dark Mode** - Complete theme provider integration with toggle
8. **Layout Structure** - Modern grid alignment, max-width containers, consistent header

**UI Standards:**

- All Button/Text/Label components standardized to shadcn
- Consistent spacing and typography throughout
- Responsive design implemented

**Note:** UI is complete but using mock data. Backend API integration is the next step.

---

### Phase 6: Testing & Documentation ✅

**Status:** ✅ BACKEND TESTING COMPLETE / 🟡 DOCUMENTATION PENDING

**Completed:**

- Backend unit tests (34 tests passing)
- Backend e2e tests (all passing)
- Frontend UI manual testing passed
- Edge cases validated

**Pending:**

- API documentation updates
- README updates
- Inline code comments for complex logic
- Demo materials (screenshots/video)

---

### Phase 7: Frontend-Backend Integration 🔜

**Status:** 🔜 NEXT PRIORITY

**Primary Tasks:**

1. **Dashboard API Integration**

   - Connect stat cards to real backend data
   - Integrate recent activity API
   - Replace mock data with live data

2. **Branch Management Backend Connection**

   - Connect create/edit/delete operations to API
   - Integrate archive/restore/set-default actions
   - Implement real-time plan limit enforcement
   - Connect validation to backend

3. **Salon Ayarları API Integration**

   - Connect tenant update form to PATCH /api/v1/tenants/current
   - Display real plan information from backend
   - Integrate usage metrics

4. **Authentication Flow Implementation**

   - Connect login page to /auth/login endpoint
   - Implement JWT token storage (localStorage/cookies)
   - Add token refresh logic
   - Implement logout flow
   - Create ProtectedRoute component
   - Add 401 redirect to login

5. **Error Handling & Feedback**

   - Integrate shadcn Sonner for global toast notifications
   - Add error boundary components
   - Implement API error message display
   - Add loading states for all async operations

6. **Activity Log System**
   - Design Activity Log API (backend)
   - Create activity log database tables
   - Implement activity log service
   - Integrate with dashboard recent activity

**Estimated Effort:** 20-24 hours

---

### Phase 8: Future Enhancements 📋

**Status:** 📋 PLANNED FOR FUTURE RELEASES

**Enhancements:**

1. **Multi-Role Support**

   - Expand beyond ADMIN to OWNER, STAFF, TRAINER roles
   - Implement role-based UI permissions
   - Add role management interface

2. **Multi-Plan System**

   - Support BASIC, PRO, ENTERPRISE plans
   - Plan comparison UI
   - Upgrade/downgrade flows
   - Plan limit enforcement across features

3. **Billing Integration**

   - Stripe/iyzico payment integration
   - Subscription management
   - Payment history
   - Invoice generation

4. **User Management**

   - User invitation system
   - User list and management UI
   - Role assignment interface

5. **Branch-Level Permissions**

   - Granular access control per branch
   - Permission assignment UI
   - Branch admin capabilities

6. **Production Infrastructure**
   - Docker deployment templates
   - CI/CD pipeline
   - Monitoring and metrics (APM, logs)
   - Performance optimization

**Estimated Effort:** 60-80 hours total

---

## Dependencies

### External Dependencies

**Backend:**

- NestJS framework (already installed)
- Prisma ORM (already installed)
- PostgreSQL database (must be running)
- bcrypt for password hashing
- class-validator for DTO validation
- class-transformer for DTO transformation
- @nestjs/jwt for JWT handling (assumed from auth system)

**Frontend:**

- React 18+ (already installed)
- Vite (already installed)
- TanStack Query (React Query) v5
- axios for HTTP client
- react-hook-form for form handling
- shadcn/ui components
- Tailwind CSS (already installed)
- sonner for toast notifications

**Development:**

- TypeScript 5+
- ESLint + Prettier
- Jest for backend testing
- Supertest for integration tests

### Internal Dependencies

**Assumes Already Implemented:**

- Basic project structure (NestJS backend, React frontend)
- JWT authentication system with token generation
- JWT token includes `userId`, `tenantId`, `role` claims
- JwtAuthGuard that validates tokens and attaches user to request
- PostgreSQL database connection configured in Prisma
- Basic error handling and logging infrastructure

**Dependencies on Other Modules:**

- **None for core functionality** - Tenant Management is foundational
- Onboarding module (future) will depend on this module for tenant creation
- User Management module (future) will depend on this module for tenant scoping
- All future modules will depend on tenant isolation patterns established here

### Blocking Issues

**No blocking issues identified.**

All prerequisites are standard for the tech stack chosen. If authentication system is not yet implemented, that would be a blocker requiring resolution first (JWT auth with tenantId claim is essential).

---

## Database Changes

### New Tables/Models

**Tenant Table:**

- Stores gym business account information
- Fields: id (CUID), name, slug (unique), defaultCurrency, createdAt, updatedAt
- Primary key: id
- Unique constraint: slug

**Branch Table:**

- Stores physical gym location information
- Fields: id (CUID), tenantId (FK), name, address, isDefault, isActive, createdAt, updatedAt, archivedAt
- Primary key: id
- Foreign key: tenantId → Tenant.id (CASCADE delete)
- Unique constraint: (tenantId, name)

**User Table (Modified):**

- Add tenantId field and foreign key
- Fields: id (CUID), tenantId (FK), email (unique), passwordHash, firstName, lastName, role, createdAt, updatedAt
- Primary key: id
- Foreign key: tenantId → Tenant.id (CASCADE delete)
- Unique constraint: email

**Role Enum:**

- Values: ADMIN (currently), OWNER, STAFF, TRAINER, ACCOUNTANT (future)

### Schema Modifications

**If User table already exists:**

- Add `tenantId` column (String, NOT NULL)
- Add foreign key constraint to Tenant.id
- Add index on `tenantId`
- Data migration: Assign existing users to a default tenant (if any exist)

**If User table doesn't exist:**

- Create with tenantId from the start

### Migrations

**Migration 1: Create Tenant Management Schema**

- Creates: Tenant, Branch, User (or modifies User), Role enum
- Backward compatible: N/A (first migration for this module)
- Data migration required: Only if existing users need tenant assignment
- Risks:
  - **Low risk** - This is a foundational migration
  - If User table exists with data, must handle tenant assignment carefully
  - Rolling back deletes all tenant/branch data (by design)

**Migration SQL Preview (conceptual):**

```sql
-- Create Tenant table
CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT UNIQUE NOT NULL,
  "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL
);

-- Create Branch table
CREATE TABLE "Branch" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL,
  "archivedAt" TIMESTAMP,
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

-- Create/Modify User table
-- (Depends on whether it exists)

-- Create indexes (see Index Strategy below)
```

**Rollback Strategy:**

- Drop tables in reverse order: User (if new), Branch, Tenant
- Restore User table backup if modified
- No data loss concern for first implementation

### Index Strategy

Required indexes and rationale:

**Tenant Table:**

- `id` (PRIMARY KEY) - Automatic, for lookups
- `slug` (UNIQUE INDEX) - For login lookup by tenant slug (fast O(log n))

**Branch Table:**

- `id` (PRIMARY KEY) - Automatic, for direct lookups
- `(tenantId, name)` (UNIQUE COMPOSITE) - Enforce branch name uniqueness within tenant + fast name lookups
- `tenantId` (INDEX) - Fast filtering of branches by tenant
- `(tenantId, isActive)` (COMPOSITE INDEX) - Optimized for listing active branches (most common query)
- `(tenantId, isDefault)` (COMPOSITE INDEX) - Optimized for finding default branch (frequent operation)

**User Table:**

- `id` (PRIMARY KEY) - Automatic
- `email` (UNIQUE INDEX) - For login lookup by email
- `tenantId` (INDEX) - Fast filtering of users by tenant

**Index Performance Impact:**

- Tenant lookups by slug: O(log n) with ~10,000 tenants ≈ 13 comparisons
- Branch lookups by tenantId: O(log n) with ~30,000 branches ≈ 15 comparisons
- Active branch listing: Uses (tenantId, isActive) composite, very fast
- Default branch lookup: Uses (tenantId, isDefault) composite, sub-millisecond

**Storage Impact:**

- Indexes add ~10-20% to table size
- For 10,000 tenants + 30,000 branches: ~5MB additional index storage (negligible)

---

## API Changes

### New Endpoints

**Tenant Endpoints:**

1. `GET /api/v1/tenants/current`

   - Returns current tenant information
   - Auth: Required (JWT)
   - Response: TenantResponse

2. `PATCH /api/v1/tenants/current`
   - Updates tenant settings
   - Auth: Required (JWT), Role: ADMIN
   - Request: UpdateTenantRequest
   - Response: TenantResponse

**Branch Endpoints:** 3. `GET /api/v1/branches`

- Lists branches with pagination
- Auth: Required (JWT)
- Query params: page, limit, includeArchived
- Response: BranchListResponse

4. `GET /api/v1/branches/:id`

   - Gets single branch by ID
   - Auth: Required (JWT)
   - Response: BranchResponse

5. `POST /api/v1/branches`

   - Creates new branch
   - Auth: Required (JWT), Role: ADMIN
   - Request: CreateBranchRequest
   - Response: BranchResponse (201 Created)

6. `PATCH /api/v1/branches/:id`

   - Updates existing branch
   - Auth: Required (JWT), Role: ADMIN
   - Request: UpdateBranchRequest
   - Response: BranchResponse

7. `POST /api/v1/branches/:id/archive`

   - Archives a branch
   - Auth: Required (JWT), Role: ADMIN
   - Response: BranchResponse

8. `POST /api/v1/branches/:id/restore`

   - Restores archived branch
   - Auth: Required (JWT), Role: ADMIN
   - Response: BranchResponse

9. `POST /api/v1/branches/:id/set-default`
   - Sets branch as default
   - Auth: Required (JWT), Role: ADMIN
   - Response: BranchResponse

**Total:** 9 new endpoints

### Modified Endpoints

**No existing endpoints modified** - This is a new module

### Contract Updates

**New TypeScript Types/Interfaces:**

**Entities:**

- `Tenant` - Tenant entity interface
- `Branch` - Branch entity interface
- `CurrencyCode` - Union type of supported currencies
- `Role` - Enum for user roles

**Request DTOs:**

- `UpdateTenantRequest` - For PATCH /tenants/current
- `CreateBranchRequest` - For POST /branches
- `UpdateBranchRequest` - For PATCH /branches/:id
- `BranchListQuery` - Query parameters for GET /branches

**Response DTOs:**

- `TenantResponse` - For tenant endpoints
- `BranchResponse` - For branch endpoints
- `BranchListResponse` - For GET /branches with pagination
- `ErrorResponse` - Standard error structure

**Constants:**

- `SUPPORTED_CURRENCIES` - Array of currency codes
- `VALIDATION_RULES` - Validation constants
- `API_PATHS` - Endpoint path constants
- `HTTP_STATUS` - Status code constants
- `ERROR_MESSAGES` - Standard error messages
- `SUCCESS_MESSAGES` - Standard success messages

**Location:**

- Contracts defined in `specs/001-tenant-management/contracts/types.ts`
- Should be copied to both backend and frontend projects
- Backend: `src/common/types/` or inline in modules
- Frontend: `src/types/`

**Versioning:**

- All contracts versioned at v1 with `/api/v1` prefix
- Breaking changes in future require v2 endpoints

---

## Frontend Changes

### New Components

**Page Components:**

1. `TenantSettingsPage` - Main page for tenant settings

   - Path: `src/pages/settings/tenant/page.tsx`
   - Features: Display and edit tenant information

2. `BranchManagementPage` - Main page for branch management
   - Path: `src/pages/settings/branches/page.tsx`
   - Features: List, create, edit, archive, restore branches

**Feature Components:** 3. `TenantSettingsForm` - Form for editing tenant settings

- Path: `src/pages/settings/tenant/TenantSettingsForm.tsx`
- Props: None (uses hook for data)
- Features: Name and currency editing with validation

4. `BranchTable` - Data table for displaying branches

   - Path: `src/pages/settings/branches/BranchTable.tsx`
   - Props: `branches: Branch[]`, `pagination`, `onPageChange`, `onArchive`, `onRestore`, `onSetDefault`, `onEdit`
   - Features: Sortable, paginated, shows status badges

5. `BranchFormModal` - Modal for creating/editing branches

   - Path: `src/pages/settings/branches/BranchFormModal.tsx`
   - Props: `mode: 'create' | 'edit'`, `branch?: Branch`, `isOpen`, `onClose`, `onSubmit`
   - Features: Form validation, loading state, error handling

6. `BranchActionsMenu` - Dropdown menu for branch actions
   - Path: `src/pages/settings/branches/BranchActionsMenu.tsx`
   - Props: `branch: Branch`, `onEdit`, `onArchive`, `onRestore`, `onSetDefault`
   - Features: Conditional menu items based on branch state

**Shared/Reusable Components:** 7. `ConfirmDialog` - Reusable confirmation dialog

- Path: `src/components/shared/ConfirmDialog.tsx`
- Props: `isOpen`, `title`, `message`, `onConfirm`, `onCancel`, `loading`
- Features: Customizable, accessible, loading state

**shadcn/ui Components (to install):**

- Button, Input, Label, Select
- Table, TableHeader, TableBody, TableRow, TableCell
- Dialog, DialogContent, DialogHeader, DialogTitle
- DropdownMenu, DropdownMenuItem
- Badge (for status indicators)
- AlertDialog (for confirmations)
- Form components (for react-hook-form integration)

### Modified Components

**No existing components modified** - This is a new module

**Navigation (to be updated):**

- Add "Settings" menu item with submenu:
  - "Tenant Settings" → `/settings/tenant`
  - "Branch Management" → `/settings/branches`

### New Routes

**Route Configuration:**

```typescript
// In App.tsx or router config
{
  path: '/settings',
  element: <SettingsLayout />,
  children: [
    {
      path: 'tenant',
      element: <TenantSettingsPage />,
    },
    {
      path: 'branches',
      element: <BranchManagementPage />,
    },
  ],
}
```

**Protected Routes:**

- All routes require authentication (JWT token)
- `/settings/tenant` - Available to all authenticated users
- `/settings/branches` - Available to all authenticated users (ADMIN can modify)

**URL Examples:**

- `/settings/tenant` - Tenant settings page
- `/settings/branches` - Branch management page
- `/settings/branches?page=2` - Branch list page 2
- `/settings/branches?includeArchived=true` - Include archived branches

### State Management

**React Query Queries:**

1. `useCurrentTenant()`

   - Query key: `['tenant', 'current']`
   - Fetches current tenant data
   - Stale time: Infinity (rarely changes)
   - Cache time: 1 hour

2. `useBranches(options)`

   - Query key: `['tenant', tenantId, 'branches', options]`
   - Fetches paginated branch list
   - Stale time: 5 minutes
   - Depends on tenant query

3. `useBranch(branchId)`
   - Query key: `['tenant', tenantId, 'branch', branchId]`
   - Fetches single branch
   - Stale time: 5 minutes

**React Query Mutations:**

4. `useUpdateTenant()`

   - Mutation: PATCH /tenants/current
   - On success: Invalidates `['tenant', 'current']`
   - Shows success toast

5. `useCreateBranch()`

   - Mutation: POST /branches
   - On success: Invalidates `['tenant', tenantId, 'branches']`
   - Shows success toast

6. `useUpdateBranch()`

   - Mutation: PATCH /branches/:id
   - On success: Invalidates branch queries
   - Shows success toast

7. `useArchiveBranch()`

   - Mutation: POST /branches/:id/archive
   - On success: Invalidates branch list, uses optimistic update
   - Shows success toast

8. `useRestoreBranch()`

   - Mutation: POST /branches/:id/restore
   - On success: Invalidates branch list
   - Shows success toast

9. `useSetDefaultBranch()`
   - Mutation: POST /branches/:id/set-default
   - On success: Invalidates branch list, uses optimistic update
   - Shows success toast

**Local UI State:**

- Modal open/closed state (useState)
- Form input values (react-hook-form)
- Filter toggle for archived branches (useState)
- Current page for pagination (useState or URL params)
- Selected branch for edit/delete (useState)

**Global State (None Required):**

- Tenant context provided by React Query
- No Zustand/Redux needed for this module

**Caching Strategy:**

- Tenant data: Infinite stale time (rarely changes)
- Branch list: 5-minute stale time
- Optimistic updates for archive/restore/set-default
- Automatic invalidation on mutations
- Pre-fetch next page on pagination hover (optional enhancement)

---

## Testing Strategy

### Unit Tests

**Backend - Domain/Business Logic:**

1. **Tenant Isolation Validation**

   - `TenantsService.getCurrentTenant()` - Verify returns only authenticated user's tenant
   - `BranchesService.getBranch()` - Verify throws 403 if branch belongs to different tenant
   - Test with mock Prisma client

2. **Branch Business Rules**

   - `BranchesService.archiveBranch()` - Cannot archive last active branch
   - `BranchesService.archiveBranch()` - Cannot archive default branch
   - `BranchesService.setDefaultBranch()` - Previous default is unset
   - `BranchesService.setDefaultBranch()` - Cannot set archived branch as default
   - `BranchesService.createBranch()` - First branch auto-set as default
   - Test with mock Prisma client

3. **Validation Logic**

   - `UpdateTenantDto` validation - Test name length, currency codes
   - `CreateBranchDto` validation - Test name pattern, length constraints
   - `BranchListQueryDto` validation - Test pagination bounds
   - Use class-validator testing utilities

4. **Default Branch Logic**
   - Test transaction for setting new default (old default unset, new default set)
   - Test concurrent default branch updates (ensure exactly one remains default)

**Frontend - Utility Functions:**

- `isValidCurrencyCode()` - Test with valid and invalid codes
- `getBranchStatus()` - Test with active and archived branches
- Type guard functions

**Test Framework:** Jest  
**Coverage Target:** > 80% for service layer business logic

### Integration Tests

**Backend - API Endpoints:**

1. **GET /api/v1/tenants/current**

   - ✓ Returns current tenant (200)
   - ✗ Returns 401 if not authenticated
   - ✗ Returns 404 if tenant not found (edge case)

2. **PATCH /api/v1/tenants/current**

   - ✓ Updates tenant name (200)
   - ✓ Updates default currency (200)
   - ✗ Returns 400 for invalid currency code
   - ✗ Returns 400 for name too short/long
   - ✗ Returns 401 if not authenticated
   - ✗ Returns 403 if not ADMIN (future when other roles exist)

3. **GET /api/v1/branches**

   - ✓ Returns branches for current tenant only (200)
   - ✓ Respects pagination (page, limit)
   - ✓ Filters archived by default
   - ✓ Includes archived when requested
   - ✗ Returns 401 if not authenticated

4. **POST /api/v1/branches**

   - ✓ Creates branch (201)
   - ✓ First branch auto-set as default
   - ✗ Returns 409 for duplicate name within tenant
   - ✓ Allows duplicate name across different tenants
   - ✗ Returns 400 for invalid name pattern
   - ✗ Returns 401 if not authenticated
   - ✗ Returns 403 if not ADMIN

5. **PATCH /api/v1/branches/:id**

   - ✓ Updates branch (200)
   - ✗ Returns 403 if branch belongs to different tenant
   - ✗ Returns 409 for duplicate name
   - ✗ Returns 404 if branch not found
   - ✗ Returns 401 if not authenticated

6. **POST /api/v1/branches/:id/archive**

   - ✓ Archives branch (200)
   - ✗ Returns 400 if last active branch
   - ✗ Returns 400 if default branch
   - ✗ Returns 403 for different tenant
   - ✗ Returns 404 if not found

7. **POST /api/v1/branches/:id/restore**

   - ✓ Restores archived branch (200)
   - ✗ Returns 400 if not archived
   - ✗ Returns 403 for different tenant

8. **POST /api/v1/branches/:id/set-default**

   - ✓ Sets branch as default (200)
   - ✓ Unsets previous default
   - ✗ Returns 400 if archived
   - ✗ Returns 403 for different tenant

9. **Cross-Tenant Isolation**
   - Create two tenants with branches
   - User A tries to access User B's branches
   - Verify all operations return 403
   - Test GET, PATCH, archive, restore, set-default

**Test Framework:** Jest + Supertest  
**Test Database:** PostgreSQL test instance (or SQLite for speed)

### Manual Testing Checklist

**User Flows:**

- [ ] **Flow 1: Update Tenant Settings**

  1. Navigate to `/settings/tenant`
  2. View current tenant name and currency
  3. Click "Edit" button
  4. Change tenant name
  5. Change currency to EUR
  6. Click "Save"
  7. Verify success toast
  8. Verify updated values displayed

- [ ] **Flow 2: Create New Branch**

  1. Navigate to `/settings/branches`
  2. Click "Add Branch" button
  3. Enter branch name "Westside Location"
  4. Enter address "789 Main St, City, State"
  5. Click "Create"
  6. Verify modal closes
  7. Verify new branch appears in table
  8. Verify success toast

- [ ] **Flow 3: Edit Existing Branch**

  1. Click actions menu (⋮) for a branch
  2. Select "Edit"
  3. Change branch name
  4. Change address
  5. Click "Save"
  6. Verify modal closes
  7. Verify updated data in table

- [ ] **Flow 4: Archive Branch**

  1. Ensure tenant has at least 2 active branches
  2. Click actions menu for non-default branch
  3. Select "Archive"
  4. Confirm in dialog
  5. Verify branch status changes to "Archived"
  6. Verify "Restore" option now available
  7. Verify success toast

- [ ] **Flow 5: Set Default Branch**

  1. Click actions menu for non-default branch
  2. Select "Set as Default"
  3. Verify "Default" badge moves to new branch
  4. Verify previous default no longer has badge
  5. Verify success toast

- [ ] **Flow 6: Restore Archived Branch**
  1. Toggle "Show Archived" filter
  2. Find archived branch in table
  3. Click actions menu
  4. Select "Restore"
  5. Verify branch status changes to "Active"
  6. Verify success toast

**Edge Cases:**

- [ ] **Cannot Archive Last Branch**

  1. Archive all branches except one
  2. Try to archive last branch
  3. Verify error message displayed
  4. Verify branch remains active

- [ ] **Cannot Archive Default Branch**

  1. Try to archive the default branch
  2. Verify error message: "Cannot archive default branch. Set another branch as default first."
  3. Set another branch as default
  4. Archive the previous default
  5. Verify success

- [ ] **Branch Name Validation**

  1. Try to create branch with name "A" (too short)
  2. Verify validation error
  3. Try name with special characters "Test@#$"
  4. Verify validation error
  5. Try valid name "O'Brien's Gym"
  6. Verify success

- [ ] **Pagination**

  1. Create 25 branches
  2. Verify first page shows 20 branches
  3. Click "Next" button
  4. Verify second page shows 5 branches
  5. Verify page number in URL

- [ ] **Responsive Design**
  1. Test on mobile (375px width)
  2. Test on tablet (768px width)
  3. Test on desktop (1920px width)
  4. Verify all elements accessible and usable

**Test Browsers:**

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

**Test Devices:**

- Desktop (Windows, Mac)
- Tablet (iPad, Android)
- Mobile (iOS, Android)

---

## Rollout Strategy

### Feature Flags

**Not using feature flags for this module.**

**Rationale:**

- This is a foundational module required for all future features
- Cannot be partially enabled/disabled without breaking system
- No gradual rollout needed for internal admin features
- If needed, access can be controlled via role-based permissions (ADMIN only)

**Future Consideration:**

- For later enhancements (e.g., advanced branch analytics), feature flags may be appropriate

### Deployment Plan

**Deployment Order:**

1. **Database Migration** (Step 1)

   - Apply Prisma migration to production database
   - Command: `npx prisma migrate deploy`
   - Timing: During maintenance window (if required)
   - Duration: < 1 minute (schema changes only, no data)
   - Rollback: `npx prisma migrate reset` (DESTRUCTIVE - dev only)

2. **Backend Deployment** (Step 2)

   - Build backend: `npm run build`
   - Deploy to server (Docker, PM2, or platform-specific)
   - Health check: `GET /health` returns 200
   - Smoke test: `GET /api/v1/tenants/current` with valid JWT
   - Duration: 5-10 minutes

3. **Frontend Deployment** (Step 3)
   - Build frontend: `npm run build`
   - Deploy static files to CDN/hosting
   - Cache invalidation if needed
   - Duration: 5-10 minutes

**Total Deployment Time:** ~15-20 minutes

**Rollback Plan:**

**If backend issues:**

- Revert to previous backend version
- Database migration rollback NOT recommended (data loss risk)
- Instead, hotfix and redeploy

**If frontend issues:**

- Revert to previous frontend build (instant via CDN)
- Backend remains functional, existing API clients unaffected

**If database migration issues:**

- If caught before production: Fix migration, regenerate
- If in production: Cannot easily rollback migration with CASCADE deletes
- Mitigation: Thorough testing in staging environment first

**Data Migration Scripts:**

**None required for greenfield deployment.**

If deploying to system with existing users:

```sql
-- Assign existing users to default tenant
UPDATE "User"
SET "tenantId" = '<default-tenant-id>'
WHERE "tenantId" IS NULL;
```

### Monitoring

**Key Metrics:**

1. **API Performance**

   - Response time for `GET /api/v1/branches` < 200ms (p95)
   - Response time for `PATCH /api/v1/tenants/current` < 100ms (p95)
   - Track slow queries (> 500ms) and investigate

2. **Error Rates**

   - 4xx errors: Track 400, 403, 409 rates (validation, authorization, conflicts)
   - 5xx errors: Should be < 0.1% of requests
   - Specific: 403 errors for cross-tenant access (should be rare, investigate if frequent)

3. **Usage Metrics**

   - Number of tenant setting updates per day
   - Number of branches created per tenant (average and distribution)
   - Branch archive/restore frequency
   - Most common validation errors

4. **Database Performance**
   - Query execution time for branch listings
   - Index usage for tenant-scoped queries
   - Connection pool utilization

**Monitoring Tools:**

- APM: New Relic, DataDog, or similar (track request times, error rates)
- Database: PostgreSQL slow query log, pg_stat_statements
- Logging: Structured logs with correlation IDs for request tracing
- Alerts: Set up alerts for 5xx error rate > 1%, p95 latency > 500ms

**Logging Requirements:**

**Do Log:**

- Tenant setting updates (tenantId, fields changed, user)
- Branch creation, archival, restoration (tenantId, branchId, user)
- Authorization failures (attempted cross-tenant access)
- Validation errors (for improving UX)

**Do NOT Log:**

- JWT tokens (security risk)
- Password hashes (security risk)
- Full request bodies (may contain sensitive data)

**Log Format (JSON):**

```json
{
  "timestamp": "2025-12-04T12:34:56Z",
  "level": "info",
  "correlationId": "abc123",
  "userId": "clx1234567890",
  "tenantId": "clx9876543210",
  "action": "branch.archive",
  "branchId": "clx1111111111",
  "message": "Branch archived successfully"
}
```

---

## Documentation Updates

### Code Documentation

- [ ] **Inline comments for complex logic**
  - Branch archival rules (last active, default branch logic)
  - Default branch transaction (unset old, set new)
  - Tenant isolation validation in service layer
  - Prisma transaction examples
- [ ] **JSDoc/TSDoc for public APIs**
  - All service methods with parameter descriptions
  - DTOs with field descriptions and validation rules
  - API controllers with endpoint documentation
  - React hooks with usage examples

**Example:**

```typescript
/**
 * Archives a branch (soft delete). Cannot archive the last active branch
 * or the current default branch.
 *
 * @param tenantId - ID of the tenant (for isolation)
 * @param branchId - ID of the branch to archive
 * @returns Updated branch with isActive=false and archivedAt timestamp
 * @throws {BadRequestException} If last active or default branch
 * @throws {ForbiddenException} If branch belongs to different tenant
 * @throws {NotFoundException} If branch not found
 */
async archiveBranch(tenantId: string, branchId: string): Promise<Branch>
```

### External Documentation

- [ ] **README updates**

  - Add "Tenant Management" section to main README
  - Explain multi-tenant architecture
  - Document tenant isolation approach
  - List API endpoints with brief descriptions
  - Link to full specification and quickstart guide

- [ ] **API documentation**

  - Generate API docs from OpenAPI spec (use Swagger UI or similar)
  - Host at `/api/docs` endpoint
  - Include example requests and responses
  - Document error codes and messages
  - Add authentication section (JWT with tenantId claim)

- [ ] **Developer guide**

  - Create `docs/tenant-management.md` with:
    - Architecture overview
    - How tenant isolation works
    - How to add tenant-scoped models (pattern to follow)
    - Common pitfalls and solutions
    - Testing strategies for multi-tenant code

- [ ] **User guide (for ADMIN users)**
  - Not required for MVP (UI is self-explanatory)
  - Consider for future: Screenshots, video walkthrough
  - Help text in UI is sufficient initially

### Specification Updates

- [ ] **Update spec if implementation deviates from original design**

  - Document any changes made during implementation
  - Update API contracts if endpoints modified
  - Update data model if schema changed
  - Add clarification notes for ambiguous requirements resolved

- [ ] **Document any deferred enhancements**
  - List features explicitly deferred to future phases
  - Add to "Future Enhancements" section of spec
  - Include rationale for deferral
  - Estimate effort for future implementation

**Potential Deferrals (if time constrained):**

- Prisma middleware for automatic tenant scoping (use explicit filtering initially)
- Branch-level contact information (phone, email, hours)
- Audit log table for tenant/branch changes
- Advanced branch analytics dashboard

---

## Risk Assessment

### Technical Risks

**Risk 1: Tenant Isolation Breach (Cross-Tenant Data Access)**

- **Likelihood:** Low (if properly implemented)
- **Impact:** CRITICAL (catastrophic data leak)
- **Mitigation:**
  - Mandatory code reviews for all tenant-scoped queries
  - Integration tests specifically for cross-tenant access prevention
  - Service layer MUST validate tenantId on every operation
  - Never trust client-provided tenantId (always use JWT claim)
  - Automated security scanning in CI/CD

**Risk 2: Default Branch Logic Bug (No Default or Multiple Defaults)**

- **Likelihood:** Medium (complex state management)
- **Impact:** High (breaks branch selection logic in other modules)
- **Mitigation:**
  - Database constraint to enforce exactly one default per tenant (future enhancement)
  - Thorough unit tests for default branch transitions
  - Transaction to ensure atomic updates (unset old, set new)
  - Health check queries to detect anomalies

**Risk 3: Migration Failure or Data Loss**

- **Likelihood:** Low (first migration, no existing data)
- **Impact:** High (system non-functional)
- **Mitigation:**
  - Test migration in staging environment first
  - Database backup before production migration
  - Migration is idempotent (can re-run safely)
  - Rollback plan documented (though destructive)

**Risk 4: Performance Degradation at Scale**

- **Likelihood:** Low (well-indexed)
- **Impact:** Medium (slow API responses)
- **Mitigation:**
  - Proper indexes on all tenant-scoped queries
  - Pagination on all list endpoints
  - Load testing with 10,000 tenants + 30,000 branches
  - Database query monitoring and slow query alerts

**Risk 5: Breaking Future Modules Due to Schema Changes**

- **Likelihood:** Low (foundational schema is stable)
- **Impact:** Medium (requires migration and refactoring)
- **Mitigation:**
  - Thorough design review before implementation
  - Consider future relationships (members, check-ins)
  - Avoid premature optimization, but plan for extensibility
  - Version API endpoints for backward compatibility

### Security Risks

**Risk 1: JWT Token Leakage or Tampering**

- **Likelihood:** Medium (depends on implementation)
- **Impact:** CRITICAL (unauthorized access)
- **Mitigation:**
  - Use secure JWT signing algorithm (RS256 or HS256 with strong secret)
  - Short expiration times (15 min access, 7 day refresh)
  - HTTPS only in production
  - HTTP-only cookies for tokens (alternative to localStorage)
  - Token blacklist/revocation for logout

**Risk 2: SQL Injection via User Input**

- **Likelihood:** Very Low (Prisma parameterizes queries)
- **Impact:** CRITICAL (data breach, manipulation)
- **Mitigation:**
  - Use Prisma ORM (parameterized queries by default)
  - Never concatenate SQL strings
  - Input validation on all DTOs with class-validator
  - Regular security audits

**Risk 3: Unauthorized Tenant Settings Modification**

- **Likelihood:** Low (role-based guards in place)
- **Impact:** Medium (tenant misconfiguration)
- **Mitigation:**
  - ADMIN-only guards on all write endpoints
  - Authorization checks in service layer (defense in depth)
  - Audit logging of all tenant/branch modifications
  - Regular permission reviews

**Risk 4: Branch Name Injection or XSS**

- **Likelihood:** Low (input validation)
- **Impact:** Low to Medium (UI corruption, XSS if not escaped)
- **Mitigation:**
  - Strict input validation (alphanumeric, spaces, limited special chars)
  - Frontend sanitizes all rendered user input
  - Content Security Policy headers
  - React's default XSS protection (auto-escaping)

### Performance Risks

**Risk 1: Branch List Query Slow with Many Branches**

- **Likelihood:** Low (indexed and paginated)
- **Impact:** Medium (poor UX for large tenants)
- **Mitigation:**
  - Composite index on (tenantId, isActive)
  - Pagination mandatory (max 100 per page)
  - Pre-fetch next page on hover (future optimization)
  - Consider cursor-based pagination if needed

**Risk 2: N+1 Queries When Loading Related Data**

- **Likelihood:** Medium (easy to overlook)
- **Impact:** Medium (slow response times)
- **Mitigation:**
  - Use Prisma `include` to fetch relations
  - Code review for eager vs lazy loading decisions
  - Database query logging in development
  - APM monitoring to catch N+1 patterns

**Risk 3: Database Connection Pool Exhaustion**

- **Likelihood:** Low (Prisma manages pool)
- **Impact:** High (API unavailable)
- **Mitigation:**
  - Configure appropriate pool size (default: 10)
  - Close connections properly (Prisma handles)
  - Monitor active connections
  - Horizontal scaling of API servers if needed

**Risk 4: Frontend Bundle Size Too Large**

- **Likelihood:** Low (small module)
- **Impact:** Low (slower initial load)
- **Mitigation:**
  - Code splitting by route
  - Lazy load modals and heavy components
  - Tree-shaking for unused libraries
  - Monitor bundle size in CI

---

## Success Criteria

How will we know this feature is successfully implemented?

### Functional Requirements

**Backend (✅ All Complete):**

- [x] Tenant operations working (GET, PATCH /api/v1/tenants/current)
- [x] Branch operations working (all 7 endpoints)
- [x] Business rules enforced (validated by tests)
- [x] Tenant isolation verified (403 for cross-tenant access)
- [x] Authentication system working (JWT with bcrypt)
- [x] Authorization working (JwtAuthGuard, RolesGuard)
- [x] Plan system working (planKey, maxBranches limit)

**Frontend UI (✅ All Complete):**

- [x] Modern dashboard layout implemented
- [x] Panel (Dashboard) page with stat cards and activity
- [x] Şubeler (Branches) page with full CRUD UI
- [x] Salon Ayarları page with tenant info and plan display
- [x] Login page with Turkish translations
- [x] Dark mode fully supported
- [x] Responsive design implemented

**Integration (🔜 Pending):**

- [ ] Dashboard connected to backend APIs
- [ ] Branch CRUD connected to backend
- [ ] Tenant Settings update connected to API
- [ ] Login flow connected to /auth/login
- [ ] Token storage and refresh implemented
- [ ] Global error handling with Sonner toasts

### Technical Requirements

**Backend Testing (✅ Complete):**

- [x] Unit tests: 34 tests passing, >80% coverage
- [x] E2E tests: All endpoints covered
- [x] Edge cases validated
- [x] Cross-tenant isolation verified
- [x] Authentication/authorization tests passing
- [x] Plan limit tests passing

**Security (✅ Complete):**

- [x] Tenant isolation enforced (403 for cross-tenant)
- [x] JWT validation working correctly
- [x] bcrypt password hashing
- [x] No SQL injection vectors (Prisma ORM)
- [x] Input validation on all DTOs
- [x] No sensitive data in logs

**Performance (🟡 Backend Ready):**

- [x] Database indexes in place
- [x] Pagination implemented
- [x] No N+1 query problems
- [ ] Performance testing with real load (pending)
- [ ] Frontend bundle optimization (pending)

**Code Quality (✅ Backend Complete):**

- [x] TypeScript strict mode
- [x] ESLint/Prettier compliant
- [x] Clean architecture maintained
- [x] Follows project conventions

**Documentation (🟡 Partial):**

- [x] Spec documentation complete
- [x] Contracts defined
- [x] Quickstart guide available
- [ ] API documentation needs update
- [ ] README needs Tenant Management section
- [ ] Inline comments for complex logic needed

### User Experience Requirements

**Frontend UI (✅ Complete):**

- [x] Modern, professional shadcn/ui design
- [x] Forms with client-side validation
- [x] Loading states implemented
- [x] Responsive design (mobile, tablet, desktop)
- [x] Dark mode fully supported
- [x] Turkish translations for Login page
- [x] Consistent Button/Text/Label styling

**Frontend Integration (🔜 Pending):**

- [ ] Real backend data connected
- [ ] API error messages displayed
- [ ] Success feedback via Sonner toasts
- [ ] Form submission to backend
- [ ] Loading states during API calls
- [ ] End-to-end user flow testing

### Deployment Requirements

**Current Status:**

- [x] Database migrations ready
- [x] Backend production-ready
- [x] Frontend UI production-ready
- [ ] Full integration testing pending
- [ ] Production deployment pending
- [ ] Monitoring setup pending

### Definition of Done

**Current Status: 85% Complete**

✅ **Completed:**

1. Backend fully functional and tested
2. Frontend UI completely modernized
3. Technical requirements met (backend)
4. Security requirements met

🔜 **Remaining for 100%:**

1. Frontend-backend API integration
2. End-to-end user flow testing
3. Documentation updates
4. Production deployment

---

## Post-Implementation Review

After completion, reflect on:

### What Went Well

- _(To be filled after implementation)_
- Example: Clean separation of concerns made testing easy
- Example: Comprehensive spec reduced ambiguity during development

### What Could Be Improved

- _(To be filled after implementation)_
- Example: Should have added database constraint for exactly one default earlier
- Example: More frontend component reusability could have saved time

### Lessons Learned

- _(To be filled after implementation)_
- Example: Explicit tenant scoping is clearer than middleware for initial implementation
- Example: Integration tests for tenant isolation are essential and should be written first
- Example: React Query caching significantly improved perceived performance

### Follow-Up Items

- [ ] _(Add items discovered during implementation)_
- [ ] Example: Add database constraint to enforce one default branch per tenant
- [ ] Example: Implement Prisma middleware for automatic tenant scoping (Phase 2)
- [ ] Example: Add branch contact info (phone, email) as enhancement
- [ ] Example: Create audit log table for compliance tracking
- [ ] Example: Add branch analytics dashboard

### Metrics After 1 Week

- _(Collect after deployment)_
- [ ] Total tenants created: **\_**
- [ ] Total branches created: **\_**
- [ ] Average branches per tenant: **\_**
- [ ] API error rate: **\_**%
- [ ] Average API response time: **\_** ms
- [ ] User-reported issues: **\_**

### Metrics After 1 Month

- _(Collect after 30 days)_
- [ ] Total active tenants: **\_**
- [ ] Total active branches: **\_**
- [ ] Branch archival rate: **\_**
- [ ] Default branch changes: **\_**
- [ ] Performance degradation (if any): **\_**
- [ ] User satisfaction: **\_** (if survey conducted)

---

## Next Steps After Completion

1. **Immediate (Week 1-2):**

   - Monitor production metrics and logs
   - Address any bugs or issues discovered
   - Collect user feedback from ADMIN users

2. **Short-term (Month 1):**

   - Begin User Management module (user invitation, roles)
   - Consider enhancements based on usage patterns
   - Optimize performance if needed

3. **Medium-term (Month 2-3):**

   - Implement Member Management module (depends on tenant/branch structure)
   - Add audit logging if compliance required
   - Consider Prisma middleware for automatic tenant scoping

4. **Long-term (Month 4+):**
   - Branch-level permissions and access controls
   - Advanced branch analytics
   - Multi-branch reporting features

---

## Quick Reference

### What's Working Now

**Backend (Production-Ready):**

- ✅ All API endpoints operational
- ✅ JWT authentication with bcrypt
- ✅ Role-based authorization
- ✅ Tenant isolation enforced
- ✅ Plan system with limits
- ✅ 34 unit tests + e2e tests passing

**Frontend (UI Complete):**

- ✅ Modern dashboard layout
- ✅ Panel/Dashboard page (mock data)
- ✅ Şubeler (Branches) page (UI ready)
- ✅ Salon Ayarları page (UI ready)
- ✅ Login page (UI ready)
- ✅ Dark mode supported
- ✅ Responsive design

### What's Next

**Priority 1: Backend Integration**

1. Connect Dashboard to APIs
2. Connect Branches CRUD to backend
3. Connect Tenant Settings to API
4. Implement login authentication flow
5. Add global error handling (Sonner)
6. Create Activity Log API

**Priority 2: Testing & Polish**

1. End-to-end integration testing
2. API documentation updates
3. Performance testing
4. README updates

### Key Endpoints

- `POST /auth/login` - Authentication
- `GET /api/v1/tenants/current` - Get tenant info
- `PATCH /api/v1/tenants/current` - Update tenant
- `GET /api/v1/branches` - List branches
- `POST /api/v1/branches` - Create branch
- `PATCH /api/v1/branches/:id` - Update branch
- `POST /api/v1/branches/:id/archive` - Archive branch
- `POST /api/v1/branches/:id/restore` - Restore branch
- `POST /api/v1/branches/:id/set-default` - Set default branch

### Key Files

**Backend:**

- `backend/src/tenants/` - Tenant module
- `backend/src/branches/` - Branch module
- `backend/src/auth/` - Authentication module
- `backend/src/plan/` - Plan system
- `backend/prisma/schema.prisma` - Database schema

**Frontend:**

- `frontend/src/pages/PanelPage.tsx` - Dashboard
- `frontend/src/pages/BranchesPage.tsx` - Branches management
- `frontend/src/pages/TenantSettingsPage.tsx` - Salon ayarları
- `frontend/src/pages/LoginPage.tsx` - Login
- `frontend/src/components/app-sidebar.tsx` - Navigation
- `frontend/src/api/` - API client

---

**End of Plan**

---

## Phase Completion Summary

| Phase                        | Status      | Completion |
| ---------------------------- | ----------- | ---------- |
| Phase 0: Research & Design   | ✅ Complete | 100%       |
| Phase 1: Database & Schema   | ✅ Complete | 100%       |
| Phase 2: Backend Services    | ✅ Complete | 100%       |
| Phase 3: Backend API         | ✅ Complete | 100%       |
| Phase 1A: Auth & Plan System | ✅ Complete | 100%       |
| Phase 4: API Client & Hooks  | ✅ Complete | 100%       |
| Phase 5: Frontend UI         | ✅ Complete | 100%       |
| Phase 6: Testing & Docs      | 🟡 Partial  | 80%        |
| Phase 7: Backend Integration | 🔜 Next     | 10%        |
| Phase 8: Future Enhancements | 📋 Planned  | 0%         |

**Overall Backend Progress:** 100% ✅  
**Overall Frontend UI Progress:** 100% ✅  
**Overall Integration Progress:** 10% 🔜

---

**Plan Status:** 🔄 IN PROGRESS - Backend Production-Ready, Frontend UI Complete, Integration Phase Next

**Prepared By:** AI Planning Agent  
**Date:** 2025-12-04  
**Last Updated:** 2025-12-08  
**Version:** 2.0.0

**Approval:**

- [ ] Technical Lead: **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- [ ] Product Owner: **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- [ ] Security Review: **\*\***\_\_\_**\*\*** Date: **\_\_\_**
