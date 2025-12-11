# Implementation Tasks: Membership Plan Management

**Feature:** 003-membership-plans  
**Version:** 1.0.0  
**Created:** 2025-01-20  
**Status:** Ready for Implementation

---

## Overview

This document contains actionable, dependency-ordered implementation tasks for the Membership Plan Management feature. Tasks are organized by implementation phases, with each task following a strict checklist format for immediate execution.

**Total Tasks:** 146  
**Estimated Effort:** 10-12 person-days

---

## Implementation Strategy

### MVP Scope

The MVP includes Phase 1-3 (Database, Backend Domain, Backend API), enabling plan management via API. Frontend UI (Phase 4-5) can be implemented incrementally.

### Incremental Delivery

- **Phase 1-2:** Core domain model and business logic (testable via unit tests)
- **Phase 3:** API endpoints (testable via integration tests)
- **Phase 4:** Frontend API integration (testable via manual API calls)
- **Phase 5:** Frontend UI (testable via manual user flows)
- **Phase 6:** Comprehensive testing and documentation

### Parallel Execution Opportunities

Tasks marked with `[P]` can be executed in parallel if they:

- Modify different files
- Have no dependencies on incomplete tasks
- Are independent components

---

## Phase 1: Database Schema & Migration

**Goal:** Create MembershipPlan model and migrate existing Member data

**Independent Test Criteria:**

- Prisma schema validates without errors
- Migrations run successfully on development database
- Data migration script creates plans and assigns members correctly
- All members have valid `membershipPlanId` after migration

### Setup Tasks

- [x] T001 Install date-fns package for duration calculations in backend/package.json
- [x] T002 Update Prisma schema with MembershipPlan model in backend/prisma/schema.prisma
- [x] T003 Add DurationType and PlanStatus enums to Prisma schema in backend/prisma/schema.prisma
- [x] T004 Add membershipPlanId field (nullable) to Member model in backend/prisma/schema.prisma
- [x] T005 Add membershipPriceAtPurchase field (nullable) to Member model in backend/prisma/schema.prisma
- [x] T006 Keep membershipType field temporarily (nullable) for migration in backend/prisma/schema.prisma
- [x] T007 Add MembershipPlan-Tenant relation with CASCADE delete in backend/prisma/schema.prisma
- [x] T008 Add MembershipPlan-Member relation in backend/prisma/schema.prisma
- [x] T009 Add unique constraint on [tenantId, name] for MembershipPlan in backend/prisma/schema.prisma
- [x] T010 Add index on [tenantId] for MembershipPlan in backend/prisma/schema.prisma
- [x] T011 Add index on [tenantId, status] for MembershipPlan in backend/prisma/schema.prisma
- [x] T012 Add index on [tenantId, sortOrder] for MembershipPlan in backend/prisma/schema.prisma
- [x] T013 Add index on [membershipPlanId] for Member in backend/prisma/schema.prisma
- [x] T014 Add index on [tenantId, membershipPlanId] for Member in backend/prisma/schema.prisma

### Migration Tasks

- [x] T015 [P] Create migration for MembershipPlan table creation in backend/prisma/migrations/
- [x] T016 Create migration for Member model changes (add nullable fields) in backend/prisma/migrations/
- [x] T017 Create data migration script to create plans from membershipType values in backend/prisma/migrations/
- [x] T018 Create data migration script to assign members to plans in backend/prisma/migrations/
- [x] T019 Create final migration to remove membershipType column in backend/prisma/migrations/
- [x] T020 Create final migration to make membershipPlanId NOT NULL in backend/prisma/migrations/

---

## Phase 2: Backend Domain & Service Layer

**Goal:** Implement business logic for plan management and member-plan integration

**Independent Test Criteria:**

- Duration calculator handles DAYS and MONTHS correctly with edge cases
- MembershipPlansService enforces tenant isolation and validation rules
- MembersService integrates with plans and calculates end dates correctly
- All business rules are testable via unit tests

### Duration Calculation

- [x] T021 [P] Create duration calculator utility file in backend/src/membership-plans/utils/duration-calculator.ts
- [x] T022 [P] Implement calculateEndDate function for DAYS duration in backend/src/membership-plans/utils/duration-calculator.ts
- [x] T023 [P] Implement calculateEndDate function for MONTHS duration using date-fns addMonths in backend/src/membership-plans/utils/duration-calculator.ts
- [x] T024 [P] Add unit tests for DAYS duration calculation in backend/src/membership-plans/utils/duration-calculator.spec.ts
- [x] T025 [P] Add unit tests for MONTHS duration month-end clamping (Jan 31 + 1 month) in backend/src/membership-plans/utils/duration-calculator.spec.ts
- [x] T026 [P] Add unit tests for leap year edge cases in backend/src/membership-plans/utils/duration-calculator.spec.ts

