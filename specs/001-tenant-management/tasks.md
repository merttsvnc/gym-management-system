# Task Breakdown: Tenant Management

**Feature:** Tenant Management  
**Plan Version:** 1.0.0  
**Generated:** 2025-12-05  
**Status:** Not Started  

---

## Overview

This document provides an actionable, dependency-ordered task list for implementing the Tenant Management module. Tasks are organized by user story to enable independent implementation and testing of each functional area.

**Total Estimated Effort:** 8-10 person-days

---

## Implementation Strategy

**MVP-First Approach:**
- **MVP Scope:** User Story 1 (Tenant Settings) + User Story 2 (View Branches) provide immediate value
- **Incremental Delivery:** Each user story represents a complete, testable increment
- **Independent Stories:** Most user stories can be implemented in parallel after foundational setup

**Parallel Execution:**
- Setup and Foundational tasks must complete first
- Within each user story: Models → Services → Controllers → Frontend can be parallelized when files don't conflict
- Multiple user stories can be implemented simultaneously by different team members

---

## Phase 1: Setup & Project Initialization

**Goal:** Initialize project structure, dependencies, and configuration

### Setup Tasks

- [ ] T001 Install and configure backend dependencies in backend/package.json
- [ ] T002 [P] Install and configure frontend dependencies in frontend/package.json
- [ ] T003 [P] Configure Prisma for PostgreSQL in backend/prisma/prisma.config.ts
- [ ] T004 [P] Set up environment variables for database connection in backend/.env
- [ ] T005 [P] Configure shadcn/ui and Tailwind CSS in frontend/
- [ ] T006 [P] Set up React Query client configuration in frontend/src/lib/query-client.ts

---

## Phase 2: Foundational Infrastructure

**Goal:** Establish core infrastructure that all user stories depend on

### Database Foundation

- [ ] T007 Create Prisma schema for Tenant model in backend/prisma/schema.prisma
- [ ] T008 Create Prisma schema for Branch model in backend/prisma/schema.prisma
- [ ] T009 Add Prisma schema for User model with tenantId in backend/prisma/schema.prisma
- [ ] T010 Add Role enum to Prisma schema in backend/prisma/schema.prisma
- [ ] T011 Add database indexes for tenant isolation in backend/prisma/schema.prisma
- [ ] T012 Generate Prisma migration for tenant management in backend/prisma/migrations/
- [ ] T013 Review migration SQL for safety and correctness
- [ ] T014 Apply migration to development database
- [ ] T015 Generate Prisma Client types
- [ ] T016 [P] Create seed script for development data in backend/prisma/seeds/tenant-seed.ts

### Authentication & Authorization

- [ ] T017 Create TenantGuard for tenant isolation enforcement in backend/src/auth/guards/tenant.guard.ts
- [ ] T018 [P] Create @CurrentUser decorator for extracting user context in backend/src/auth/decorators/current-user.decorator.ts
- [ ] T019 [P] Update JWT payload interface to include tenantId in backend/src/auth/types/jwt-payload.ts

### Shared Contracts

- [ ] T020 [P] Copy TypeScript contracts from specs/001-tenant-management/contracts/types.ts to backend/src/common/types/
- [ ] T021 [P] Copy TypeScript contracts from specs/001-tenant-management/contracts/types.ts to frontend/src/types/

---

## Phase 3: User Story 1 - View and Update Tenant Settings

**Goal:** Admin can view their tenant information and update tenant name and default currency

**Independent Test Criteria:**
- [ ] GET /api/v1/tenants/current returns correct tenant data
- [ ] PATCH /api/v1/tenants/current successfully updates tenant name
- [ ] PATCH /api/v1/tenants/current successfully updates currency
- [ ] Invalid currency codes are rejected with 400 status
- [ ] Cross-tenant access returns 403 Forbidden
- [ ] Tenant settings page displays current data
- [ ] Form validates inputs before submission

### Backend Tasks

