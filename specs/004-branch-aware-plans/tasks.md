# Implementation Tasks: Branch-Aware Membership Plans

**Version:** 2.0.0  
**Created:** 2025-01-27  
**Updated:** 2025-01-27  
**Status:** In Progress (PR5 Complete)

---

## Overview

This document contains the consolidated task list for implementing Branch-Aware Membership Plans. Tasks are organized by implementation phase and designed to be completed as reviewable chunks suitable for PR-based development.

### Critical Requirements

1. **scopeKey Derivation (CRITICAL):**
   - scopeKey MUST ALWAYS be derived internally by the backend
   - scopeKey MUST NEVER be user-provided via DTOs, request bodies, or query params
   - TENANT scope → scopeKey = "TENANT"
   - BRANCH scope → scopeKey = branchId
   - Must be set during CREATE, preserved during UPDATE, recomputed during RESTORE, populated during MIGRATION

2. **Uniqueness Enforcement:**
   - Database-level: `@@unique([tenantId, scope, scopeKey, name])`
   - Application-level: Case-insensitive (Prisma mode: "insensitive"), ACTIVE-only, excludes archived plans

3. **Status Code Correctness:**
   - 409 Conflict → duplicate plan name
   - 400 Bad Request → validation errors, immutable field changes
   - 403 Forbidden → cross-tenant access
   - 404 Not Found → missing resources

4. **Archive & Restore Behavior:**
   - Archive endpoint is idempotent (already archived → 200 OK)
   - Restore fails with 400 if plan already ACTIVE or would violate uniqueness

5. **Validation & Security:**
   - branchId must belong to authenticated tenant
   - BRANCH plans cannot be created for archived branches
   - TENANT plans must have branchId = null
   - scope and branchId are immutable after creation

---

## Phase 1: Database Schema & Migration

**Goal:** Update Prisma schema and create migration with scopeKey computation

### Task 1.1: Update Prisma Schema ✅

**Files:**
- `backend/prisma/schema.prisma`

**Description:**
Add PlanScope enum and update MembershipPlan model with scope, branchId, scopeKey fields, branch relation, new uniqueness constraint, and required indexes.

**Acceptance Criteria:**
- ✅ PlanScope enum added (TENANT, BRANCH)
- ✅ MembershipPlan.scope field added (PlanScope, NOT NULL, default TENANT)
- ✅ MembershipPlan.branchId field added (String?, nullable, foreign key to Branch.id)
- ✅ MembershipPlan.scopeKey field added (String, NOT NULL)
- ✅ MembershipPlan.branch relation added (Branch?, optional, onDelete: Restrict)
- ✅ Old constraint `@@unique([tenantId, name])` removed
- ✅ New constraint `@@unique([tenantId, scope, scopeKey, name])` added
- ✅ Indexes added: `[tenantId, scope]`, `[tenantId, scope, status]`, `[tenantId, branchId]`, `[branchId]`
- ✅ Schema validates without errors

**Dependencies:** None

**Original Tasks:** T001-T011

---

### Task 1.2: Create and Configure Migration ✅

**Files:**
- `backend/prisma/migrations/20251216212504_add_branch_aware_plans/migration.sql`

**Description:**
Generate Prisma migration and update SQL to add scope, branchId, scopeKey columns, foreign key constraint, new uniqueness constraint, migrate existing data, and add indexes.

**Acceptance Criteria:**
- ✅ Migration file created: `20251216212504_add_branch_aware_plans/migration.sql`
- ✅ SQL adds `scope` column with default 'TENANT'
- ✅ SQL adds `branchId` column (nullable)
- ✅ SQL adds foreign key constraint `branchId → Branch.id` with ON DELETE RESTRICT
- ✅ SQL adds `scopeKey` column with default 'TENANT'
- ✅ SQL drops existing `@@unique([tenantId, name])` constraint
- ✅ SQL adds new `@@unique([tenantId, scope, scopeKey, name])` constraint
- ✅ SQL updates all existing plans: SET `scope = 'TENANT'`, `branchId = NULL`, `scopeKey = 'TENANT'`
- ✅ SQL adds indexes: `[tenantId, scope]`, `[tenantId, scope, status]`, `[tenantId, branchId]`, `[branchId]`
- ✅ Migration SQL is syntactically correct

