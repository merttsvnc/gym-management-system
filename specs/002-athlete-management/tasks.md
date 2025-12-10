# Task Breakdown: Member Management (Üye Yönetimi)

**Feature:** Member Management (Üye Yönetimi)  
**Plan Version:** 1.0.0 (Plan-Lite)  
**Generated:** 2025-01-20  
**Status:** Not Started

---

## Overview

This document provides an actionable, dependency-ordered task list for implementing the Member Management module. Tasks are organized by phase to enable incremental implementation following the Plan-Lite structure.

**Total Estimated Effort:** 6-8 person-days (MVP scope)

---

## Implementation Strategy

**MVP-First Approach:**

- **MVP Scope:** Phases 1-3 provide core member CRUD functionality
- **Incremental Delivery:** Each phase represents a complete, testable increment
- **Independent Components:** Backend and frontend can be developed in parallel after Phase 1

**Parallel Execution:**

- Phase 1 (Data Model) must complete first
- Phase 2 (Backend API) and Phase 3 (Frontend UI) can be parallelized after Phase 1
- Phase 4 (Freeze Logic) depends on Phase 2 completion
- Phase 5 (QA + Polish) depends on all previous phases

---

## Phase 1: Data Model (Prisma)

**Goal:** Create Member model with all required fields, enums, indexes, and relationships

**Acceptance Criteria:**

- `npx prisma validate` passes
- Migration applies successfully
- Prisma Client regenerated

### Tasks

- [x] T001 Create Member model in backend/prisma/schema.prisma with core profile fields (firstName, lastName, phone, email, gender, dateOfBirth)
- [x] T002 [P] Add MemberStatus enum (ACTIVE, PAUSED, INACTIVE, ARCHIVED) to backend/prisma/schema.prisma
- [x] T003 [P] Add MemberGender enum (MALE, FEMALE) to backend/prisma/schema.prisma
- [x] T004 Add membership fields (membershipType, membershipStartAt, membershipEndAt) to Member model in backend/prisma/schema.prisma
- [x] T005 Add status fields (status, pausedAt, resumedAt) to Member model in backend/prisma/schema.prisma
- [x] T006 Add notes field and timestamps (createdAt, updatedAt) to Member model in backend/prisma/schema.prisma
- [x] T007 Add tenantId and branchId foreign key relations to Member model in backend/prisma/schema.prisma
- [x] T008 Add database indexes (@@index([tenantId, branchId]) and @@index([tenantId, phone])) to Member model in backend/prisma/schema.prisma
- [x] T009 Generate Prisma migration for Member model in backend/prisma/migrations/
- [x] T010 Review migration SQL for safety and correctness
- [x] T011 Apply migration to development database
- [x] T012 Generate Prisma Client types

---

## Phase 2: Backend API

**Goal:** Implement all member management endpoints with validation, tenant isolation, and business logic

**Acceptance Criteria:**

- All endpoints functional
- Phone uniqueness validation working
- Search working (substring, case-insensitive)
- Tenant/branch isolation verified
- All error messages in Turkish

### DTOs and Validation

- [x] T013 Create CreateMemberDto with validation decorators in backend/src/members/dto/create-member.dto.ts
- [x] T014 [P] Create UpdateMemberDto with validation decorators in backend/src/members/dto/update-member.dto.ts
- [x] T015 [P] Create ChangeMemberStatusDto with validation decorators in backend/src/members/dto/change-member-status.dto.ts
- [x] T016 [P] Create MemberListQueryDto with pagination and filter validation in backend/src/members/dto/member-list-query.dto.ts

### Service Layer

- [x] T017 Create Members module structure in backend/src/members/
- [x] T018 Implement MembersService.create() with phone uniqueness check in backend/src/members/members.service.ts
- [x] T019 Implement MembersService.findAll() with filters, pagination, and search in backend/src/members/members.service.ts
- [x] T020 Implement MembersService.findOne() with tenant isolation in backend/src/members/members.service.ts
- [x] T021 Implement MembersService.update() with phone uniqueness check in backend/src/members/members.service.ts
- [x] T022 Implement MembersService.changeStatus() with transition validation in backend/src/members/members.service.ts
- [x] T023 Implement MembersService.archive() in backend/src/members/members.service.ts
- [x] T024 Implement MembersService.calculateRemainingDays() helper method in backend/src/members/members.service.ts

### Controllers