- [ ] T022 [US1] Create Tenants module structure in backend/src/tenants/
- [ ] T023 [P] [US1] Create UpdateTenantDto with validation in backend/src/tenants/dto/update-tenant.dto.ts
- [ ] T024 [US1] Implement TenantsService.getCurrentTenant() in backend/src/tenants/tenants.service.ts
- [ ] T025 [US1] Implement TenantsService.updateTenant() in backend/src/tenants/tenants.service.ts
- [ ] T026 [US1] Implement GET /api/v1/tenants/current controller in backend/src/tenants/tenants.controller.ts
- [ ] T027 [US1] Implement PATCH /api/v1/tenants/current controller in backend/src/tenants/tenants.controller.ts
- [ ] T028 [P] [US1] Write unit tests for TenantsService in backend/src/tenants/tenants.service.spec.ts
- [ ] T029 [P] [US1] Write integration tests for tenant endpoints in backend/test/tenants.e2e-spec.ts

### Frontend Tasks

- [ ] T030 [P] [US1] Create tenant API client methods in frontend/src/api/tenants.ts
- [ ] T031 [P] [US1] Create useCurrentTenant React Query hook in frontend/src/hooks/useTenant.ts
- [ ] T032 [P] [US1] Create useUpdateTenant mutation hook in frontend/src/hooks/useTenant.ts
- [ ] T033 [US1] Create TenantSettingsForm component in frontend/src/pages/settings/tenant/TenantSettingsForm.tsx
- [ ] T034 [US1] Create Tenant Settings page in frontend/src/pages/settings/tenant/page.tsx
- [ ] T035 [P] [US1] Add tenant settings route to router configuration in frontend/src/App.tsx
- [ ] T036 [P] [US1] Add loading and error states to tenant form
- [ ] T037 [P] [US1] Add success toast notifications

---

## Phase 4: User Story 2 - View Branches

**Goal:** Admin can list all branches with pagination and view individual branch details

**Independent Test Criteria:**
- [ ] GET /api/v1/branches returns paginated branch list for current tenant only
- [ ] Pagination parameters (page, limit) work correctly
- [ ] includeArchived filter works correctly
- [ ] GET /api/v1/branches/:id returns single branch
- [ ] Cross-tenant branch access returns 403 Forbidden
- [ ] Branch table displays all branches with correct data
- [ ] Pagination controls work correctly

### Backend Tasks

- [ ] T038 [US2] Create Branches module structure in backend/src/branches/
- [ ] T039 [P] [US2] Create BranchListQueryDto with validation in backend/src/branches/dto/branch-list-query.dto.ts
- [ ] T040 [US2] Implement BranchesService.listBranches() with pagination in backend/src/branches/branches.service.ts
- [ ] T041 [US2] Implement BranchesService.getBranch() with tenant validation in backend/src/branches/branches.service.ts
- [ ] T042 [US2] Implement GET /api/v1/branches controller in backend/src/branches/branches.controller.ts
- [ ] T043 [US2] Implement GET /api/v1/branches/:id controller in backend/src/branches/branches.controller.ts
- [ ] T044 [P] [US2] Write unit tests for branch listing logic in backend/src/branches/branches.service.spec.ts
- [ ] T045 [P] [US2] Write integration tests for branch viewing endpoints in backend/test/branches.e2e-spec.ts

### Frontend Tasks

- [ ] T046 [P] [US2] Create branch API client methods for GET operations in frontend/src/api/branches.ts
- [ ] T047 [P] [US2] Create useBranches React Query hook with pagination in frontend/src/hooks/useBranches.ts
- [ ] T048 [P] [US2] Create useBranch hook for single branch in frontend/src/hooks/useBranches.ts
- [ ] T049 [US2] Create BranchTable component with pagination in frontend/src/pages/settings/branches/BranchTable.tsx
- [ ] T050 [US2] Create Branch Management page with table in frontend/src/pages/settings/branches/page.tsx
- [ ] T051 [P] [US2] Add branch management route to router in frontend/src/App.tsx
- [ ] T052 [P] [US2] Add skeleton loading states for table
- [ ] T053 [P] [US2] Add empty state for no branches
- [ ] T054 [P] [US2] Implement archive filter toggle

---

## Phase 5: User Story 3 - Create Branch

**Goal:** Admin can create new branches for their tenant

**Independent Test Criteria:**
- [ ] POST /api/v1/branches creates branch successfully
- [ ] First branch is automatically set as default
- [ ] Branch name uniqueness enforced within tenant (409 on duplicate)
- [ ] Branch name validation works (character set, length)
- [ ] Address validation works (length)
- [ ] Create branch modal opens and closes correctly
- [ ] Form validates inputs before submission
- [ ] Success creates branch and refreshes list

### Backend Tasks