**Dependencies:** Task 1.1

**Original Tasks:** T012-T020

---

### Task 1.3: Test Migration

**Files:**
- Manual testing / migration verification

**Description:**
Test migration on clean database and database with existing plans. Verify constraints, indexes, and data migration correctness. Test rollback if needed.

**Acceptance Criteria:**
- Migration runs successfully on clean database
- Migration runs successfully on database with existing plans
- Existing plans migrated correctly: `scope = 'TENANT'`, `branchId = NULL`, `scopeKey = 'TENANT'`
- Database constraint `@@unique([tenantId, scope, scopeKey, name])` is applied and working
- All indexes are created successfully
- Migration rollback works correctly (if tested)
- No data loss or corruption

**Dependencies:** Task 1.2

**Original Tasks:** T021-T025

---

## Phase 2: Service Layer Updates

**Goal:** Implement scope validation, uniqueness logic, and scopeKey derivation

### Task 2.1: Add Scope and Branch Validation

**Files:**
- `backend/src/membership-plans/membership-plans.service.ts`

**Description:**
Update CreatePlanInput interface to include scope and branchId. Implement validateScopeAndBranchId and validateBranchBelongsToTenant methods with proper error handling.

**Acceptance Criteria:**
- CreatePlanInput interface includes `scope: PlanScope` and `branchId?: string`
- validateScopeAndBranchId method validates TENANT scope requires branchId = null
- validateScopeAndBranchId method validates BRANCH scope requires branchId (not null)
- validateBranchBelongsToTenant method verifies branchId belongs to current tenant
- validateBranchBelongsToTenant method verifies branch is active (isActive = true) for BRANCH scope
- Invalid scope/branchId combinations return 400 Bad Request
- branchId from different tenant returns 403 Forbidden
- All validation errors include clear error messages

**Dependencies:** Task 1.3

**Original Tasks:** T026-T033

---

### Task 2.2: Implement scopeKey Derivation

**Files:**
- `backend/src/membership-plans/membership-plans.service.ts`

**Description:**
Implement computeScopeKey helper method and integrate it into createPlanForTenant and updatePlanForTenant. Ensure scopeKey is never user-provided.

**Acceptance Criteria:**
- computeScopeKey helper method returns "TENANT" for TENANT scope
- computeScopeKey helper method returns branchId for BRANCH scope
- createPlanForTenant calls computeScopeKey and sets scopeKey during CREATE
- scopeKey is NOT accepted in CreatePlanInput interface (never user-provided)
- updatePlanForTenant preserves scopeKey during UPDATE (recomputes if needed)
- scopeKey derivation logic is documented with inline comments

**Dependencies:** Task 2.1

**Original Tasks:** T034-T038

---

### Task 2.3: Implement Scope-Based Uniqueness Validation

**Files:**
- `backend/src/membership-plans/membership-plans.service.ts`

**Description:**
Refactor checkNameUniqueness method to handle TENANT and BRANCH scopes with case-insensitive, ACTIVE-only validation. Integrate into createPlanForTenant and updatePlanForTenant.

**Acceptance Criteria:**
- checkNameUniqueness method accepts scope and branchId parameters
- TENANT scope: checks tenantId + name (case-insensitive, ACTIVE only)
- BRANCH scope: checks tenantId + branchId + name (case-insensitive, ACTIVE only)
- Uses Prisma mode "insensitive" for case-insensitive comparison
- Excludes archived plans from uniqueness checks
- createPlanForTenant calls checkNameUniqueness with scope and branchId
- updatePlanForTenant calls checkNameUniqueness when name changes
- Uniqueness validation throws ConflictException with clear error message

**Dependencies:** Task 2.2

**Original Tasks:** T042-T048

---

### Task 2.4: Enforce Scope and BranchId Immutability

**Files:**
- `backend/src/membership-plans/membership-plans.service.ts`

**Description:**
Update updatePlanForTenant to prevent scope and branchId changes, returning 400 Bad Request for attempts to modify immutable fields.

