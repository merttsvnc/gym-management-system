# Implementation Tasks: Branch-Aware Membership Plans

**Version:** 1.0.0  
**Created:** 2025-01-27  
**Status:** Ready for Implementation

---

## Overview

This document contains the complete, sequential task list for implementing Branch-Aware Membership Plans. Tasks are organized by implementation phase and must be completed in order.

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

### Schema Updates

- [ ] T001 Update Prisma schema enum: Add PlanScope enum (TENANT, BRANCH) in `backend/prisma/schema.prisma`
- [ ] T002 Update MembershipPlan model: Add `scope` field (PlanScope, NOT NULL, default TENANT) in `backend/prisma/schema.prisma`
- [ ] T003 Update MembershipPlan model: Add `branchId` field (String?, nullable, foreign key to Branch.id) in `backend/prisma/schema.prisma`
- [ ] T004 Update MembershipPlan model: Add `scopeKey` field (String, NOT NULL) in `backend/prisma/schema.prisma`
- [ ] T005 Update MembershipPlan model: Add `branch` relation (Branch?, optional) in `backend/prisma/schema.prisma`
- [ ] T006 Update MembershipPlan model: Remove `@@unique([tenantId, name])` constraint in `backend/prisma/schema.prisma`
- [ ] T007 Update MembershipPlan model: Add `@@unique([tenantId, scope, scopeKey, name])` constraint in `backend/prisma/schema.prisma`
- [ ] T008 Update MembershipPlan model: Add index `@@index([tenantId, scope])` in `backend/prisma/schema.prisma`
- [ ] T009 Update MembershipPlan model: Add index `@@index([tenantId, scope, status])` in `backend/prisma/schema.prisma`
- [ ] T010 Update MembershipPlan model: Add index `@@index([tenantId, branchId])` in `backend/prisma/schema.prisma`
- [ ] T011 Update MembershipPlan model: Add index `@@index([branchId])` in `backend/prisma/schema.prisma`

### Migration Creation

- [ ] T012 Generate Prisma migration: Run `npx prisma migrate dev --name add_branch_aware_plans` to create migration file
- [ ] T013 Update migration SQL: Add `scope` column with default 'TENANT' in migration file
- [ ] T014 Update migration SQL: Add `branchId` column (nullable) in migration file
- [ ] T015 Update migration SQL: Add foreign key constraint for `branchId → Branch.id` with ON DELETE RESTRICT in migration file
- [ ] T016 Update migration SQL: Add `scopeKey` column with default 'TENANT' in migration file
- [ ] T017 Update migration SQL: Drop existing `@@unique([tenantId, name])` constraint in migration file
- [ ] T018 Update migration SQL: Add new `@@unique([tenantId, scope, scopeKey, name])` constraint in migration file
- [ ] T019 Update migration SQL: Update all existing plans: SET `scope = 'TENANT'`, `branchId = NULL`, `scopeKey = 'TENANT'` in migration file
- [ ] T020 Update migration SQL: Add indexes `[tenantId, scope]`, `[tenantId, scope, status]`, `[tenantId, branchId]`, `[branchId]` in migration file

### Migration Testing

- [ ] T021 Test migration on clean database: Verify migration runs successfully
- [ ] T022 Test migration on database with existing plans: Verify existing plans are migrated correctly (scope=TENANT, branchId=null, scopeKey="TENANT")
- [ ] T023 Verify database constraints: Confirm `@@unique([tenantId, scope, scopeKey, name])` constraint is applied
- [ ] T024 Verify indexes: Confirm all indexes are created successfully
- [ ] T025 Test migration rollback: Verify rollback works correctly if needed

**Acceptance Criteria:**
- Prisma schema includes PlanScope enum, scope, branchId, scopeKey fields
- Migration successfully adds columns and constraints
- Existing plans are migrated to scope=TENANT with scopeKey="TENANT"
- Database constraints prevent duplicate names at DB level
- All indexes are created

---

## Phase 2: Service Layer Updates

**Goal:** Implement scope validation, uniqueness logic, and scopeKey derivation

### Interface Updates

- [ ] T026 Update CreatePlanInput interface: Add `scope: PlanScope` field in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T027 Update CreatePlanInput interface: Add `branchId?: string` field in `backend/src/membership-plans/membership-plans.service.ts`