### Plan Service

- [x] T027 [P] Create MembershipPlansService file in backend/src/membership-plans/membership-plans.service.ts
- [x] T028 [P] Implement create method with tenant isolation in backend/src/membership-plans/membership-plans.service.ts
- [x] T029 [P] Implement findAll method with pagination and filters in backend/src/membership-plans/membership-plans.service.ts
- [x] T030 [P] Implement findOne method with tenant validation in backend/src/membership-plans/membership-plans.service.ts
- [x] T031 [P] Implement update method with name uniqueness check in backend/src/membership-plans/membership-plans.service.ts
- [x] T032 [P] Implement delete method with archival protection check in backend/src/membership-plans/membership-plans.service.ts
- [x] T033 [P] Implement plan name uniqueness validation (case-insensitive) in backend/src/membership-plans/membership-plans.service.ts
- [x] T034 [P] Implement duration value validation (strict ranges: DAYS 1-730, MONTHS 1-24) in backend/src/membership-plans/membership-plans.service.ts
- [x] T035 [P] Implement currency validation (ISO 4217 regex) in backend/src/membership-plans/membership-plans.service.ts
- [x] T036 [P] Implement checkActiveMemberCount method (status=ACTIVE AND membershipEndDate>=today) in backend/src/membership-plans/membership-plans.service.ts
- [x] T037 [P] Implement archive method with active member warning in backend/src/membership-plans/membership-plans.service.ts
- [x] T038 [P] Implement restore method to reactivate archived plans in backend/src/membership-plans/membership-plans.service.ts

### Member Service Integration

- [x] T039 Update MembersService create method to accept membershipPlanId in backend/src/members/members.service.ts
- [x] T040 Add plan validation (exists, ACTIVE, belongs to tenant) in MembersService.create in backend/src/members/members.service.ts
- [x] T041 Add membershipEndDate calculation using duration calculator in MembersService.create in backend/src/members/members.service.ts
- [x] T042 Add membershipPriceAtPurchase defaulting to plan price in MembersService.create in backend/src/members/members.service.ts
- [x] T043 Remove membershipType handling from MembersService.create in backend/src/members/members.service.ts

### Member DTOs

- [x] T044 [P] Update CreateMemberDto to replace membershipType with membershipPlanId (required) in backend/src/members/dto/create-member.dto.ts
- [x] T045 [P] Remove membershipEndDate from CreateMemberDto in backend/src/members/dto/create-member.dto.ts
- [x] T046 [P] Add optional membershipPriceAtPurchase to CreateMemberDto in backend/src/members/dto/create-member.dto.ts
- [x] T047 [P] Add optional membershipStartDate to CreateMemberDto in backend/src/members/dto/create-member.dto.ts
- [x] T048 [P] Update UpdateMemberDto to disallow membershipPlanId changes in backend/src/members/dto/update-member.dto.ts

---

## Phase 3: Backend API Controllers

**Goal:** Implement HTTP endpoints for plan management

**Independent Test Criteria:**

- All plan endpoints return correct responses with proper status codes
- Tenant isolation enforced (cross-tenant access returns 403)
- Validation errors return 400 with clear messages
- Authorization checks prevent unauthorized access
- Member creation endpoint accepts membershipPlanId and calculates end date

### Plan DTOs

- [ ] T049 [P] Create CreatePlanDto with validation decorators in backend/src/membership-plans/dto/create-plan.dto.ts
- [ ] T050 [P] Create UpdatePlanDto with optional fields in backend/src/membership-plans/dto/update-plan.dto.ts
- [ ] T051 [P] Create PlanListQueryDto for query parameters in backend/src/membership-plans/dto/plan-list-query.dto.ts

### Plan Controller

- [ ] T052 [P] Create MembershipPlansController file in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T053 [P] Implement GET /api/v1/membership-plans list endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T054 [P] Implement GET /api/v1/membership-plans/active endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T055 [P] Implement GET /api/v1/membership-plans/:id endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T056 [P] Implement POST /api/v1/membership-plans create endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T057 [P] Implement PATCH /api/v1/membership-plans/:id update endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T058 [P] Implement POST /api/v1/membership-plans/:id/archive endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T059 [P] Implement POST /api/v1/membership-plans/:id/restore endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T060 [P] Implement DELETE /api/v1/membership-plans/:id endpoint in backend/src/membership-plans/membership-plans.controller.ts
- [ ] T061 Add JWT and role guards to all plan endpoints in backend/src/membership-plans/membership-plans.controller.ts