- [x] T025 Implement GET /api/v1/members controller with query params in backend/src/members/members.controller.ts
- [x] T026 Implement GET /api/v1/members/:id controller in backend/src/members/members.controller.ts
- [x] T027 Implement POST /api/v1/members controller in backend/src/members/members.controller.ts
- [x] T028 Implement PATCH /api/v1/members/:id controller in backend/src/members/members.controller.ts
- [x] T029 Implement POST /api/v1/members/:id/status controller in backend/src/members/members.controller.ts
- [x] T030 Implement POST /api/v1/members/:id/archive controller in backend/src/members/members.controller.ts

### Error Handling

- [x] T031 [P] Add Turkish error messages to all service exceptions in backend/src/members/members.service.ts
- [x] T032 [P] Configure exception filter for Turkish error responses in backend/src/common/filters/http-exception.filter.ts

---

## Phase 3: Frontend UI

**Goal:** Implement all member management pages and components with Turkish UI

**Acceptance Criteria:**

- All pages functional
- Form validation working (Turkish errors)
- Search and filters working
- Status change flow working

### API Client and Hooks

- [x] T033 Create members API client methods in frontend/src/api/members.ts
- [x] T034 [P] Create useMembers React Query hook with pagination and filters in frontend/src/hooks/useMembers.ts
- [x] T035 [P] Create useMember hook for single member in frontend/src/hooks/useMembers.ts
- [x] T036 [P] Create useCreateMember mutation hook in frontend/src/hooks/useMembers.ts
- [x] T037 [P] Create useUpdateMember mutation hook in frontend/src/hooks/useMembers.ts
- [x] T038 [P] Create useChangeMemberStatus mutation hook in frontend/src/hooks/useMembers.ts
- [x] T039 [P] Create useArchiveMember mutation hook in frontend/src/hooks/useMembers.ts

### Components

- [x] T040 Create MemberList component with table, filters, and search in frontend/src/components/members/MemberList.tsx
- [x] T041 [P] Create MemberStatusBadge component with color coding in frontend/src/components/members/MemberStatusBadge.tsx
- [x] T042 [P] Create MemberForm component for create/edit in frontend/src/components/members/MemberForm.tsx
- [x] T043 [P] Create MembershipTypeSelector component with Basic/Standard/Premium/Custom options in frontend/src/components/members/MembershipTypeSelector.tsx
- [x] T044 [P] Create StatusChangeDialog component in frontend/src/components/members/StatusChangeDialog.tsx
- [x] T045 [P] Create ArchiveConfirmDialog component in frontend/src/components/members/ArchiveConfirmDialog.tsx

### Pages

- [x] T046 Create Member List page (/members) in frontend/src/pages/MembersPage.tsx
- [x] T047 Create Create Member page (/members/new) in frontend/src/pages/CreateMemberPage.tsx
- [x] T048 Create Member Detail page (/members/:id) in frontend/src/pages/MemberDetailPage.tsx
- [x] T049 Create Edit Member page (/members/:id/edit) in frontend/src/pages/EditMemberPage.tsx

### Routing and Polish

- [x] T050 [P] Add member routes to router configuration in frontend/src/App.tsx or router config
- [x] T051 [P] Add loading states (skeletons) to MemberList component
- [x] T052 [P] Add error states with Turkish error messages
- [x] T053 [P] Add success toast notifications for all mutations
- [x] T054 [P] Implement search debouncing (300ms) in MemberList component

---

## Phase 4: Freeze Logic (PAUSED)

**Goal:** Implement pause/resume logic with timestamp tracking and membership extension

**Acceptance Criteria:**

- Freeze logic tests pass
- Timestamps correctly set/cleared
- Membership end date extended correctly
- Remaining days calculation accurate

### Service Logic Updates

- [x] T055 Update MembersService.changeStatus() to handle pausedAt timestamp when status → PAUSED in backend/src/members/members.service.ts
- [x] T056 Update MembersService.changeStatus() to handle resumedAt timestamp and extend membershipEndAt when PAUSED → ACTIVE in backend/src/members/members.service.ts
- [x] T057 Update MembersService.calculateRemainingDays() to account for paused periods in backend/src/members/members.service.ts

### Testing

- [ ] T058 [P] Write unit test for Active → Paused → Active transition in backend/src/members/members.service.spec.ts
- [ ] T059 [P] Write unit test for pause duration calculation and membershipEndAt extension in backend/src/members/members.service.spec.ts
- [ ] T060 [P] Write unit test for remaining days calculation with paused periods in backend/src/members/members.service.spec.ts
- [ ] T061 [P] Write integration test for pause/resume flow in backend/test/members.e2e-spec.ts

