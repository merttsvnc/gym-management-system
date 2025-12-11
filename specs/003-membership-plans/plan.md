# Implementation Plan: Membership Plan Management

**Version:** 1.0.0  
**Created:** 2025-01-20  
**Updated:** 2025-01-20  
**Status:** Planning

---

## Overview

### Feature Summary

The Membership Plan Management module introduces a first-class `MembershipPlan` entity to replace the current string-based `membershipType` field on Member records. This enables consistent plan definitions across tenants, automatic membership end date calculation based on plan duration, and enforcement of business rules such as pricing, freeze policies, and auto-renewal settings.

**Key Changes:**
- New `MembershipPlan` entity with tenant ownership and full CRUD operations
- Member model migration: replace `membershipType` string with `membershipPlanId` foreign key
- Automatic membership end date calculation based on plan duration
- Plan archival protection (plans with active members cannot be deleted)
- Tenant-scoped plan isolation

### Related Specification

`/Users/mertsevinc/Project/gym-management-system/specs/003-membership-plans/spec.md`

### Estimated Effort

10-12 person-days (including migration, testing, and documentation)

---

## Technical Context

### Current State

**Backend:**
- NestJS application with Prisma ORM
- Member model uses `membershipType: String` field
- Member service calculates default end date as 1 year from start date
- Tenant isolation enforced via `tenantId` filtering
- JWT authentication with tenant claims
- Authorization guards (JwtAuthGuard, RolesGuard) in place

**Frontend:**
- React + Vite + TypeScript
- shadcn/ui components + Tailwind CSS
- React Query for data fetching
- Member creation form accepts `membershipType` as optional string

**Database:**
- PostgreSQL via Prisma
- Existing Member model has `membershipType`, `membershipStartAt`, `membershipEndAt` fields
- Tenant model exists with `defaultCurrency` field

### Technology Stack

- **Backend:** NestJS, Prisma, PostgreSQL, TypeScript (strict mode)
- **Frontend:** React, Vite, TypeScript, shadcn/ui, Tailwind CSS, React Query
- **Date Libraries:** JavaScript native Date API (month arithmetic handled via date-fns or similar)
- **Validation:** class-validator (backend), Zod (frontend, if used)

### Dependencies

**Internal:**
- Tenant management module (for tenant isolation)
- Member management module (requires modification)
- Auth module (for JWT and authorization)

**External:**
- Prisma Client (already in use)
- class-validator (already in use)
- date-fns or similar for month arithmetic (to be evaluated)

### Integration Points

1. **Member Service:** Must be updated to:
   - Accept `membershipPlanId` instead of `membershipType`
   - Calculate `membershipEndDate` from plan duration
   - Validate plan belongs to tenant
   - Store optional `membershipPriceAtPurchase`

2. **Member DTOs:** Update `CreateMemberDto` and `UpdateMemberDto` to use plan references

3. **Frontend Member Forms:** Replace `membershipType` dropdown with plan selector component

4. **Frontend API Client:** Add membership plan endpoints to API client

### Unknowns & Research Needed

1. **Date Calculation Library:** 
   - **Decision Needed:** Which library for month arithmetic (date-fns, date-fns-tz, or native Date with custom logic)?
   - **Rationale:** Need reliable month-end clamping (Jan 31 + 1 month = Feb 28/29)
   - **Research Task:** Evaluate date-fns vs native Date API for month arithmetic

2. **Migration Strategy:**
   - **Decision Needed:** Single migration vs multi-step migration?
   - **Rationale:** Need to create plans from existing `membershipType` values, then update members
   - **Research Task:** Best practices for Prisma migrations with data transformation

3. **Currency Validation:**
   - **Decision Needed:** How to validate ISO 4217 currency codes?
   - **Rationale:** Need to ensure valid currency codes (e.g., "JPY", "USD", "EUR")
   - **Research Task:** Find lightweight ISO 4217 validation library or implement regex validation

---

## Constitution Compliance Check

Before proceeding, verify alignment with core constitutional principles:

- [x] **Long-Term Maintainability:** Is this approach maintainable by future developers?

  - ✅ Proper domain model with explicit MembershipPlan entity
  - ✅ Clear separation of plan management from member management
  - ✅ Explicit business rules documented in spec (duration calculation, archival protection)
  - ✅ TypeScript strict mode with proper types
  - ✅ Migration strategy preserves data integrity

- [x] **Security & Correctness:** Are security and correctness prioritized over simplicity?

  - ✅ Tenant isolation enforced at database level (foreign keys, indexes)
  - ✅ Tenant isolation enforced at application level (service layer filtering)
  - ✅ Plan assignment validates tenant match (member.tenantId === plan.tenantId)
  - ✅ Authorization checks for ADMIN-only plan operations
  - ✅ Validation rules explicit and testable (duration ranges, currency codes)