### Module Setup

- [ ] T062 [P] Create MembershipPlansModule in backend/src/membership-plans/membership-plans.module.ts
- [ ] T063 Import PrismaModule in MembershipPlansModule in backend/src/membership-plans/membership-plans.module.ts
- [ ] T064 Provide MembershipPlansService in MembershipPlansModule in backend/src/membership-plans/membership-plans.module.ts
- [ ] T065 Export MembershipPlansService for use in MembersModule in backend/src/membership-plans/membership-plans.module.ts
- [ ] T066 Register MembershipPlansModule in AppModule in backend/src/app.module.ts

### Member Controller Updates

- [ ] T067 Update MembersController create endpoint to use new CreateMemberDto in backend/src/members/members.controller.ts
- [ ] T068 Add includePlan query parameter support to MembersController get endpoint in backend/src/members/members.controller.ts
- [ ] T069 Import MembershipPlansService in MembersModule in backend/src/members/members.module.ts

---

## Phase 4: Frontend API Client & Hooks

**Goal:** Create frontend API integration for plan management

**Independent Test Criteria:**

- API client methods match backend contracts
- React Query hooks handle loading, error, and success states
- TypeScript types match backend DTOs
- Member API client updated to use new request structure

### API Client

- [ ] T070 [P] Create membership plans API client file in frontend/src/api/membership-plans.ts
- [ ] T071 [P] Implement listPlans function with query params in frontend/src/api/membership-plans.ts
- [ ] T072 [P] Implement getActivePlans function in frontend/src/api/membership-plans.ts
- [ ] T073 [P] Implement getPlan function in frontend/src/api/membership-plans.ts
- [ ] T074 [P] Implement createPlan function in frontend/src/api/membership-plans.ts
- [ ] T075 [P] Implement updatePlan function in frontend/src/api/membership-plans.ts
- [ ] T076 [P] Implement archivePlan function in frontend/src/api/membership-plans.ts
- [ ] T077 [P] Implement restorePlan function in frontend/src/api/membership-plans.ts
- [ ] T078 [P] Implement deletePlan function in frontend/src/api/membership-plans.ts

### React Query Hooks

- [ ] T079 [P] Create use-membership-plans hooks file in frontend/src/hooks/use-membership-plans.ts
- [ ] T080 [P] Implement useMembershipPlans hook for list with filters in frontend/src/hooks/use-membership-plans.ts
- [ ] T081 [P] Implement useActivePlans hook for dropdowns in frontend/src/hooks/use-membership-plans.ts
- [ ] T082 [P] Implement useMembershipPlan hook for single plan in frontend/src/hooks/use-membership-plans.ts
- [ ] T083 [P] Implement useCreatePlan mutation hook in frontend/src/hooks/use-membership-plans.ts
- [ ] T084 [P] Implement useUpdatePlan mutation hook in frontend/src/hooks/use-membership-plans.ts
- [ ] T085 [P] Implement useArchivePlan mutation hook in frontend/src/hooks/use-membership-plans.ts
- [ ] T086 [P] Implement useRestorePlan mutation hook in frontend/src/hooks/use-membership-plans.ts
- [ ] T087 [P] Implement useDeletePlan mutation hook in frontend/src/hooks/use-membership-plans.ts

### TypeScript Types

- [ ] T088 [P] Create membership-plan types file in frontend/src/types/membership-plan.ts
- [ ] T089 [P] Add MembershipPlan interface in frontend/src/types/membership-plan.ts
- [ ] T090 [P] Add DurationType enum in frontend/src/types/membership-plan.ts
- [ ] T091 [P] Add PlanStatus enum in frontend/src/types/membership-plan.ts
- [ ] T092 [P] Update Member interface to remove membershipType in frontend/src/types/member.ts
- [ ] T093 [P] Update Member interface to add membershipPlanId in frontend/src/types/member.ts
- [ ] T094 [P] Update Member interface to add membershipPriceAtPurchase in frontend/src/types/member.ts
- [ ] T095 [P] Update Member interface to add optional membershipPlan relation in frontend/src/types/member.ts