---

## Phase 5: QA + Polish

**Goal:** Finalize testing, error handling, and code quality

**Acceptance Criteria:**

- All tests passing
- No critical issues
- Module ready for PR

### Testing

- [ ] T062 [P] Write smoke tests for all endpoints in backend/test/members.e2e-spec.ts
- [ ] T063 [P] Write tenant isolation tests (cross-tenant access returns 403) in backend/test/members.e2e-spec.ts
- [ ] T064 [P] Write status change transition tests in backend/test/members.e2e-spec.ts
- [ ] T065 [P] Write phone uniqueness validation tests in backend/test/members.e2e-spec.ts
- [ ] T066 [P] Write search functionality tests (substring, case-insensitive) in backend/test/members.e2e-spec.ts

### Code Quality

- [ ] T067 [P] Remove console.logs and debug statements from all files
- [ ] T068 [P] Verify all Turkish error messages are correct and consistent
- [ ] T069 [P] Add JSDoc comments to service methods in backend/src/members/members.service.ts
- [ ] T070 [P] Add inline comments for complex logic (remaining days calculation, status transitions)

### Documentation

- [ ] T071 [P] Update quickstart.md with member management test scenarios in specs/002-athlete-management/quickstart.md

---

## Dependency Graph

```
Phase 1: Data Model (T001-T012)
    ↓
    ├─→ Phase 2: Backend API (T013-T032) [Can start after Phase 1]
    └─→ Phase 3: Frontend UI (T033-T054) [Can start after Phase 1, parallel with Phase 2]
        ↓
        Phase 4: Freeze Logic (T055-T061) [Depends on Phase 2]
        ↓
        Phase 5: QA + Polish (T062-T071) [Depends on all previous phases]
```

**Critical Path:** Phase 1 → Phase 2 → Phase 4 → Phase 5  
**Parallelizable:** Phase 2 and Phase 3 can run in parallel after Phase 1. Within each phase, many tasks marked with [P] can be parallelized.

---

## Parallel Execution Examples

**Scenario 1: Two developers**

- Developer A: Phase 1 → Phase 2 (Backend) → Phase 4 → Phase 5 (Backend tests)
- Developer B: Phase 1 → Phase 3 (Frontend) → Phase 5 (Frontend polish)

**Scenario 2: Three developers**

- Developer A (Backend): Phase 1 → Phase 2 → Phase 4 → Backend tests
- Developer B (Frontend): Phase 1 → Phase 3 → Frontend polish
- Developer C (QA): Write test plans → Manual testing → Documentation

---

## Task Format Reference

**Format:** `- [ ] [TaskID] [P] Description with file path`

**Components:**

- `[TaskID]`: T001, T002, etc. (sequential execution order)
- `[P]`: Parallelizable marker (different files, no dependencies on incomplete tasks)
- **Description**: Clear action with exact file path

**Examples:**

- `- [ ] T001 Create Member model in backend/prisma/schema.prisma` (Phase 1, not parallelizable)
- `- [ ] T002 [P] Add MemberStatus enum to backend/prisma/schema.prisma` (Phase 1, parallelizable)
- `- [ ] T013 Create CreateMemberDto in backend/src/members/dto/create-member.dto.ts` (Phase 2, not parallelizable)

---

## Task Summary

**Total Tasks:** 71  
**Phase 1 (Data Model):** 12 tasks  
**Phase 2 (Backend API):** 20 tasks  
**Phase 3 (Frontend UI):** 22 tasks  
**Phase 4 (Freeze Logic):** 7 tasks  
**Phase 5 (QA + Polish):** 10 tasks

**Parallelizable Tasks:** 45 tasks marked with [P]  
**Sequential Tasks:** 26 tasks (require specific ordering)

**Estimated Total Effort:** 6-8 person-days (MVP scope)  
**Suggested MVP Scope:** Phases 1-3 (core member CRUD functionality)

---

## Next Steps

1. **Start with Phase 1 (Data Model)** - This is blocking for all other phases
2. **Implement Phase 2 and Phase 3 in parallel** - Backend and frontend can be developed simultaneously after Phase 1
3. **Add Phase 4 (Freeze Logic)** - Enhances status change functionality
4. **Complete Phase 5 (QA + Polish)** - Final quality pass before production

---

**End of Task Breakdown**