- [x] **Explicit Domain Rules:** Are business rules explicit, testable, and documented?

  - ✅ Duration calculation rules documented with examples (DAYS vs MONTHS)
  - ✅ Month-end clamping logic explicitly defined (Jan 31 + 1 month = Feb 28/29)
  - ✅ Plan archival protection rules explicit (active member definition)
  - ✅ Plan name uniqueness rules explicit (per tenant, case-insensitive)
  - ✅ All critical rules have unit tests planned

- [x] **Layered Architecture:** Is business logic separated from infrastructure and presentation?

  - ✅ Domain logic in service layer (duration calculation, archival checks)
  - ✅ Controllers handle HTTP only (validation, response formatting)
  - ✅ DTOs separate from domain entities
  - ✅ Frontend components handle presentation only
  - ✅ Business rules testable without HTTP/DB dependencies

- [x] **Multi-Tenant Isolation:** Is tenant isolation enforced at all layers?

  - ✅ Database: `tenantId` foreign key on MembershipPlan
  - ✅ Database: Unique constraint on `(tenantId, name)` for plan names
  - ✅ Application: All plan queries filter by `tenantId`
  - ✅ Application: Plan assignment validates tenant match
  - ✅ API: Tenant ID extracted from JWT token
  - ✅ Frontend: Plan lists filtered by authenticated tenant

- [x] **Data Integrity:** Are migrations backward compatible and reviewed?

  - ✅ Migration strategy preserves existing `membershipType` data
  - ✅ Migration creates plans from existing data before removing field
  - ✅ Rollback plan documented (restore `membershipType` from backup)
  - ✅ Foreign key constraints ensure referential integrity
  - ✅ Unique constraints prevent duplicate plan names per tenant

- [x] **Professional UI/UX:** Does the UI support fast, daily workflows with clear status indicators?

  - ✅ Plan list page with filters and search
  - ✅ Plan creation form with validation feedback
  - ✅ Plan selection dropdown in member forms
  - ✅ Duration preview in member creation (shows calculated end date)
  - ✅ Status badges for ACTIVE/ARCHIVED plans
  - ✅ Warning messages for archival with active members

- [x] **Performance & Scalability:** Are indexes, pagination, and efficient queries planned?

  - ✅ Indexes planned: `[tenantId]`, `[tenantId, status]`, `[tenantId, sortOrder]` on MembershipPlan
  - ✅ Indexes planned: `[membershipPlanId]`, `[tenantId, membershipPlanId]` on Member
  - ✅ Plan list endpoint paginated (default 20, max 100)
  - ✅ Active plans endpoint optimized for dropdowns (no pagination, cached)
  - ✅ Eager loading for member-plan relationships (Prisma `include`)

- [x] **Testing Coverage:** Are critical paths covered by unit and integration tests?

  - ✅ Unit tests planned: Duration calculation (DAYS and MONTHS)
  - ✅ Unit tests planned: Plan name uniqueness validation
  - ✅ Unit tests planned: Archival protection logic
  - ✅ Integration tests planned: All API endpoints
  - ✅ Integration tests planned: Tenant isolation (cross-tenant access blocked)
  - ✅ Edge cases documented and testable (month-end clamping, zero-price plans)

**All constitutional principles satisfied. ✅**

---

## Implementation Phases

### Phase 0: Research & Design

**Goal:** Resolve all technical unknowns and finalize design decisions

**Tasks:**
1. [ ] Research date calculation libraries for month arithmetic
   - Evaluate date-fns `addMonths` vs native Date API
   - Test month-end clamping behavior (Jan 31 + 1 month)
   - Decision: Use date-fns `addMonths` (handles month-end clamping correctly)
   - Estimated effort: 1 hour

2. [ ] Research Prisma migration best practices for data transformation
   - Review multi-step migration patterns
   - Plan migration script for creating plans from `membershipType` values
   - Decision: Use Prisma migration with raw SQL for data transformation
   - Estimated effort: 2 hours

3. [ ] Research ISO 4217 currency code validation
   - Evaluate libraries vs regex validation
   - Decision: Use regex validation (3 uppercase letters) + maintain list of common codes
   - Estimated effort: 1 hour

**Deliverables:**
- `research.md` with all decisions documented
- Technical approach finalized

**Testing:**
- N/A (research phase)

**Review Points:**
- All unknowns resolved
- Migration strategy approved
- Date calculation approach validated

---

### Phase 1: Database Schema & Migration

**Goal:** Create MembershipPlan model and migrate existing Member data

**Tasks:**
1. [ ] Update Prisma schema with MembershipPlan model
   - Add MembershipPlan model with all fields
   - Add DurationType and PlanStatus enums
   - Add `membershipPlanId` and `membershipPriceAtPurchase` to Member model
   - Keep `membershipType` temporarily (nullable) for migration
   - Estimated effort: 2 hours
   - Dependencies: None
   - Files affected: `backend/prisma/schema.prisma`