### Member API Client Updates

- [ ] T096 [P] Update createMember function to use membershipPlanId in frontend/src/api/members.ts
- [ ] T097 [P] Update createMember function to remove membershipType in frontend/src/api/members.ts
- [ ] T098 [P] Update createMember function to add optional membershipStartDate in frontend/src/api/members.ts
- [ ] T099 [P] Update createMember function to add optional membershipPriceAtPurchase in frontend/src/api/members.ts

---

## Phase 5: Frontend UI Components

**Goal:** Build plan management UI and update member forms

**Independent Test Criteria:**

- Plan list page displays plans with filters and pagination
- Plan creation form validates all fields correctly
- Plan edit page shows active member warnings
- Member creation form uses plan selector and shows duration preview
- All components follow shadcn/ui design system

### Plan Components

- [ ] T100 [P] Create PlanSelector component in frontend/src/components/membership-plans/PlanSelector.tsx
- [ ] T101 [P] Create DurationPreview component in frontend/src/components/membership-plans/DurationPreview.tsx
- [ ] T102 [P] Create PlanForm component in frontend/src/components/membership-plans/PlanForm.tsx
- [ ] T103 [P] Create PlanCard component in frontend/src/components/membership-plans/PlanCard.tsx
- [ ] T104 [P] Create PlanStatusBadge component in frontend/src/components/membership-plans/PlanStatusBadge.tsx

### Plan Pages

- [ ] T105 [P] Create Plan List page in frontend/src/pages/MembershipPlansPage.tsx
- [ ] T106 [P] Create Create Plan page in frontend/src/pages/CreatePlanPage.tsx
- [ ] T107 [P] Create Edit Plan page in frontend/src/pages/EditPlanPage.tsx
- [ ] T108 Add routes for plan pages in frontend/src/App.tsx or router config

### Member Form Updates

- [ ] T109 Update MemberForm to replace membershipType with PlanSelector in frontend/src/components/members/MemberForm.tsx
- [ ] T110 Add DurationPreview component to MemberForm in frontend/src/components/members/MemberForm.tsx
- [ ] T111 Add optional membershipStartDate date picker to MemberForm in frontend/src/components/members/MemberForm.tsx
- [ ] T112 Remove membershipEndDate input from MemberForm in frontend/src/components/members/MemberForm.tsx
- [ ] T113 Update MemberDetail page to display plan information in frontend/src/pages/MemberDetailPage.tsx
- [ ] T114 Add plan change disabled message to MemberDetail page in frontend/src/pages/MemberDetailPage.tsx

---

## Phase 6: Testing & Documentation

**Goal:** Complete test coverage and update documentation

**Independent Test Criteria:**

- All unit tests pass with >80% coverage
- All integration tests pass
- API documentation is complete and accurate
- Migration guide is clear and tested
- README files updated with plan management instructions

### Unit Tests

- [ ] T115 Write unit tests for duration calculation DAYS in backend/src/membership-plans/utils/duration-calculator.spec.ts
- [ ] T116 Write unit tests for duration calculation MONTHS month-end clamping in backend/src/membership-plans/utils/duration-calculator.spec.ts
- [ ] T117 Write unit tests for duration calculation edge cases (leap years, year boundaries) in backend/src/membership-plans/utils/duration-calculator.spec.ts
- [ ] T118 Write unit tests for MembershipPlansService CRUD operations in backend/src/membership-plans/membership-plans.service.spec.ts
- [ ] T119 Write unit tests for MembershipPlansService tenant isolation in backend/src/membership-plans/membership-plans.service.spec.ts
- [ ] T120 Write unit tests for MembershipPlansService plan name uniqueness validation in backend/src/membership-plans/membership-plans.service.spec.ts
- [ ] T121 Write unit tests for MembershipPlansService duration value validation in backend/src/membership-plans/membership-plans.service.spec.ts
- [ ] T122 Write unit tests for MembershipPlansService currency validation in backend/src/membership-plans/membership-plans.service.spec.ts
- [ ] T123 Write unit tests for MembershipPlansService archival protection logic in backend/src/membership-plans/membership-plans.service.spec.ts

### Integration Tests