- [ ] T055 [P] [US3] Create CreateBranchDto with validation in backend/src/branches/dto/create-branch.dto.ts
- [ ] T056 [US3] Implement BranchesService.createBranch() with business rules in backend/src/branches/branches.service.ts
- [ ] T057 [US3] Implement POST /api/v1/branches controller in backend/src/branches/branches.controller.ts
- [ ] T058 [P] [US3] Write unit tests for branch creation rules in backend/src/branches/branches.service.spec.ts
- [ ] T059 [P] [US3] Write integration tests for branch creation in backend/test/branches.e2e-spec.ts

### Frontend Tasks

- [ ] T060 [P] [US3] Add createBranch method to API client in frontend/src/api/branches.ts
- [ ] T061 [P] [US3] Create useCreateBranch mutation hook in frontend/src/hooks/useBranches.ts
- [ ] T062 [US3] Create BranchFormModal component for create mode in frontend/src/pages/settings/branches/BranchFormModal.tsx
- [ ] T063 [US3] Add "Add Branch" button to Branch Management page
- [ ] T064 [P] [US3] Add form validation with react-hook-form
- [ ] T065 [P] [US3] Add loading state during creation
- [ ] T066 [P] [US3] Implement query invalidation after creation

---

## Phase 6: User Story 4 - Update Branch

**Goal:** Admin can edit branch name and address

**Independent Test Criteria:**
- [ ] PATCH /api/v1/branches/:id updates branch successfully
- [ ] Name uniqueness validation works (409 on duplicate)
- [ ] Cannot edit branches from other tenants (403)
- [ ] Edit modal opens with current values
- [ ] Form validates inputs before submission
- [ ] Success updates branch and refreshes data

### Backend Tasks

- [ ] T067 [P] [US4] Create UpdateBranchDto with validation in backend/src/branches/dto/update-branch.dto.ts
- [ ] T068 [US4] Implement BranchesService.updateBranch() with validation in backend/src/branches/branches.service.ts
- [ ] T069 [US4] Implement PATCH /api/v1/branches/:id controller in backend/src/branches/branches.controller.ts
- [ ] T070 [P] [US4] Write unit tests for branch update logic in backend/src/branches/branches.service.spec.ts
- [ ] T071 [P] [US4] Write integration tests for branch update in backend/test/branches.e2e-spec.ts

### Frontend Tasks

- [ ] T072 [P] [US4] Add updateBranch method to API client in frontend/src/api/branches.ts
- [ ] T073 [P] [US4] Create useUpdateBranch mutation hook in frontend/src/hooks/useBranches.ts
- [ ] T074 [US4] Add edit mode to BranchFormModal component in frontend/src/pages/settings/branches/BranchFormModal.tsx
- [ ] T075 [US4] Create BranchActionsMenu dropdown component in frontend/src/pages/settings/branches/BranchActionsMenu.tsx
- [ ] T076 [P] [US4] Add "Edit" action to actions menu
- [ ] T077 [P] [US4] Implement query invalidation after update

---

## Phase 7: User Story 5 - Archive and Restore Branch

**Goal:** Admin can archive (soft-delete) and restore branches with business rule enforcement

**Independent Test Criteria:**
- [ ] POST /api/v1/branches/:id/archive archives branch successfully
- [ ] Cannot archive last active branch (400 error)
- [ ] Cannot archive default branch (400 error)
- [ ] POST /api/v1/branches/:id/restore restores branch successfully
- [ ] Archived branches show "Archived" status in UI
- [ ] Confirmation dialog appears before archiving
- [ ] Restore action only available for archived branches

### Backend Tasks

- [ ] T078 [US5] Implement BranchesService.archiveBranch() with validation in backend/src/branches/branches.service.ts
- [ ] T079 [US5] Implement BranchesService.restoreBranch() in backend/src/branches/branches.service.ts
- [ ] T080 [US5] Implement POST /api/v1/branches/:id/archive controller in backend/src/branches/branches.controller.ts
- [ ] T081 [US5] Implement POST /api/v1/branches/:id/restore controller in backend/src/branches/branches.controller.ts
- [ ] T082 [P] [US5] Write unit tests for archival business rules in backend/src/branches/branches.service.spec.ts
- [ ] T083 [P] [US5] Write integration tests for archive and restore in backend/test/branches.e2e-spec.ts

### Frontend Tasks