2. [ ] Create migration for MembershipPlan table
   - Generate Prisma migration
   - Add indexes: `[tenantId]`, `[tenantId, status]`, `[tenantId, sortOrder]`
   - Add unique constraint: `@@unique([tenantId, name])`
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/prisma/migrations/`

3. [ ] Create migration for Member model changes
   - Add `membershipPlanId` column (nullable initially)
   - Add `membershipPriceAtPurchase` column (nullable)
   - Keep `membershipType` column (will be removed in later migration)
   - Add foreign key constraint
   - Add indexes: `[membershipPlanId]`, `[tenantId, membershipPlanId]`
   - Estimated effort: 1 hour
   - Dependencies: Task 2
   - Files affected: `backend/prisma/migrations/`

4. [ ] Create data migration script
   - Script to create plans from existing `membershipType` values per tenant
   - Assign members to plans based on `membershipType`
   - Set default values: durationType=MONTHS, durationValue=12, price=0, currency from tenant.defaultCurrency or "TRY"
   - Estimated effort: 4 hours
   - Dependencies: Task 3
   - Files affected: `backend/prisma/migrations/` (data migration script)

5. [ ] Create final migration to remove `membershipType` column
   - Remove `membershipType` column after data migration verified
   - Make `membershipPlanId` NOT NULL
   - Estimated effort: 1 hour
   - Dependencies: Task 4
   - Files affected: `backend/prisma/migrations/`

**Deliverables:**
- Updated Prisma schema
- Migration files (3 migrations: table creation, member changes, data migration, column removal)
- Data migration script tested and verified

**Testing:**
- Test migrations on development database
- Verify data integrity after migration
- Test rollback procedure

**Review Points:**
- Schema reviewed for correctness
- Migration strategy approved
- Data migration script tested

---

### Phase 2: Backend Domain & Service Layer

**Goal:** Implement business logic for plan management and member-plan integration

**Tasks:**
1. [ ] Create duration calculation utility
   - Function to calculate end date from start date + duration
   - Handle DAYS duration type (simple date addition)
   - Handle MONTHS duration type (month-end clamping)
   - Unit tests for edge cases (Jan 31 + 1 month, leap years)
   - Estimated effort: 3 hours
   - Dependencies: Phase 0 research complete
   - Files affected: `backend/src/membership-plans/utils/duration-calculator.ts`, `backend/src/membership-plans/utils/duration-calculator.spec.ts`

2. [ ] Create MembershipPlansService
   - CRUD operations (create, findAll, findOne, update, delete)
   - Tenant isolation enforced in all queries
   - Plan name uniqueness validation (case-insensitive)
   - Duration value validation (strict ranges: DAYS 1-730, MONTHS 1-24)
   - Currency validation (ISO 4217 format)
   - Estimated effort: 6 hours
   - Dependencies: Task 1
   - Files affected: `backend/src/membership-plans/membership-plans.service.ts`, `backend/src/membership-plans/membership-plans.service.spec.ts`

3. [ ] Implement plan archival protection logic
   - Method to check active member count (status=ACTIVE AND membershipEndDate>=today)
   - Prevent deletion if plan has any members
   - Allow archival with warning if active members exist
   - Estimated effort: 2 hours
   - Dependencies: Task 2
   - Files affected: `backend/src/membership-plans/membership-plans.service.ts`

4. [ ] Update MembersService to use plans
   - Modify `create()` to accept `membershipPlanId` instead of `membershipType`
   - Validate plan exists and is ACTIVE
   - Validate plan belongs to tenant
   - Calculate `membershipEndDate` using duration calculator
   - Set `membershipPriceAtPurchase` (default to plan price)
   - Estimated effort: 4 hours
   - Dependencies: Task 1, Task 2
   - Files affected: `backend/src/members/members.service.ts`

5. [ ] Update Member DTOs
   - Update `CreateMemberDto`: replace `membershipType` with `membershipPlanId` (required)
   - Update `CreateMemberDto`: remove `membershipEndAt` (calculated automatically)
   - Update `CreateMemberDto`: add optional `membershipPriceAtPurchase`
   - Update `UpdateMemberDto`: disallow `membershipPlanId` changes (v1 restriction)
   - Estimated effort: 2 hours
   - Dependencies: Task 4
   - Files affected: `backend/src/members/dto/create-member.dto.ts`, `backend/src/members/dto/update-member.dto.ts`

**Deliverables:**
- Duration calculation utility with tests
- MembershipPlansService with full CRUD and business logic
- Updated MembersService integrated with plans
- Updated DTOs

**Testing:**
- Unit tests for duration calculation (all edge cases)
- Unit tests for plan service (CRUD, validation, archival protection)
- Unit tests for member service integration

**Review Points:**
- Business logic correct and testable
- Tenant isolation verified
- Duration calculation handles all edge cases

---

### Phase 3: Backend API Controllers

**Goal:** Implement HTTP endpoints for plan management

**Tasks:**
1. [ ] Create MembershipPlansController
   - GET `/api/v1/membership-plans` (list with pagination, filters)
   - GET `/api/v1/membership-plans/active` (active plans only, no pagination)
   - GET `/api/v1/membership-plans/:id` (single plan)
   - POST `/api/v1/membership-plans` (create plan)
   - PATCH `/api/v1/membership-plans/:id` (update plan)
   - POST `/api/v1/membership-plans/:id/archive` (archive plan)
   - POST `/api/v1/membership-plans/:id/restore` (restore plan)
   - DELETE `/api/v1/membership-plans/:id` (delete plan, only if no members)
   - Estimated effort: 4 hours
   - Dependencies: Phase 2 complete
   - Files affected: `backend/src/membership-plans/membership-plans.controller.ts`

2. [ ] Create plan DTOs
   - `CreatePlanDto` with validation decorators
   - `UpdatePlanDto` with optional fields
   - `PlanListQueryDto` for list endpoint query params
   - Estimated effort: 2 hours
   - Dependencies: None
   - Files affected: `backend/src/membership-plans/dto/create-plan.dto.ts`, `backend/src/membership-plans/dto/update-plan.dto.ts`, `backend/src/membership-plans/dto/plan-list-query.dto.ts`

3. [ ] Create MembershipPlansModule
   - Import PrismaModule
   - Provide MembershipPlansService
   - Export MembershipPlansService (for use in MembersModule)
   - Estimated effort: 1 hour
   - Dependencies: Task 1, Task 2
   - Files affected: `backend/src/membership-plans/membership-plans.module.ts`

4. [ ] Register module in AppModule
   - Import MembershipPlansModule
   - Estimated effort: 15 minutes
   - Dependencies: Task 3
   - Files affected: `backend/src/app.module.ts`

5. [ ] Update MembersController
   - Update `create()` endpoint to use new DTO (with `membershipPlanId`)
   - Update response to include plan details (if requested via query param)
   - Estimated effort: 1 hour
   - Dependencies: Phase 2 Task 5
   - Files affected: `backend/src/members/members.controller.ts`

**Deliverables:**
- Complete REST API for plan management
- Updated member creation endpoint
- All endpoints protected with JWT and role guards

**Testing:**
- Integration tests for all plan endpoints
- Integration tests for updated member creation endpoint
- Tenant isolation tests (cross-tenant access blocked)

**Review Points:**
- API contracts match spec
- Error handling appropriate
- Authorization checks in place

---

### Phase 4: Frontend API Client & Hooks

**Goal:** Create frontend API integration for plan management

**Tasks:**
1. [ ] Create membership plans API client
   - `listPlans()` with query params
   - `getActivePlans()` (no pagination)
   - `getPlan(id)`
   - `createPlan(data)`
   - `updatePlan(id, data)`
   - `archivePlan(id)`
   - `restorePlan(id)`
   - `deletePlan(id)`
   - Estimated effort: 2 hours
   - Dependencies: Phase 3 complete
   - Files affected: `frontend/src/api/membership-plans.ts`

2. [ ] Create React Query hooks
   - `useMembershipPlans()` (list with filters)
   - `useActivePlans()` (active plans for dropdowns)
   - `useMembershipPlan(id)` (single plan)
   - `useCreatePlan()`, `useUpdatePlan()`, `useArchivePlan()`, `useRestorePlan()`, `useDeletePlan()` (mutations)
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files affected: `frontend/src/hooks/use-membership-plans.ts`

3. [ ] Update shared TypeScript types
   - Add `MembershipPlan` interface
   - Add `DurationType` and `PlanStatus` enums
   - Update `Member` interface (remove `membershipType`, add `membershipPlanId`, `membershipPriceAtPurchase`)
   - Estimated effort: 1 hour
   - Dependencies: None
   - Files affected: `frontend/src/types/member.ts`, `frontend/src/types/membership-plan.ts`

4. [ ] Update member API client
   - Update `createMember()` to use new request structure
   - Update types for member creation/update
   - Estimated effort: 1 hour
   - Dependencies: Task 3
   - Files affected: `frontend/src/api/members.ts`

**Deliverables:**
- Complete API client for plan management
- React Query hooks for data fetching
- Updated shared types

**Testing:**
- Manual testing of API calls
- Verify error handling

**Review Points:**
- API client matches backend contracts
- Types match backend DTOs
- Hooks follow React Query best practices

---

### Phase 5: Frontend UI Components

**Goal:** Build plan management UI and update member forms

**Tasks:**
1. [ ] Create PlanSelector component
   - Dropdown for selecting plans (shadcn Select)
   - Shows only ACTIVE plans
   - Displays plan name, duration preview, price
   - Estimated effort: 3 hours
   - Dependencies: Phase 4 complete
   - Files affected: `frontend/src/components/membership-plans/PlanSelector.tsx`

2. [ ] Create DurationPreview component
   - Calculates and displays end date from start date + duration
   - Shows: "Membership will end on: [date]"
   - Updates when start date or plan changes
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files affected: `frontend/src/components/membership-plans/DurationPreview.tsx`

3. [ ] Create PlanForm component
   - Reusable form for create/edit
   - Fields: name, description, duration type/value, price, currency, freeze days, auto-renew, sort order
   - Validation with Turkish error messages
   - Estimated effort: 4 hours
   - Dependencies: Phase 4 complete
   - Files affected: `frontend/src/components/membership-plans/PlanForm.tsx`

4. [ ] Create PlanCard component
   - Card displaying plan details
   - Shows: Name, duration, price, status badge
   - Actions: Edit, Archive/Restore
   - Estimated effort: 2 hours
   - Dependencies: Phase 4 complete
   - Files affected: `frontend/src/components/membership-plans/PlanCard.tsx`

5. [ ] Create PlanStatusBadge component
   - Badge for ACTIVE/ARCHIVED status
   - Color coding: ACTIVE = green, ARCHIVED = gray
   - Estimated effort: 1 hour
   - Dependencies: None
   - Files affected: `frontend/src/components/membership-plans/PlanStatusBadge.tsx`

6. [ ] Create Plan List page
   - Table view with filters (status, search)
   - Pagination
   - Actions: Create, Edit, Archive, Restore
   - Estimated effort: 4 hours
   - Dependencies: Tasks 3, 4, 5
   - Files affected: `frontend/src/pages/MembershipPlansPage.tsx`

7. [ ] Create Create Plan page
   - Form page using PlanForm
   - Success redirect to plan list
   - Estimated effort: 2 hours
   - Dependencies: Task 3
   - Files affected: `frontend/src/pages/CreatePlanPage.tsx`

8. [ ] Create Edit Plan page
   - Form page using PlanForm (pre-filled)
   - Warning banner if plan has active members
   - Archive/Restore button in header
   - Estimated effort: 3 hours
   - Dependencies: Task 3
   - Files affected: `frontend/src/pages/EditPlanPage.tsx`

9. [ ] Update MemberForm component
   - Replace `membershipType` input with `PlanSelector`
   - Add `DurationPreview` component
   - Add optional `membershipStartDate` date picker (defaults to today)
   - Remove `membershipEndDate` input (calculated automatically)
   - Estimated effort: 3 hours
   - Dependencies: Tasks 1, 2
   - Files affected: `frontend/src/components/members/MemberForm.tsx`

10. [ ] Update MemberDetail page
    - Display plan name and details (with link to plan)
    - Show purchase price if stored
    - Plan change: Disabled in v1 (show message)
    - Estimated effort: 2 hours
    - Dependencies: Phase 4 complete
    - Files affected: `frontend/src/pages/MemberDetailPage.tsx`

11. [ ] Add routes for plan pages
    - `/membership-plans` (list)
    - `/membership-plans/new` (create)
    - `/membership-plans/:id/edit` (edit)
    - Estimated effort: 1 hour
    - Dependencies: Tasks 6, 7, 8
    - Files affected: `frontend/src/App.tsx` or router config

**Deliverables:**
- Complete plan management UI (list, create, edit)
- Updated member forms with plan selection
- All components follow shadcn/ui design system

**Testing:**
- Manual testing of all user flows
- Verify form validation
- Verify error handling
- Verify loading states

**Review Points:**
- UI matches design requirements
- Forms validate correctly
- User flows are intuitive

---

### Phase 6: Testing & Documentation

**Goal:** Complete test coverage and update documentation

**Tasks:**
1. [ ] Write unit tests for duration calculation
   - Test DAYS duration (simple addition)
   - Test MONTHS duration (month-end clamping)
   - Test edge cases (Jan 31 + 1 month, leap years, year boundaries)
   - Estimated effort: 2 hours
   - Dependencies: Phase 2 Task 1
   - Files affected: `backend/src/membership-plans/utils/duration-calculator.spec.ts`

2. [ ] Write unit tests for MembershipPlansService
   - Test CRUD operations
   - Test tenant isolation
   - Test plan name uniqueness validation
   - Test duration value validation (strict ranges)
   - Test currency validation
   - Test archival protection logic
   - Estimated effort: 4 hours
   - Dependencies: Phase 2 Task 2
   - Files affected: `backend/src/membership-plans/membership-plans.service.spec.ts`

3. [ ] Write integration tests for plan endpoints
   - Test all endpoints (create, list, get, update, archive, restore, delete)
   - Test tenant isolation (cross-tenant access blocked)
   - Test validation errors
   - Test archival protection (cannot delete plan with members)
   - Estimated effort: 4 hours
   - Dependencies: Phase 3 complete
   - Files affected: `backend/test/membership-plans.e2e-spec.ts`

4. [ ] Write integration tests for member-plan integration
   - Test member creation with plan (end date calculated correctly)
   - Test plan validation (plan must be ACTIVE, belong to tenant)
   - Test member detail includes plan information
   - Estimated effort: 2 hours
   - Dependencies: Phase 3 complete
   - Files affected: `backend/test/members/members.e2e-spec.ts` (update existing)

5. [ ] Update API documentation
   - Update OpenAPI/Swagger spec with plan endpoints
   - Document request/response examples
   - Estimated effort: 2 hours
   - Dependencies: Phase 3 complete
   - Files affected: API documentation files

6. [ ] Write migration guide
   - Document migration steps
   - Document rollback procedure
   - Document post-migration verification steps
   - Estimated effort: 2 hours
   - Dependencies: Phase 1 complete
   - Files affected: `backend/docs/migration-guide-membership-plans.md`

7. [ ] Update README
   - Add plan management section
   - Update member management section
   - Estimated effort: 1 hour
   - Dependencies: All phases complete
   - Files affected: `backend/README.md`, `frontend/README.md`

**Deliverables:**
- Complete test coverage (unit + integration)
- Updated API documentation
- Migration guide
- Updated README files

**Testing:**
- All tests passing
- Test coverage meets requirements

**Review Points:**
- Test coverage adequate
- Documentation complete and accurate

---

## Dependencies

### External Dependencies

- **date-fns** (or similar): For reliable month arithmetic with month-end clamping
  - Decision: Use date-fns `addMonths` function
  - Installation: `npm install date-fns`

### Internal Dependencies

- **Tenant Management Module:** Required for tenant isolation (already exists)
- **Member Management Module:** Requires modification (already exists)
- **Auth Module:** Required for JWT and authorization (already exists)

### Blocking Issues

None identified. All dependencies are already in place.

---

## Database Changes

### New Tables/Models

**MembershipPlan Model:**
```prisma
model MembershipPlan {
  id           String      @id @default(cuid())
  tenantId     String
  name         String
  description  String?
  durationType String      // "DAYS" or "MONTHS"
  durationValue Int
  price        Decimal     @db.Decimal(10, 2)
  currency     String      // ISO 4217 code
  maxFreezeDays Int?
  autoRenew    Boolean     @default(false)
  status       String      // "ACTIVE" or "ARCHIVED"
  sortOrder    Int?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  members Member[]

  @@unique([tenantId, name])
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

### Schema Modifications

**Member Model Changes:**
- **REMOVED:** `membershipType: String`
- **ADDED:** `membershipPlanId: String` (required, foreign key)
- **ADDED:** `membershipPriceAtPurchase: Decimal?` (optional)
- **KEPT:** `membershipStartAt: DateTime`, `membershipEndAt: DateTime` (unchanged)

### Migrations

**Migration 1: Create MembershipPlan table**
- Backward compatible: Yes (new table)
- Data migration required: No
- Risks: None

**Migration 2: Add plan fields to Member**
- Backward compatible: Yes (`membershipPlanId` nullable initially, `membershipType` kept)
- Data migration required: Yes (create plans from `membershipType`, assign members)
- Risks: Data loss if migration script fails (mitigation: backup `membershipType` before migration)

**Migration 3: Remove `membershipType` column**
- Backward compatible: No (removes column)
- Data migration required: No (data already migrated)
- Risks: Cannot rollback easily (mitigation: keep backup of `membershipType` values)

### Index Strategy

**MembershipPlan indexes:**
- `@@index([tenantId])`: Tenant-scoped queries
- `@@index([tenantId, status])`: Filter active plans efficiently
- `@@index([tenantId, sortOrder])`: Ordered plan lists
- `@@unique([tenantId, name])`: Enforce name uniqueness per tenant

**Member indexes:**
- `@@index([membershipPlanId])`: Plan-member relationship queries
- `@@index([tenantId, membershipPlanId])`: Count members per plan per tenant

---

## API Changes

### New Endpoints

**Plan Management:**
- `GET /api/v1/membership-plans` - List plans (paginated, filtered)
- `GET /api/v1/membership-plans/active` - Get active plans (no pagination)
- `GET /api/v1/membership-plans/:id` - Get single plan
- `POST /api/v1/membership-plans` - Create plan
- `PATCH /api/v1/membership-plans/:id` - Update plan
- `POST /api/v1/membership-plans/:id/archive` - Archive plan
- `POST /api/v1/membership-plans/:id/restore` - Restore plan
- `DELETE /api/v1/membership-plans/:id` - Delete plan (only if no members)

### Modified Endpoints

**Member Management:**
- `POST /api/v1/members` - Updated request: `membershipPlanId` (required) instead of `membershipType` (optional), `membershipEndAt` removed (calculated automatically)
- `PATCH /api/v1/members/:id` - Updated: `membershipPlanId` not accepted (v1 restriction)
- `GET /api/v1/members/:id` - Updated response: includes `membershipPlanId`, optional `membershipPlan` object (if `includePlan` query param)

### Contract Updates

**New Types:**
- `MembershipPlan` interface
- `DurationType` enum ("DAYS" | "MONTHS")
- `PlanStatus` enum ("ACTIVE" | "ARCHIVED")
- `CreatePlanDto`, `UpdatePlanDto`, `PlanListQueryDto`

**Modified Types:**
- `CreateMemberDto`: `membershipPlanId: string` (required), removed `membershipType`, removed `membershipEndAt`
- `Member` interface: `membershipPlanId: string`, `membershipPriceAtPurchase?: number`, removed `membershipType`

---

## Frontend Changes

### New Components

1. **PlanSelector** (`components/membership-plans/PlanSelector.tsx`)
   - Dropdown for selecting plans
   - Shows only ACTIVE plans
   - Displays plan details

2. **DurationPreview** (`components/membership-plans/DurationPreview.tsx`)
   - Calculates and displays end date preview
   - Updates reactively

3. **PlanForm** (`components/membership-plans/PlanForm.tsx`)
   - Reusable form for create/edit
   - All plan fields with validation

4. **PlanCard** (`components/membership-plans/PlanCard.tsx`)
   - Card displaying plan details
   - Actions: Edit, Archive/Restore

5. **PlanStatusBadge** (`components/membership-plans/PlanStatusBadge.tsx`)
   - Status badge component

### Modified Components

1. **MemberForm** (`components/members/MemberForm.tsx`)
   - Replace `membershipType` input with `PlanSelector`
   - Add `DurationPreview`
   - Add optional `membershipStartDate` picker
   - Remove `membershipEndDate` input

2. **MemberDetail** (`pages/MemberDetailPage.tsx`)
   - Display plan information
   - Show purchase price

### New Routes

- `/membership-plans` - Plan list page
- `/membership-plans/new` - Create plan page
- `/membership-plans/:id/edit` - Edit plan page

### State Management

**New API Client:**
- `api/membership-plans.ts` - Plan CRUD operations

**New React Query Hooks:**
- `useMembershipPlans()` - List plans
- `useActivePlans()` - Active plans for dropdowns
- `useMembershipPlan(id)` - Single plan
- Mutations: `useCreatePlan()`, `useUpdatePlan()`, `useArchivePlan()`, `useRestorePlan()`, `useDeletePlan()`

**Updated Hooks:**
- `useCreateMember()` - Updated to use `membershipPlanId`

---

## Testing Strategy

### Unit Tests

**Duration Calculator:**
- DAYS duration: Simple date addition
- MONTHS duration: Month-end clamping (Jan 31 + 1 month = Feb 28/29)
- Edge cases: Leap years, year boundaries, various month lengths

**MembershipPlansService:**
- CRUD operations
- Tenant isolation (queries filter by tenantId)
- Plan name uniqueness validation (case-insensitive, per tenant)
- Duration value validation (strict ranges: DAYS 1-730, MONTHS 1-24)
- Currency validation (ISO 4217 format)
- Archival protection (check active members, prevent deletion)

**MembersService Integration:**
- Member creation with plan (end date calculated correctly)
- Plan validation (plan exists, is ACTIVE, belongs to tenant)
- Purchase price defaulting (to plan price if not provided)

### Integration Tests

**Plan Endpoints:**
- `GET /api/v1/membership-plans` - List with pagination, filters
- `GET /api/v1/membership-plans/active` - Active plans only
- `GET /api/v1/membership-plans/:id` - Single plan
- `POST /api/v1/membership-plans` - Create with validation
- `PATCH /api/v1/membership-plans/:id` - Update plan
- `POST /api/v1/membership-plans/:id/archive` - Archive with active members warning
- `POST /api/v1/membership-plans/:id/restore` - Restore archived plan
- `DELETE /api/v1/membership-plans/:id` - Cannot delete if plan has members

**Tenant Isolation:**
- Plan from Tenant A not accessible to Tenant B (403 Forbidden)
- Cross-tenant plan assignment returns 403
- Plan list filtered by authenticated tenant

**Member-Plan Integration:**
- Member creation with plan (end date calculated correctly)
- Member creation with invalid plan (404 or 403)
- Member creation with archived plan (400 error)
- Member detail includes plan information

### Manual Testing Checklist

- [ ] Create plan with all fields
- [ ] Create plan with duplicate name (should fail)
- [ ] Create plan with invalid duration value (should fail)
- [ ] Update plan (existing members unaffected)
- [ ] Archive plan with active members (warning shown)
- [ ] Archive plan with no active members (succeeds)
- [ ] Delete plan with members (should fail)
- [ ] Delete plan with no members (succeeds)
- [ ] Create member with plan (end date calculated correctly)
- [ ] Create member with invalid plan (should fail)
- [ ] Member detail shows plan information
- [ ] Plan list filtered by status
- [ ] Plan list search by name
- [ ] Plan selection dropdown shows only ACTIVE plans

---

## Rollout Strategy

### Feature Flags

Not required. This is a core feature that replaces existing functionality. Migration handles backward compatibility.

### Deployment Plan

**Phase 1: Backend Deployment**
1. Deploy backend with new schema (migrations run automatically)
2. Run data migration script manually (or via migration)
3. Verify data integrity
4. Monitor for errors

**Phase 2: Frontend Deployment**
1. Deploy frontend with new UI
2. Verify plan management pages work
3. Verify member creation with plans works
4. Monitor for errors

**Rollback Plan:**
- Backend: Keep `membershipType` column backup, restore if needed
- Frontend: Revert to previous version (plan selection disabled, fallback to string input)

### Monitoring

**Key Metrics:**
- Plan creation rate
- Member creation success rate (with plan selection)
- API response times for plan endpoints
- Error rates (validation errors, tenant isolation violations)

**Error Rates:**
- 400 errors (validation failures)
- 403 errors (tenant isolation violations)
- 500 errors (server errors)

**Performance Indicators:**
- Plan list query time (< 300ms target)
- Active plans dropdown load time (< 200ms target)
- Member creation with plan (< 1s target)

---

## Documentation Updates

### Code Documentation

- [ ] Inline comments for duration calculation logic (month-end clamping)
- [ ] Inline comments for archival protection logic (active member definition)
- [ ] JSDoc for MembershipPlansService methods
- [ ] JSDoc for duration calculator utility

### External Documentation

- [ ] README updated with plan management section
- [ ] API documentation updated (OpenAPI/Swagger)
- [ ] Migration guide written
- [ ] User guide for plan management (if applicable)

### Specification Updates

- [ ] Update spec if implementation deviates from original design
- [ ] Document any deferred enhancements (plan changes for existing members)

---

## Risk Assessment

### Technical Risks

**Risk 1: Data Migration Failure**
- **Likelihood:** Low
- **Impact:** High
- **Mitigation:** 
  - Backup `membershipType` values before migration
  - Test migration script on development database
  - Rollback plan documented
  - Run migration during low-traffic period

**Risk 2: Month-End Clamping Logic Errors**
- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Use proven library (date-fns) instead of custom logic
  - Comprehensive unit tests for edge cases
  - Manual testing of various date combinations

**Risk 3: Performance Issues with Plan Queries**
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:**
  - Proper indexes on `tenantId`, `status`, `sortOrder`
  - Pagination for plan lists
  - Caching for active plans dropdown
  - Monitor query performance

### Security Risks

**Risk 1: Tenant Isolation Violation**
- **Mitigation:**
  - Database foreign keys enforce tenant relationship
  - Service layer filters all queries by `tenantId`
  - Integration tests verify cross-tenant access blocked
  - Code review focuses on tenant isolation

**Risk 2: Plan Assignment Validation Bypass**
- **Mitigation:**
  - Validate plan belongs to tenant in service layer
  - DTO validation ensures plan ID format
  - Integration tests verify validation

### Performance Risks

**Risk 1: N+1 Queries for Member-Plan Relationships**
- **Mitigation:**
  - Use Prisma `include` to eager-load plans
  - Index on `membershipPlanId` for efficient joins
  - Monitor query performance

**Risk 2: Plan List Performance with Many Plans**
- **Mitigation:**
  - Pagination implemented (default 20, max 100)
  - Indexes on `tenantId`, `status`, `sortOrder`
  - Cache active plans list (used in dropdowns)

---

## Success Criteria

How will we know this feature is successfully implemented?

- [x] All acceptance criteria from spec met
  - [ ] Data model integrity: 100% tenant isolation, referential integrity maintained
  - [ ] Plan management operations: CRUD works, archival protection enforced
  - [ ] Member integration: End dates calculated correctly, migration successful
  - [ ] User experience: UI intuitive, validation feedback clear
  - [ ] Performance: Queries meet targets (< 300ms plan list, < 200ms plan lookup)

- [ ] All tests passing
  - [ ] Unit tests: Duration calculation, plan service, validation
  - [ ] Integration tests: All endpoints, tenant isolation, edge cases

- [ ] No critical security issues
  - [ ] Tenant isolation verified by tests
  - [ ] Authorization checks in place
  - [ ] Input validation comprehensive

- [ ] Performance requirements met
  - [ ] Plan list < 300ms
  - [ ] Active plans dropdown < 200ms
  - [ ] Member creation < 1s

- [ ] Code review approved
  - [ ] Follows constitutional principles
  - [ ] Maintainable and testable
  - [ ] Documentation complete

- [ ] Documentation complete
  - [ ] API documentation updated
  - [ ] Migration guide written
  - [ ] README updated

---

## Post-Implementation Review

After completion, reflect on:

### What Went Well
- (To be filled after implementation)

### What Could Be Improved
- (To be filled after implementation)

### Lessons Learned
- (To be filled after implementation)

### Follow-Up Items
- [ ] Monitor plan creation and member creation metrics
- [ ] Gather user feedback on plan management UI
- [ ] Plan future enhancement: Plan changes for existing members
- [ ] Plan future enhancement: Advanced freeze logic implementation
- [ ] Plan future enhancement: Auto-renewal job implementation

---

**End of Plan**