- [ ] T124 Write integration test for GET /api/v1/membership-plans list endpoint in backend/test/membership-plans.e2e-spec.ts
- [ ] T125 Write integration test for GET /api/v1/membership-plans/active endpoint in backend/test/membership-plans.e2e-spec.ts
- [ ] T126 Write integration test for GET /api/v1/membership-plans/:id endpoint in backend/test/membership-plans.e2e-spec.ts
- [ ] T127 Write integration test for POST /api/v1/membership-plans create endpoint in backend/test/membership-plans.e2e-spec.ts
- [ ] T128 Write integration test for duplicate plan name validation in backend/test/membership-plans.e2e-spec.ts
- [ ] T129 Write integration test for PATCH /api/v1/membership-plans/:id update endpoint in backend/test/membership-plans.e2e-spec.ts
- [ ] T130 Write integration test for POST /api/v1/membership-plans/:id/archive endpoint in backend/test/membership-plans.e2e-spec.ts
- [ ] T131 Write integration test for POST /api/v1/membership-plans/:id/restore endpoint in backend/test/membership-plans.e2e-spec.ts
- [ ] T132 Write integration test for DELETE /api/v1/membership-plans/:id with members protection in backend/test/membership-plans.e2e-spec.ts
- [ ] T133 Write integration test for tenant isolation (cross-tenant access blocked) in backend/test/membership-plans.e2e-spec.ts
- [ ] T134 Write integration test for member creation with plan in backend/test/members/members.e2e-spec.ts
- [ ] T135 Write integration test for member creation with invalid plan in backend/test/members/members.e2e-spec.ts
- [ ] T136 Write integration test for member creation with archived plan rejection in backend/test/members/members.e2e-spec.ts

### Documentation

- [ ] T137 Update OpenAPI/Swagger spec with plan endpoints in API documentation files
- [ ] T138 Document request/response examples for plan endpoints in API documentation files
- [ ] T139 Write migration guide document in backend/docs/migration-guide-membership-plans.md
- [ ] T140 Document migration steps in backend/docs/migration-guide-membership-plans.md
- [ ] T141 Document rollback procedure in backend/docs/migration-guide-membership-plans.md
- [ ] T142 Document post-migration verification steps in backend/docs/migration-guide-membership-plans.md
- [ ] T143 Update backend README with plan management section in backend/README.md
- [ ] T144 Update frontend README with plan management section in frontend/README.md
- [ ] T145 Add inline comments for duration calculation logic in backend/src/membership-plans/utils/duration-calculator.ts
- [ ] T146 Add inline comments for archival protection logic in backend/src/membership-plans/membership-plans.service.ts

---

## Dependencies

### Task Dependencies

**Phase 1 → Phase 2:**

- Phase 2 requires Phase 1 migrations complete (T015-T020 must complete before T021)

**Phase 2 → Phase 3:**

- Phase 3 requires Phase 2 services complete (T027-T048 must complete before T052)

**Phase 3 → Phase 4:**

- Phase 4 requires Phase 3 API endpoints complete (T052-T069 must complete before T070)

**Phase 4 → Phase 5:**

- Phase 5 requires Phase 4 API client complete (T070-T099 must complete before T100)

**Phase 2-5 → Phase 6:**

- Phase 6 testing requires implementation complete (T021-T114 must complete before T115)

### Story Dependencies

**User Story 1: Plan Management (US1)**

- Tasks: T027-T038, T049-T066 (Plan service and API)
- Can be implemented independently after Phase 1

**User Story 2: Member-Plan Integration (US2)**

- Tasks: T039-T048, T067-T069 (Member service updates)
- Depends on: US1 (plan service must exist)

**User Story 3: Frontend Plan Management (US3)**

- Tasks: T070-T108 (Frontend API and UI)
- Depends on: US1, US2 (backend must be complete)

**User Story 4: Frontend Member Integration (US4)**

- Tasks: T109-T114 (Member form updates)
- Depends on: US2, US3 (plan UI and member service must exist)

### Parallel Execution Examples

**Example 1: Duration Calculator (T021-T026)**

- All duration calculator tasks can run in parallel
- They modify the same file but different functions
- Tests can be written alongside implementation

**Example 2: Plan Service Methods (T028-T038)**

- CRUD methods can be implemented in parallel
- Each method is independent
- Tests can be written per method

**Example 3: Frontend Components (T100-T104)**

- All plan components can be created in parallel
- They are independent UI components
- Can be developed by different developers

**Example 4: API Client Methods (T071-T078)**

- All API client methods can be implemented in parallel
- Each method is independent
- Can be developed concurrently

---

## Implementation Notes

### Critical Path

1. Phase 1 (Database) → Phase 2 (Services) → Phase 3 (API) → Phase 4 (Frontend API) → Phase 5 (Frontend UI) → Phase 6 (Testing)