### Scope Validation Logic

- [ ] T028 Implement validateScopeAndBranchId method: Validate TENANT scope requires branchId = null in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T029 Implement validateScopeAndBranchId method: Validate BRANCH scope requires branchId (not null) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T030 Implement validateBranchBelongsToTenant method: Verify branchId belongs to current tenant in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T031 Implement validateBranchBelongsToTenant method: Verify branch is active (isActive = true) for BRANCH scope in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T032 Add error handling: Return 400 Bad Request for invalid scope/branchId combinations in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T033 Add error handling: Return 403 Forbidden for branchId from different tenant in `backend/src/membership-plans/membership-plans.service.ts`

### scopeKey Derivation (CRITICAL)

- [ ] T034 Implement computeScopeKey helper method: Return "TENANT" for TENANT scope in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T035 Implement computeScopeKey helper method: Return branchId for BRANCH scope in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T036 Update createPlanForTenant: Call computeScopeKey and set scopeKey during CREATE in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T037 Verify scopeKey is NEVER user-provided: Ensure scopeKey is not accepted in CreatePlanInput interface in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T038 Update updatePlanForTenant: Preserve scopeKey during UPDATE (recompute if needed) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T039 Add scopeKey derivation test: Test that scopeKey is computed correctly for TENANT scope in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T040 Add scopeKey derivation test: Test that scopeKey is computed correctly for BRANCH scope in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T041 Add scopeKey security test: Test that providing scopeKey in DTO fails validation in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Uniqueness Validation Logic

- [ ] T042 Refactor checkNameUniqueness method: Handle TENANT scope - check tenantId + name (case-insensitive, ACTIVE only) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T043 Refactor checkNameUniqueness method: Handle BRANCH scope - check tenantId + branchId + name (case-insensitive, ACTIVE only) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T044 Refactor checkNameUniqueness method: Exclude archived plans from uniqueness checks in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T045 Refactor checkNameUniqueness method: Use Prisma mode "insensitive" for case-insensitive comparison in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T046 Update checkNameUniqueness method: Accept scope and branchId parameters in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T047 Update createPlanForTenant: Call checkNameUniqueness with scope and branchId in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T048 Update updatePlanForTenant: Call checkNameUniqueness with scope and branchId when name changes in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T049 Add uniqueness validation test: Test TENANT scope uniqueness (duplicate name fails) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T050 Add uniqueness validation test: Test BRANCH scope uniqueness (duplicate name within branch fails) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T051 Add uniqueness validation test: Test duplicate names across different branches succeed in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T052 Add uniqueness validation test: Test duplicate names between TENANT and BRANCH scopes succeed in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T053 Add uniqueness validation test: Test archived plans don't count toward uniqueness in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T054 Add uniqueness validation test: Test case-insensitive uniqueness enforcement in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Scope Immutability Enforcement

- [ ] T055 Update updatePlanForTenant: Prevent scope changes (return 400 Bad Request) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T056 Update updatePlanForTenant: Prevent branchId changes (return 400 Bad Request) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T057 Add immutability test: Test scope change rejection in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T058 Add immutability test: Test branchId change rejection in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Plan Listing Updates

- [ ] T059 Update listPlansForTenant: Add scope filter parameter in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T060 Update listPlansForTenant: Add branchId filter parameter in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T061 Update listPlansForTenant: Implement scope filtering logic in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T062 Update listPlansForTenant: Implement branchId filtering logic (returns only BRANCH-scoped plans for that branch) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T063 Update listPlansForTenant: Validate branchId belongs to tenant when provided in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T064 Update listActivePlansForTenant: Add branchId filter parameter in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T065 Update listActivePlansForTenant: Return TENANT plans + BRANCH plans for branchId when provided in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T066 Update listActivePlansForTenant: Return only TENANT plans when branchId not provided in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T067 Add listing test: Test scope filter (TENANT) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T068 Add listing test: Test scope filter (BRANCH) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T069 Add listing test: Test branchId filter in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Archive & Restore Updates