- [ ] T084 [P] [US5] Add archiveBranch and restoreBranch methods to API client in frontend/src/api/branches.ts
- [ ] T085 [P] [US5] Create useArchiveBranch mutation hook in frontend/src/hooks/useBranches.ts
- [ ] T086 [P] [US5] Create useRestoreBranch mutation hook in frontend/src/hooks/useBranches.ts
- [ ] T087 [US5] Create ConfirmDialog reusable component in frontend/src/components/shared/ConfirmDialog.tsx
- [ ] T088 [US5] Add "Archive" action to BranchActionsMenu
- [ ] T089 [US5] Add "Restore" action to BranchActionsMenu
- [ ] T090 [P] [US5] Add status badges (Active/Archived) to BranchTable
- [ ] T091 [P] [US5] Implement optimistic updates for archive/restore

---

## Phase 8: User Story 6 - Set Default Branch

**Goal:** Admin can change which branch is the default for their tenant

**Independent Test Criteria:**
- [ ] POST /api/v1/branches/:id/set-default sets branch as default
- [ ] Previous default branch is automatically unset
- [ ] Cannot set archived branch as default (400 error)
- [ ] Exactly one default branch exists per tenant at all times
- [ ] Default badge moves to new branch in UI
- [ ] Transaction ensures atomic update of old and new default

### Backend Tasks

- [ ] T092 [US6] Implement BranchesService.setDefaultBranch() with transaction in backend/src/branches/branches.service.ts
- [ ] T093 [US6] Implement POST /api/v1/branches/:id/set-default controller in backend/src/branches/branches.controller.ts
- [ ] T094 [P] [US6] Write unit tests for default branch logic in backend/src/branches/branches.service.spec.ts
- [ ] T095 [P] [US6] Write integration tests for set default in backend/test/branches.e2e-spec.ts

### Frontend Tasks

- [ ] T096 [P] [US6] Add setDefaultBranch method to API client in frontend/src/api/branches.ts
- [ ] T097 [P] [US6] Create useSetDefaultBranch mutation hook in frontend/src/hooks/useBranches.ts
- [ ] T098 [US6] Add "Set as Default" action to BranchActionsMenu
- [ ] T099 [P] [US6] Add "Default" badge to default branch in BranchTable
- [ ] T100 [P] [US6] Implement optimistic updates for default branch changes

---

## Phase 9: Polish & Cross-Cutting Concerns

**Goal:** Finalize UI/UX, error handling, and quality improvements

### UI/UX Polish

- [ ] T101 [P] Implement responsive design for mobile devices
- [ ] T102 [P] Implement responsive design for tablet devices
- [ ] T103 [P] Add keyboard navigation support to all interactive elements
- [ ] T104 [P] Add ARIA labels for accessibility
- [ ] T105 [P] Test and fix focus states
- [ ] T106 [P] Add loading spinners to all async operations
- [ ] T107 [P] Implement error boundaries for unexpected errors

### Security & Performance

- [ ] T108 Create tenant isolation integration test suite in backend/test/tenant-isolation.e2e-spec.ts
- [ ] T109 [P] Add global exception filter for consistent error responses in backend/src/common/filters/http-exception.filter.ts
- [ ] T110 [P] Verify all database queries use proper indexes
- [ ] T111 [P] Test query performance with 10,000+ branches
- [ ] T112 [P] Implement request rate limiting for API endpoints

### Documentation

- [ ] T113 [P] Add JSDoc comments to all service methods
- [ ] T114 [P] Add inline comments for complex business logic
- [ ] T115 [P] Update main README with Tenant Management section
- [ ] T116 [P] Generate API documentation from OpenAPI spec
- [ ] T117 [P] Create demo screenshots or video

---

## Testing Summary

### Unit Tests Coverage
- [ ] Tenant isolation validation (TenantsService, BranchesService)
- [ ] Branch business rules (cannot archive last, cannot archive default, exactly one default)
- [ ] Validation logic (DTOs with class-validator)
- [ ] Default branch transaction logic

### Integration Tests Coverage
- [ ] All tenant endpoints (GET, PATCH)
- [ ] All branch endpoints (GET list, GET by ID, POST, PATCH, archive, restore, set-default)
- [ ] Tenant isolation verification (cross-tenant access returns 403)
- [ ] Edge cases (archiving default, pagination boundaries, duplicate names)