**Acceptance Criteria:**
- updatePlanForTenant prevents scope changes (returns 400 Bad Request)
- updatePlanForTenant prevents branchId changes (returns 400 Bad Request)
- Error messages clearly indicate scope and branchId are immutable
- Immutability checks occur before any other update logic

**Dependencies:** Task 2.3

**Original Tasks:** T055-T056

---

### Task 2.5: Update Plan Listing Methods with Filters

**Files:**
- `backend/src/membership-plans/membership-plans.service.ts`

**Description:**
Update listPlansForTenant and listActivePlansForTenant to support scope and branchId filtering. Implement branchId validation for listing operations.

**Acceptance Criteria:**
- listPlansForTenant accepts scope and branchId filter parameters
- listPlansForTenant filters by scope when provided
- listPlansForTenant filters by branchId (returns only BRANCH-scoped plans for that branch)
- listPlansForTenant validates branchId belongs to tenant when provided
- listActivePlansForTenant accepts branchId filter parameter
- When branchId provided: returns TENANT plans + BRANCH plans for that branch
- When branchId not provided: returns only TENANT plans
- Results sorted by sortOrder ASC, then createdAt ASC
- Invalid branchId returns appropriate error

**Dependencies:** Task 2.4

**Original Tasks:** T059-T066

---

### Task 2.6: Update Archive and Restore Methods

**Files:**
- `backend/src/membership-plans/membership-plans.service.ts`

**Description:**
Update archivePlanForTenant to be idempotent. Update restorePlanForTenant to validate uniqueness and recompute scopeKey. Ensure proper error handling.

**Acceptance Criteria:**
- archivePlanForTenant is idempotent (already archived → returns 200 OK, no error)
- restorePlanForTenant fails with 400 if plan already ACTIVE
- restorePlanForTenant recomputes scopeKey during restore
- restorePlanForTenant checks uniqueness before restore (would violate uniqueness → 400 Bad Request)
- Error messages are clear and actionable
- Archive/restore operations maintain data integrity

**Dependencies:** Task 2.5

**Original Tasks:** T070-T073

---

## Phase 3: DTOs & Controller Updates

**Goal:** Update API layer to support scope and branchId with proper validation

### Task 3.1: Update DTOs with Scope and BranchId

**Files:**
- `backend/src/membership-plans/dto/create-plan.dto.ts`
- `backend/src/membership-plans/dto/update-plan.dto.ts`
- `backend/src/membership-plans/dto/plan-list-query.dto.ts`

**Description:**
Add scope and branchId fields to DTOs with proper validation decorators. Ensure scopeKey is never in any DTO. Make scope and branchId immutable in UpdatePlanDto.

**Acceptance Criteria:**
- CreatePlanDto includes `scope: PlanScope` with @IsEnum validation
- CreatePlanDto includes `branchId?: string` with conditional validation
- CreatePlanDto custom validator: branchId must be null if scope=TENANT
- CreatePlanDto custom validator: branchId is required if scope=BRANCH
- scopeKey is NOT in CreatePlanDto (verified, never user-provided)
- UpdatePlanDto explicitly excludes `scope` field (immutable)
- UpdatePlanDto explicitly excludes `branchId` field (immutable)
- PlanListQueryDto includes `scope?: PlanScope` filter
- PlanListQueryDto includes `branchId?: string` filter
- PlanListQueryDto includes `includeArchived?: boolean` filter
- All DTOs validate correctly with class-validator

**Dependencies:** Task 2.6

**Original Tasks:** T077-T086

---

### Task 3.2: Update Controller Endpoints

**Files:**
- `backend/src/membership-plans/membership-plans.controller.ts`

**Description:**
Update all controller endpoints to handle scope and branchId. Ensure correct status codes (400, 403, 404, 409). Implement idempotent archive and uniqueness-validated restore.

