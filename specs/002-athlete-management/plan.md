# Implementation Plan-Lite: Member Management (Üye Yönetimi)

**Version:** 1.0.0 (Plan-Lite)  
**Created:** 2025-01-20  
**Status:** MVP-Focused, Ready for Implementation

---

## Overview

MVP-focused implementation plan for Member Management module. This plan includes only essential tasks needed to ship a working member management system for a small SaaS project.

**Related Specification:** `specs/002-athlete-management/spec.md`

**Estimated Effort:** 6-8 person-days (MVP scope)

---

## Phase 1: Data Model (Prisma)

**Status:** 🔜 PENDING

**Tasks:**

1. Add `Member` model to `prisma/schema.prisma`:
   - Core fields: `firstName`, `lastName`, `phone`, `email`, `gender`, `dateOfBirth`
   - Membership: `membershipType`, `membershipStartAt`, `membershipEndAt`
   - Status: `status` (enum), `pausedAt`, `resumedAt`
   - Relations: `tenantId` → Tenant, `branchId` → Branch
   - Timestamps: `createdAt`, `updatedAt`

2. Add enums:
   - `MemberStatus`: ACTIVE, PAUSED, INACTIVE, ARCHIVED
   - `MemberGender`: MALE, FEMALE

3. Add **2 essential indexes**:
   - `@@index([tenantId, branchId])` - Branch-scoped queries
   - `@@index([tenantId, phone])` - Phone search/uniqueness checks

4. Add foreign keys:
   - `tenantId` → Tenant.id (CASCADE)
   - `branchId` → Branch.id (RESTRICT)

5. Create and apply migration

**Acceptance Criteria:**
- `npx prisma validate` passes
- Migration applies successfully
- Prisma Client regenerated

**Estimated Effort:** 2-3 hours

---

## Phase 2: Backend API

**Status:** 🔜 PENDING

**Endpoints:**

- `GET /api/v1/members` - List with filters (branch, status, search), pagination
- `GET /api/v1/members/:id` - Get member details
- `POST /api/v1/members` - Create member
- `PATCH /api/v1/members/:id` - Update member
- `POST /api/v1/members/:id/status` - Change status (ACTIVE, PAUSED, INACTIVE)
- `POST /api/v1/members/:id/archive` - Archive member

**Requirements:**

- **Phone uniqueness:** API-level validation (check duplicates within tenant)
- **Search:** Substring match (contains) on firstName, lastName, phone (case-insensitive)
- **remainingDays:** Computed in service layer (not stored)
- **Tenant/branch isolation:** All queries filter by tenantId, validate branchId belongs to tenant
- **Turkish error messages:** All API errors in Turkish

**Service Methods:**

- `create()` - Create with phone uniqueness check
- `findAll()` - List with filters, pagination, search
- `findOne()` - Get by ID with tenant isolation
- `update()` - Update with phone uniqueness check
- `changeStatus()` - Change status with transition validation
- `archive()` - Set status to ARCHIVED
- `calculateRemainingDays()` - Compute remaining days

**DTOs:**

- `CreateMemberDto` - Validation for create
- `UpdateMemberDto` - Validation for update
- `ChangeMemberStatusDto` - Status change validation
- `MemberListQueryDto` - Query params (page, limit, branchId, status, search)

**Acceptance Criteria:**
- All endpoints functional
- Phone uniqueness validation working
- Search working (substring, case-insensitive)
- Tenant/branch isolation verified
- All error messages in Turkish

**Estimated Effort:** 2-3 days

---

## Phase 3: Frontend UI

**Status:** 🔜 PENDING

**Pages:**

- `/members` - Member list page (table, filters, search)
- `/members/new` - Create member form
- `/members/:id` - Member detail page
- `/members/:id/edit` - Edit member form

**Core Components (4 essential):**

1. **MemberList** - Table with filters (branch, status), search, pagination
2. **MemberForm** - Create/edit form (all fields, validation)
3. **MemberDetail** - Detail view with actions
4. **StatusChangeDialog** - Simple dialog for status changes

**UI Requirements:**

- Use shadcn/ui components (Table, Input, Select, Button, Dialog, Badge)
- Turkish labels and validation messages
- Status badges with colors (ACTIVE=green, PAUSED=yellow, INACTIVE=gray, ARCHIVED=red)
- MembershipType selector: Basic/Standard/Premium/Custom dropdown
- Search bar (substring match)
- Filters: branch dropdown, status dropdown

**State Management:**

- React Query hooks: `useMembers()`, `useMember()`, `useCreateMember()`, `useUpdateMember()`, `useChangeMemberStatus()`, `useArchiveMember()`
- Cache invalidation on mutations

**Acceptance Criteria:**
- All pages functional
- Form validation working (Turkish errors)
- Search and filters working
- Status change flow working

**Estimated Effort:** 2-3 days

---

## Phase 4: Freeze Logic (PAUSED)

**Status:** 🔜 PENDING

**Tasks:**

1. Implement `pausedAt`/`resumedAt` timestamp logic:
   - Status → PAUSED: Set `pausedAt = NOW()`, clear `resumedAt`
   - Status PAUSED → ACTIVE: Set `resumedAt = NOW()`, clear `pausedAt`, extend `membershipEndAt` by pause duration

2. Update `remainingDays` calculation:
   - Account for paused periods
   - Days while PAUSED don't count against remaining time

3. Update `MembersService.changeStatus()`:
   - Handle timestamp updates
   - Extend membershipEndAt when resuming

**Critical Tests (3-4):**

- Active → Paused → Active transition (verify timestamps)
- Pause duration calculation (verify membershipEndAt extension)
- Remaining days calculation with paused periods
- Edge case: Pausing when membershipEndAt in past

**Acceptance Criteria:**
- Freeze logic tests pass
- Timestamps correctly set/cleared
- Membership end date extended correctly
- Remaining days calculation accurate

**Estimated Effort:** 1 day

---

## Phase 5: QA + Polish

**Status:** 🔜 PENDING

**Testing:**

- **Smoke tests:** All endpoints respond correctly
- **Isolation tests:** Tenant/branch isolation verified (cross-tenant access returns 403)
- **Status change tests:** All valid transitions work
- **Freeze logic tests:** Pause/resume scenarios verified

**Polish:**

- Code cleanup (remove console.logs)
- Turkish error messages verified
- Basic documentation update (quickstart.md)

**Acceptance Criteria:**
- All tests passing
- No critical issues
- Module ready for PR

**Estimated Effort:** 1 day

---

## Dependencies

**Backend:**
- NestJS, Prisma, PostgreSQL
- class-validator, class-transformer
- JWT auth (inherited from Tenant Management)

**Frontend:**
- React 18+, Vite, TypeScript
- TanStack Query, react-hook-form
- shadcn/ui, Tailwind CSS

**Assumes:**
- Tenant Management module complete
- JWT authentication working
- Branch CRUD available

---

## Success Criteria

**MVP Complete When:**
- Members can be created, updated, listed, and archived
- Status changes work (including PAUSED freeze logic)
- Search and filters functional
- Tenant/branch isolation enforced
- All Turkish translations in place
- Critical tests passing

---

**Plan Status:** ✅ READY FOR IMPLEMENTATION

**Next Step:** Begin Phase 1 - Data Model & Prisma Schema