### Manual Testing Checklist
- [ ] Complete user flow: Update tenant settings
- [ ] Complete user flow: Create new branch
- [ ] Complete user flow: Edit existing branch
- [ ] Complete user flow: Archive branch
- [ ] Complete user flow: Set default branch
- [ ] Complete user flow: Restore archived branch
- [ ] Edge case: Cannot archive last branch
- [ ] Edge case: Cannot archive default branch
- [ ] Edge case: Branch name validation
- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile (iOS, Android)
- [ ] Test on tablet

---

## Deployment Checklist

- [ ] T118 Run all unit tests and verify passing
- [ ] T119 Run all integration tests and verify passing
- [ ] T120 Run manual test checklist
- [ ] T121 Review code for linter errors
- [ ] T122 Run `npm audit` and address vulnerabilities
- [ ] T123 Deploy database migration to staging
- [ ] T124 Deploy backend to staging
- [ ] T125 Deploy frontend to staging
- [ ] T126 Smoke test in staging environment
- [ ] T127 Deploy to production with monitoring
- [ ] T128 Monitor production logs for 24 hours

---

## Dependency Graph

```
Setup (T001-T006)
    ↓
Foundational (T007-T021)
    ↓
    ├─→ US1: Tenant Settings (T022-T037) [Can start immediately after foundational]
    ├─→ US2: View Branches (T038-T054) [Can start immediately after foundational]
    ├─→ US3: Create Branch (T055-T066) [Depends on US2 for BranchTable]
    ├─→ US4: Update Branch (T067-T077) [Depends on US3 for BranchFormModal]
    ├─→ US5: Archive/Restore (T078-T091) [Depends on US4 for BranchActionsMenu]
    └─→ US6: Set Default (T092-T100) [Depends on US5 for BranchActionsMenu]
    ↓
Polish & Testing (T101-T117)
    ↓
Deployment (T118-T128)
```

**Critical Path:** Setup → Foundational → US2 → US3 → US4 → US5 → US6 → Deployment  
**Parallelizable:** US1 can be implemented completely independently. Within each US, backend and frontend can work in parallel after DTOs are defined.

---

## Parallel Execution Examples

**Scenario 1: Two developers**
- Developer A: Setup + Foundational → US1 → US3 → US5 → Testing
- Developer B: US2 → US4 → US6 → Polish → Documentation

**Scenario 2: Three developers**
- Developer A (Backend): Setup + Foundational backend → All backend services and controllers → Integration tests
- Developer B (Frontend): Setup + Foundational frontend → US1 & US2 frontend → US3-US6 frontend
- Developer C (QA): Write test plans → Manual testing → Documentation

---

## Task Format Reference

**Format:** `- [ ] [TaskID] [P] [Story] Description with file path`

**Components:**
- `[TaskID]`: T001, T002, etc. (sequential execution order)
- `[P]`: Parallelizable marker (different files, no dependencies on incomplete tasks)
- `[Story]`: [US1], [US2], etc. (user story label for story phases only)
- **Description**: Clear action with exact file path

**Examples:**
- `- [ ] T001 Create project structure` (Setup, no [P] or [Story])
- `- [ ] T022 [US1] Create Tenants module` (US1, not parallelizable with other US1 tasks)
- `- [ ] T023 [P] [US1] Create UpdateTenantDto in backend/src/tenants/dto/update-tenant.dto.ts` (US1, parallelizable)

---

## Task Summary

**Total Tasks:** 128  
**Setup Tasks:** 6  
**Foundational Tasks:** 15  
**User Story Tasks:** 79  
- US1 (Tenant Settings): 16 tasks
- US2 (View Branches): 17 tasks
- US3 (Create Branch): 12 tasks
- US4 (Update Branch): 11 tasks
- US5 (Archive/Restore): 14 tasks
- US6 (Set Default): 9 tasks  
**Polish Tasks:** 17  
**Deployment Tasks:** 11  

**Parallelizable Tasks:** 62 tasks marked with [P]  
**Sequential Tasks:** 66 tasks (require specific ordering)  

**Estimated Total Effort:** 8-10 person-days  
**Suggested MVP Scope:** Setup + Foundational + US1 + US2 (view tenant and branches)

---

## Next Steps

1. **Start with Setup and Foundational tasks** (T001-T021) - These are blocking for all user stories
2. **Implement US1 and US2 in parallel** - Provides immediate value and can be completed independently
3. **Add remaining user stories incrementally** - Each story builds on previous work but can be tested independently
4. **Polish and deploy** - Final quality pass before production

---

**End of Task Breakdown**