**Acceptance Criteria:**
- POST /membership-plans extracts scope and branchId from CreatePlanDto
- POST /membership-plans returns 400 for invalid scope/branchId combination
- POST /membership-plans returns 403 for branchId from different tenant
- POST /membership-plans returns 409 for duplicate plan name
- GET /membership-plans extracts scope and branchId from PlanListQueryDto
- GET /membership-plans returns 400 for invalid branchId (doesn't exist or wrong tenant)
- GET /membership-plans/active handles branchId filter correctly
- GET /membership-plans/active returns 400 for invalid branchId
- PATCH /membership-plans/:id rejects scope field (returns 400)
- PATCH /membership-plans/:id rejects branchId field (returns 400)
- PATCH /membership-plans/:id returns 409 for duplicate name if name changed
- POST /membership-plans/:id/archive is idempotent (already archived → 200 OK)
- POST /membership-plans/:id/restore returns 400 if plan already ACTIVE
- POST /membership-plans/:id/restore returns 400 if restore would violate uniqueness
- All endpoints return correct HTTP status codes
- Error responses include clear, actionable messages

**Dependencies:** Task 3.1

**Original Tasks:** T087-T103

---

## Phase 4: Testing

**Goal:** Comprehensive test coverage for all functionality

### Task 4.1: Unit Tests - Scope Validation and scopeKey Derivation ✅

**Files:**
- `backend/src/membership-plans/membership-plans.service.spec.ts`

**Description:**
Write unit tests for scope validation (TENANT/BRANCH rules, branch validation) and scopeKey derivation (computation, security, never user-provided).

**Acceptance Criteria:**
- ✅ Test createPlanForTenant: TENANT scope with null branchId succeeds
- ✅ Test createPlanForTenant: TENANT scope with branchId fails (400 Bad Request)
- ✅ Test createPlanForTenant: BRANCH scope without branchId fails (400 Bad Request)
- ✅ Test createPlanForTenant: BRANCH scope with branchId from different tenant fails (403 Forbidden)
- ✅ Test createPlanForTenant: BRANCH scope with archived branch fails (400 Bad Request)
- ✅ Test computeScopeKey: Returns "TENANT" for TENANT scope
- ✅ Test computeScopeKey: Returns branchId for BRANCH scope
- ✅ Test createPlanForTenant: scopeKey is set correctly for TENANT scope
- ✅ Test createPlanForTenant: scopeKey is set correctly for BRANCH scope
- ✅ Test createPlanForTenant: scopeKey is NEVER user-provided (test fails if provided)
- ✅ All tests pass with >90% coverage for validation logic

**Dependencies:** Task 3.2

**Original Tasks:** T104-T108, T115-T119

---

### Task 4.2: Unit Tests - Uniqueness Validation ✅

**Files:**
- `backend/src/membership-plans/membership-plans.service.spec.ts`

**Description:**
Write unit tests for scope-based uniqueness validation covering all edge cases (TENANT/BRANCH scopes, cross-branch duplicates, archived plans, case-insensitivity).

**Acceptance Criteria:**
- ✅ Test checkNameUniqueness: TENANT scope duplicate name fails
- ✅ Test checkNameUniqueness: BRANCH scope duplicate name within branch fails
- ✅ Test checkNameUniqueness: Duplicate names across different branches succeed
- ✅ Test checkNameUniqueness: Duplicate names between TENANT and BRANCH scopes succeed
- ✅ Test checkNameUniqueness: Archived plans don't count toward uniqueness
- ✅ Test checkNameUniqueness: Case-insensitive uniqueness enforcement
- ✅ All tests pass with clear test names and arrange-act-assert pattern

**Dependencies:** Task 4.1

**Original Tasks:** T109-T114

---

### Task 4.3: Unit Tests - Immutability and Archive/Restore ✅

**Files:**
- `backend/src/membership-plans/membership-plans.service.spec.ts`

**Description:**
Write unit tests for scope/branchId immutability and archive/restore behavior (idempotency, uniqueness validation, scopeKey recomputation).

**Acceptance Criteria:**
- ✅ Test updatePlanForTenant: Scope change rejection (400 Bad Request)
- ✅ Test updatePlanForTenant: branchId change rejection (400 Bad Request)
- ✅ Test archivePlanForTenant: Idempotent behavior (already archived → 200 OK)
- ✅ Test restorePlanForTenant: Fails if plan already ACTIVE (400 Bad Request)
- ✅ Test restorePlanForTenant: Fails if would violate uniqueness (400 Bad Request)
- ✅ Test restorePlanForTenant: scopeKey is recomputed during restore
- ✅ All tests pass with clear assertions

**Dependencies:** Task 4.2

**Original Tasks:** T120-T125

---

### Task 4.4: Integration Tests - POST Endpoints

**Files:**
- `backend/test/membership-plans.e2e-spec.ts`

**Description:**
Write integration tests for POST /membership-plans covering TENANT/BRANCH creation, validation errors, duplicate names, and scopeKey security.

**Acceptance Criteria:**
- Test POST /membership-plans: Create TENANT-scoped plan succeeds (201 Created)
- Test POST /membership-plans: Create BRANCH-scoped plan succeeds (201 Created)
- Test POST /membership-plans: TENANT plan with branchId fails (400 Bad Request)
- Test POST /membership-plans: BRANCH plan without branchId fails (400 Bad Request)
- Test POST /membership-plans: BRANCH plan with branchId from different tenant fails (403 Forbidden)
- Test POST /membership-plans: Duplicate TENANT plan name fails (409 Conflict)
- Test POST /membership-plans: Duplicate BRANCH plan name within branch fails (409 Conflict)
- Test POST /membership-plans: Duplicate names across different branches succeed (201 Created)
- Test POST /membership-plans: Duplicate names between TENANT and BRANCH scopes succeed (201 Created)
- Test POST /membership-plans: scopeKey is NOT in request body (verify it's backend-derived)
- All tests pass with proper test data setup and cleanup

**Dependencies:** Task 4.3

**Original Tasks:** T126-T135

---

### Task 4.5: Integration Tests - GET Endpoints

**Files:**
- `backend/test/membership-plans.e2e-spec.ts`

**Description:**
Write integration tests for GET /membership-plans and GET /membership-plans/active covering scope filtering, branchId filtering, and validation.

**Acceptance Criteria:**
- Test GET /membership-plans: Filter by scope=TENANT returns only TENANT plans
- Test GET /membership-plans: Filter by scope=BRANCH returns only BRANCH plans
- Test GET /membership-plans: Filter by branchId returns only BRANCH plans for that branch
- Test GET /membership-plans: Invalid branchId (doesn't exist OR belongs to different tenant) returns 400 Bad Request with generic error message (no tenant leakage)
- Test GET /membership-plans: Empty results for valid filters returns 200 OK with empty data array and pagination metadata (total: 0, totalPages: 0)
- Test GET /membership-plans/active: Returns TENANT plans when branchId not provided
- Test GET /membership-plans/active: Returns TENANT + BRANCH plans when branchId provided
- Test GET /membership-plans/active: Invalid branchId (doesn't exist OR belongs to different tenant) returns 400 Bad Request with generic error message (no tenant leakage)
- Test GET /membership-plans/active: Empty results for valid filters returns 200 OK with empty array
- All tests verify correct filtering and sorting behavior

**Dependencies:** Task 4.4

**Original Tasks:** T136-T142

---

### Task 4.6: Integration Tests - PATCH, Archive, Restore, and Isolation

**Files:**
- `backend/test/membership-plans.e2e-spec.ts`

**Description:**
Write integration tests for PATCH, archive, restore endpoints, and tenant/branch isolation.

**Acceptance Criteria:**
- Test PATCH /membership-plans/:id: Reject scope change (400 Bad Request)
- Test PATCH /membership-plans/:id: Reject branchId change (400 Bad Request)
- Test PATCH /membership-plans/:id: Duplicate name if name changed fails (409 Conflict)
- Test POST /membership-plans/:id/archive: Archive plan succeeds (200 OK)
- Test POST /membership-plans/:id/archive: Already archived returns 200 OK (idempotent)
- Test POST /membership-plans/:id/restore: Restore plan succeeds (200 OK)
- Test POST /membership-plans/:id/restore: Already ACTIVE returns 400 Bad Request
- Test POST /membership-plans/:id/restore: Would violate uniqueness returns 400 Bad Request
- Test Tenant isolation: Plan from Tenant A not accessible to Tenant B (403 Forbidden)
- Test Branch isolation: BRANCH plan from Branch A not accessible when querying Branch B plans
- All tests pass with proper isolation between test cases

**Dependencies:** Task 4.5

**Original Tasks:** T143-T152

---

### Task 4.7: Integration Tests - Status Code Correctness

**Files:**
- `backend/test/membership-plans.e2e-spec.ts`

**Description:**
Write integration tests verifying all endpoints return correct HTTP status codes for various scenarios.

**Acceptance Criteria:**
- Test status codes: 409 Conflict for duplicate plan name
- Test status codes: 400 Bad Request for validation errors
- Test status codes: 400 Bad Request for immutable field changes (scope, branchId)
- Test status codes: 403 Forbidden for cross-tenant access
- Test status codes: 404 Not Found for missing resources
- All status code tests verify correct HTTP responses match specification

**Dependencies:** Task 4.6

**Original Tasks:** T153-T157

---

### Task 4.8: Database Constraint Verification Tests ✅

**Files:**
- `backend/test/membership-plans.e2e-spec.ts`

**Description:**
Write explicit tests that verify the database-level uniqueness constraint `@@unique([tenantId, scope, scopeKey, name])` is enforced at the database level, preventing duplicates even under concurrency or direct database operations.

**Acceptance Criteria:**
- ✅ Test database constraint: Attempting to create duplicate (tenantId, TENANT, scopeKey="TENANT", same name) fails at DB level with unique constraint violation
  - ✅ Test approach: E2E test using Promise.all() to send two concurrent POST requests with identical payloads, verify one succeeds (201) and one fails (409 Conflict due to DB constraint)
  - ✅ Verify the error is a database-level unique constraint violation (not application-level validation)
- ✅ Test database constraint: Attempting to create duplicate (tenantId, BRANCH, scopeKey=branchId, same name) fails at DB level with unique constraint violation
  - ✅ Test approach: Same as above, but with BRANCH scope and valid branchId
  - ✅ Verify the error is a database-level unique constraint violation
- ✅ Test verifies that database constraint prevents race conditions: Two concurrent requests attempting to create plans with identical (tenantId, scope, scopeKey, name) result in one success and one database constraint violation
- ✅ Additional stress test: Multiple concurrent requests (5 requests) verify only one succeeds, rest fail with 409 Conflict

**Implementation:**
- ✅ Implemented E2E tests using Promise.all() to send concurrent POST requests
- ✅ Tests verify one request returns 201 Created, other returns 409 Conflict
- ✅ Tests verify exactly one record exists in database after concurrent requests
- ✅ Tests cover both TENANT and BRANCH scopes
- ✅ Tests verify database constraint works independently of application-level validation

**Dependencies:** Task 4.7

**Original Tasks:** New task (A1 remediation)

---

## Task Summary

**Total Consolidated Tasks:** 19

**By Phase:**
- Phase 1 (Schema & Migration): 3 tasks
- Phase 2 (Service Layer): 6 tasks
- Phase 3 (DTOs & Controller): 2 tasks
- Phase 4 (Testing): 8 tasks

**Critical Requirements Preserved:**
- ✅ scopeKey derivation (backend-only, never user-provided)
- ✅ Uniqueness enforcement (database + application level)
- ✅ Status code correctness (400, 403, 404, 409)
- ✅ Archive idempotency and restore validation
- ✅ Scope and branchId immutability

---

## Task Mapping

This section maps consolidated tasks to original task numbers for traceability.

### Phase 1: Database Schema & Migration

- **Task 1.1** (Update Prisma Schema) → T001-T011
- **Task 1.2** (Create and Configure Migration) → T012-T020
- **Task 1.3** (Test Migration) → T021-T025

### Phase 2: Service Layer Updates

- **Task 2.1** (Add Scope and Branch Validation) → T026-T033
- **Task 2.2** (Implement scopeKey Derivation) → T034-T038
- **Task 2.3** (Implement Scope-Based Uniqueness Validation) → T042-T048
- **Task 2.4** (Enforce Scope and BranchId Immutability) → T055-T056
- **Task 2.5** (Update Plan Listing Methods with Filters) → T059-T066
- **Task 2.6** (Update Archive and Restore Methods) → T070-T073

### Phase 3: DTOs & Controller Updates

- **Task 3.1** (Update DTOs with Scope and BranchId) → T077-T086
- **Task 3.2** (Update Controller Endpoints) → T087-T103

### Phase 4: Testing

- **Task 4.1** (Unit Tests - Scope Validation and scopeKey Derivation) → T104-T108, T115-T119
- **Task 4.2** (Unit Tests - Uniqueness Validation) → T109-T114
- **Task 4.3** (Unit Tests - Immutability and Archive/Restore) → T120-T125
- **Task 4.4** (Integration Tests - POST Endpoints) → T126-T135
- **Task 4.5** (Integration Tests - GET Endpoints) → T136-T142
- **Task 4.6** (Integration Tests - PATCH, Archive, Restore, and Isolation) → T143-T152
- **Task 4.7** (Integration Tests - Status Code Correctness) → T153-T157

**Note:** Tasks T039-T041 (scopeKey unit tests) were merged into Task 4.1. Tasks T057-T058 (immutability unit tests) were merged into Task 4.3. Tasks T067-T069 (listing unit tests) were merged into Task 4.1 and Task 4.2 where appropriate.

---

## Implementation Strategy

### PR-by-PR Execution Plan

**PR 1: Database Schema & Migration** (Tasks 1.1-1.3)
- Single PR containing schema updates, migration creation, and migration testing
- Review focus: Schema correctness, migration safety, backward compatibility

**PR 2: Service Layer - Core Validation** (Tasks 2.1-2.3)
- Scope validation, scopeKey derivation, and uniqueness logic
- Review focus: scopeKey security (never user-provided), validation correctness

**PR 3: Service Layer - Listing & Lifecycle** (Tasks 2.4-2.6)
- Immutability enforcement, plan listing filters, archive/restore updates
- Review focus: Filter logic correctness, idempotency, restore validation

**PR 4: API Layer** (Tasks 3.1-3.2)
- DTO updates and controller endpoint updates
- Review focus: Status code correctness, DTO validation, scopeKey not in DTOs

**PR 5: Unit Tests** (Tasks 4.1-4.3) ✅
- All service layer unit tests
- Review focus: Test coverage, edge cases, scopeKey security tests
- **Status:** Complete - All 77 unit tests passing

**PR 6: Integration Tests - Core Endpoints** (Tasks 4.4-4.5)
- POST and GET endpoint integration tests
- Review focus: API contract compliance, filtering correctness

**PR 7: Integration Tests - Advanced & Isolation** (Tasks 4.6-4.7)
- PATCH, archive, restore, isolation, and status code tests
- Review focus: Isolation correctness, status code accuracy

**Total PRs:** 7 PRs, each focused on a logical, reviewable chunk of functionality.

---

**End of Tasks**

---

## Hotfixes

### Hotfix: Add archivedAt to MembershipPlan

**Date:** 2025-12-16  
**Migration:** `20251216124731_add_archived_at_to_membership_plan`  
**Status:** ✅ Complete

**Description:**
Added `archivedAt DateTime?` field to MembershipPlan model to support soft archiving functionality. This aligns with spec 004 decisions where archivedAt is used to filter out archived plans from uniqueness checks and queries.

**Changes:**
- ✅ Schema already includes `archivedAt DateTime?` (line 137)
- ✅ Migration created: `add_archivedAt_to_membership_plan`
- ✅ Migration SQL verified: Only adds `archivedAt` column (no indexes needed for current usage)
- ✅ Service logic already uses `archivedAt` in `checkNameUniqueness` method (line 554)

**Migration Details:**
- Migration file: `backend/prisma/migrations/20251216124731_add_archived_at_to_membership_plan/migration.sql`
- SQL operation: `ALTER TABLE "MembershipPlan" ADD COLUMN "archivedAt" TIMESTAMP(3);`
- No index added: Current queries filter by `archivedAt: null` which doesn't require a dedicated index

**Application:**
To apply this migration in production:
```bash
cd backend
npx prisma migrate deploy
```

This will apply all pending migrations including `add_archivedAt_to_membership_plan`.