### Risk Mitigation

- Test migrations on development database before production
- Verify tenant isolation with integration tests before deployment
- Test data migration script with sample data before full migration

### Code Review Checklist

- [ ] Tenant isolation enforced in all queries
- [ ] Duration calculation handles all edge cases
- [ ] Validation rules match spec requirements
- [ ] Error messages are clear and user-friendly
- [ ] Tests cover critical business logic
- [ ] API contracts match spec.md

---

## Summary

### Task Count by Phase

- **Phase 1 (Database Schema & Migration):** 20 tasks (T001-T020)
- **Phase 2 (Backend Domain & Service Layer):** 28 tasks (T021-T048)
- **Phase 3 (Backend API Controllers):** 21 tasks (T049-T069)
- **Phase 4 (Frontend API Client & Hooks):** 30 tasks (T070-T099)
- **Phase 5 (Frontend UI Components):** 15 tasks (T100-T114)
- **Phase 6 (Testing & Documentation):** 32 tasks (T115-T146)

**Total:** 146 tasks

### Parallel Opportunities

**Phase 2:**

- Duration calculator tasks (T021-T026): 6 parallel tasks
- Plan service methods (T028-T038): 11 parallel tasks
- Member DTOs (T044-T048): 5 parallel tasks

**Phase 3:**

- Plan DTOs (T049-T051): 3 parallel tasks
- Plan controller endpoints (T052-T060): 9 parallel tasks

**Phase 4:**

- API client methods (T071-T078): 8 parallel tasks
- React Query hooks (T080-T087): 8 parallel tasks
- TypeScript types (T088-T095): 8 parallel tasks

**Phase 5:**

- Plan components (T100-T104): 5 parallel tasks
- Plan pages (T105-T107): 3 parallel tasks

**Phase 6:**

- Unit tests (T115-T123): 9 parallel tasks
- Integration tests (T124-T136): 13 parallel tasks

**Total Parallelizable Tasks:** ~75 tasks (51% of total)

### Independent Test Criteria by Phase

**Phase 1:**

- Prisma schema validates without errors
- Migrations run successfully on development database
- Data migration script creates plans and assigns members correctly
- All members have valid `membershipPlanId` after migration

**Phase 2:**

- Duration calculator handles DAYS and MONTHS correctly with edge cases
- MembershipPlansService enforces tenant isolation and validation rules
- MembersService integrates with plans and calculates end dates correctly
- All business rules are testable via unit tests

**Phase 3:**

- All plan endpoints return correct responses with proper status codes
- Tenant isolation enforced (cross-tenant access returns 403)
- Validation errors return 400 with clear messages
- Authorization checks prevent unauthorized access
- Member creation endpoint accepts membershipPlanId and calculates end date

**Phase 4:**

- API client methods match backend contracts
- React Query hooks handle loading, error, and success states
- TypeScript types match backend DTOs
- Member API client updated to use new request structure

**Phase 5:**

- Plan list page displays plans with filters and pagination
- Plan creation form validates all fields correctly
- Plan edit page shows active member warnings
- Member creation form uses plan selector and shows duration preview
- All components follow shadcn/ui design system

**Phase 6:**

- All unit tests pass with >80% coverage
- All integration tests pass
- API documentation is complete and accurate
- Migration guide is clear and tested
- README files updated with plan management instructions

### Suggested MVP Scope

**MVP (Minimum Viable Product):**

- Phase 1: Database Schema & Migration (T001-T020)
- Phase 2: Backend Domain & Service Layer (T021-T048)
- Phase 3: Backend API Controllers (T049-T069)

**MVP Deliverables:**

- Complete plan management API (CRUD operations)
- Member creation with plan selection via API
- Automatic membership end date calculation
- Tenant isolation enforced
- Basic unit and integration tests

**Post-MVP (Incremental):**

- Phase 4: Frontend API Client & Hooks (T070-T099)
- Phase 5: Frontend UI Components (T100-T114)
- Phase 6: Comprehensive Testing & Documentation (T115-T146)

### Format Validation

✅ All tasks follow checklist format: `- [ ] [TaskID] [P?] Description with file path`
✅ All tasks have unique sequential IDs (T001-T146)
✅ Parallelizable tasks marked with `[P]`
✅ All tasks include explicit file paths
✅ Tasks organized by implementation phases
✅ Dependencies clearly documented
✅ Independent test criteria provided per phase

---

**End of Tasks**