- [ ] T070 Update archivePlanForTenant: Make archive endpoint idempotent (already archived → 200 OK) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T071 Update restorePlanForTenant: Fail with 400 if plan already ACTIVE in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T072 Update restorePlanForTenant: Recompute scopeKey during restore in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T073 Update restorePlanForTenant: Check uniqueness before restore (would violate uniqueness → 400 Bad Request) in `backend/src/membership-plans/membership-plans.service.ts`
- [ ] T074 Add archive test: Test archive idempotency (already archived → 200 OK) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T075 Add restore test: Test restore fails if plan already ACTIVE (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T076 Add restore test: Test restore fails if would violate uniqueness (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`

**Acceptance Criteria:**
- scopeKey is always derived internally, never user-provided
- Scope validation enforces TENANT/branchId consistency
- Branch validation ensures branchId belongs to tenant and is active
- Uniqueness validation is case-insensitive and ACTIVE-only
- Scope and branchId are immutable after creation
- Plan listing supports scope and branchId filters
- Archive is idempotent, restore validates uniqueness

---

## Phase 3: DTOs & Controller Updates

**Goal:** Update API layer to support scope and branchId with proper validation

### DTO Updates

- [ ] T077 Update CreatePlanDto: Add `scope: PlanScope` field with @IsEnum validation in `backend/src/membership-plans/dto/create-plan.dto.ts`
- [ ] T078 Update CreatePlanDto: Add `branchId?: string` field with conditional validation in `backend/src/membership-plans/dto/create-plan.dto.ts`
- [ ] T079 Update CreatePlanDto: Add custom validator - branchId must be null if scope=TENANT in `backend/src/membership-plans/dto/create-plan.dto.ts`
- [ ] T080 Update CreatePlanDto: Add custom validator - branchId is required if scope=BRANCH in `backend/src/membership-plans/dto/create-plan.dto.ts`
- [ ] T081 Verify CreatePlanDto: Ensure scopeKey is NOT in DTO (must not be user-provided) in `backend/src/membership-plans/dto/create-plan.dto.ts`
- [ ] T082 Update UpdatePlanDto: Explicitly exclude `scope` field (immutable) in `backend/src/membership-plans/dto/update-plan.dto.ts`
- [ ] T083 Update UpdatePlanDto: Explicitly exclude `branchId` field (immutable) in `backend/src/membership-plans/dto/update-plan.dto.ts`
- [ ] T084 Update PlanListQueryDto: Add `scope?: PlanScope` filter in `backend/src/membership-plans/dto/plan-list-query.dto.ts`
- [ ] T085 Update PlanListQueryDto: Add `branchId?: string` filter in `backend/src/membership-plans/dto/plan-list-query.dto.ts`
- [ ] T086 Update PlanListQueryDto: Add `includeArchived?: boolean` filter in `backend/src/membership-plans/dto/plan-list-query.dto.ts`

### Controller Updates

- [ ] T087 Update POST /membership-plans: Extract scope and branchId from CreatePlanDto in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T088 Update POST /membership-plans: Pass scope and branchId to createPlanForTenant service method in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T089 Update POST /membership-plans: Return 400 Bad Request for invalid scope/branchId combination in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T090 Update POST /membership-plans: Return 403 Forbidden for branchId from different tenant in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T091 Update POST /membership-plans: Return 409 Conflict for duplicate plan name in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T092 Update GET /membership-plans: Extract scope and branchId from PlanListQueryDto in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T093 Update GET /membership-plans: Pass scope and branchId filters to listPlansForTenant service method in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T094 Update GET /membership-plans: Return 400 Bad Request for invalid branchId (doesn't exist or wrong tenant) in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T095 Update GET /membership-plans/active: Extract branchId from query params in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T096 Update GET /membership-plans/active: Pass branchId to listActivePlansForTenant service method in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T097 Update GET /membership-plans/active: Return 400 Bad Request for invalid branchId in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T098 Update PATCH /membership-plans/:id: Reject scope field in UpdatePlanDto (return 400 Bad Request) in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T099 Update PATCH /membership-plans/:id: Reject branchId field in UpdatePlanDto (return 400 Bad Request) in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T100 Update PATCH /membership-plans/:id: Return 409 Conflict for duplicate name if name changed in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T101 Update POST /membership-plans/:id/archive: Ensure idempotent behavior (already archived → 200 OK) in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T102 Update POST /membership-plans/:id/restore: Return 400 Bad Request if plan already ACTIVE in `backend/src/membership-plans/membership-plans.controller.ts`
- [ ] T103 Update POST /membership-plans/:id/restore: Return 400 Bad Request if restore would violate uniqueness in `backend/src/membership-plans/membership-plans.controller.ts`

**Acceptance Criteria:**
- DTOs include scope and branchId with proper validation
- scopeKey is NOT in any DTO (never user-provided)
- Controller returns correct status codes (400, 403, 404, 409)
- Archive endpoint is idempotent
- Restore endpoint validates uniqueness before restoring

---

## Phase 4: Testing

**Goal:** Comprehensive test coverage for all functionality

### Unit Tests - Scope Validation

- [ ] T104 Test createPlanForTenant: TENANT scope with null branchId succeeds in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T105 Test createPlanForTenant: TENANT scope with branchId fails (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T106 Test createPlanForTenant: BRANCH scope without branchId fails (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T107 Test createPlanForTenant: BRANCH scope with branchId from different tenant fails (403 Forbidden) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T108 Test createPlanForTenant: BRANCH scope with archived branch fails (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Unit Tests - Uniqueness Validation

- [ ] T109 Test checkNameUniqueness: TENANT scope duplicate name fails in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T110 Test checkNameUniqueness: BRANCH scope duplicate name within branch fails in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T111 Test checkNameUniqueness: Duplicate names across different branches succeed in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T112 Test checkNameUniqueness: Duplicate names between TENANT and BRANCH scopes succeed in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T113 Test checkNameUniqueness: Archived plans don't count toward uniqueness in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T114 Test checkNameUniqueness: Case-insensitive uniqueness enforcement in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Unit Tests - scopeKey Derivation

- [ ] T115 Test computeScopeKey: Returns "TENANT" for TENANT scope in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T116 Test computeScopeKey: Returns branchId for BRANCH scope in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T117 Test createPlanForTenant: scopeKey is set correctly for TENANT scope in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T118 Test createPlanForTenant: scopeKey is set correctly for BRANCH scope in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T119 Test createPlanForTenant: scopeKey is NEVER user-provided (test fails if provided) in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Unit Tests - Scope Immutability

- [ ] T120 Test updatePlanForTenant: Scope change rejection (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T121 Test updatePlanForTenant: branchId change rejection (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Unit Tests - Archive & Restore

- [ ] T122 Test archivePlanForTenant: Idempotent behavior (already archived → 200 OK) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T123 Test restorePlanForTenant: Fails if plan already ACTIVE (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T124 Test restorePlanForTenant: Fails if would violate uniqueness (400 Bad Request) in `backend/src/membership-plans/membership-plans.service.spec.ts`
- [ ] T125 Test restorePlanForTenant: scopeKey is recomputed during restore in `backend/src/membership-plans/membership-plans.service.spec.ts`

### Integration Tests - API Endpoints

- [ ] T126 Test POST /membership-plans: Create TENANT-scoped plan succeeds (201 Created) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T127 Test POST /membership-plans: Create BRANCH-scoped plan succeeds (201 Created) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T128 Test POST /membership-plans: TENANT plan with branchId fails (400 Bad Request) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T129 Test POST /membership-plans: BRANCH plan without branchId fails (400 Bad Request) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T130 Test POST /membership-plans: BRANCH plan with branchId from different tenant fails (403 Forbidden) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T131 Test POST /membership-plans: Duplicate TENANT plan name fails (409 Conflict) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T132 Test POST /membership-plans: Duplicate BRANCH plan name within branch fails (409 Conflict) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T133 Test POST /membership-plans: Duplicate names across different branches succeed (201 Created) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T134 Test POST /membership-plans: Duplicate names between TENANT and BRANCH scopes succeed (201 Created) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T135 Test POST /membership-plans: scopeKey is NOT in request body (verify it's backend-derived) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T136 Test GET /membership-plans: Filter by scope=TENANT returns only TENANT plans in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T137 Test GET /membership-plans: Filter by scope=BRANCH returns only BRANCH plans in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T138 Test GET /membership-plans: Filter by branchId returns only BRANCH plans for that branch in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T139 Test GET /membership-plans: Invalid branchId (wrong tenant) returns 400 Bad Request in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T140 Test GET /membership-plans/active: Returns TENANT plans when branchId not provided in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T141 Test GET /membership-plans/active: Returns TENANT + BRANCH plans when branchId provided in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T142 Test GET /membership-plans/active: Invalid branchId returns 400 Bad Request in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T143 Test PATCH /membership-plans/:id: Reject scope change (400 Bad Request) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T144 Test PATCH /membership-plans/:id: Reject branchId change (400 Bad Request) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T145 Test PATCH /membership-plans/:id: Duplicate name if name changed fails (409 Conflict) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T146 Test POST /membership-plans/:id/archive: Archive plan succeeds (200 OK) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T147 Test POST /membership-plans/:id/archive: Already archived returns 200 OK (idempotent) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T148 Test POST /membership-plans/:id/restore: Restore plan succeeds (200 OK) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T149 Test POST /membership-plans/:id/restore: Already ACTIVE returns 400 Bad Request in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T150 Test POST /membership-plans/:id/restore: Would violate uniqueness returns 400 Bad Request in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T151 Test Tenant isolation: Plan from Tenant A not accessible to Tenant B (403 Forbidden) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T152 Test Branch isolation: BRANCH plan from Branch A not accessible when querying Branch B plans in `backend/test/membership-plans.e2e-spec.ts`

### Integration Tests - Status Code Correctness

- [ ] T153 Test status codes: 409 Conflict for duplicate plan name in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T154 Test status codes: 400 Bad Request for validation errors in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T155 Test status codes: 400 Bad Request for immutable field changes (scope, branchId) in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T156 Test status codes: 403 Forbidden for cross-tenant access in `backend/test/membership-plans.e2e-spec.ts`
- [ ] T157 Test status codes: 404 Not Found for missing resources in `backend/test/membership-plans.e2e-spec.ts`

**Acceptance Criteria:**
- All unit tests pass (>90% coverage for validation logic)
- All integration tests pass
- scopeKey derivation tests verify backend-only computation
- Status code tests verify correct HTTP responses
- Archive/restore tests verify idempotency and uniqueness validation

---

## Task Summary

**Total Tasks:** 157

**By Phase:**
- Phase 1 (Schema & Migration): 25 tasks
- Phase 2 (Service Layer): 51 tasks
- Phase 3 (DTOs & Controller): 27 tasks
- Phase 4 (Testing): 54 tasks

**Critical Tasks (scopeKey):**
- T034-T041: scopeKey derivation and security
- T115-T119: scopeKey unit tests
- T135: scopeKey integration test

**Parallel Opportunities:**
- T039-T041 can be written in parallel (scopeKey tests)
- T049-T054 can be written in parallel (uniqueness tests)
- T104-T108 can be written in parallel (scope validation tests)
- T126-T135 can be written in parallel (POST endpoint tests)
- T136-T142 can be written in parallel (GET endpoint tests)

**Dependencies:**
- Phase 1 must complete before Phase 2
- Phase 2 must complete before Phase 3
- Phase 3 must complete before Phase 4
- Within phases, tasks are sequential unless marked as parallelizable

---

## Implementation Strategy

### MVP Scope
Start with Phase 1 and Phase 2 core functionality:
- Database schema and migration (Phase 1)
- Basic scope validation and scopeKey derivation (Phase 2: T026-T041)
- Basic uniqueness validation (Phase 2: T042-T054)
- Basic service methods (Phase 2: T059-T069)

### Incremental Delivery
1. **Week 1:** Phase 1 (Schema & Migration) + Phase 2 core (scopeKey, validation)
2. **Week 2:** Phase 2 complete (listing, archive/restore) + Phase 3 (DTOs & Controller)
3. **Week 3:** Phase 4 (Testing) + Bug fixes

### Review Checkpoints
- After Phase 1: Verify migration runs successfully, scopeKey is computed correctly
- After Phase 2: Verify scopeKey is never user-provided, uniqueness works correctly
- After Phase 3: Verify API endpoints return correct status codes
- After Phase 4: Verify all tests pass, edge cases covered

---

**End of Tasks**

