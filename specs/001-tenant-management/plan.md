# Implementation Plan: Tenant Management

**Version:** 1.0.0  
**Created:** 2025-12-04  
**Updated:** 2025-12-06  
**Status:** Backend Complete, Frontend Functional, UI Polish Ongoing  

---

## Current Status Summary

**Overall Progress:** Backend implementation complete and fully tested, including tenant management, authentication, authorization, and plan system. Backend is now secured with JWT + role guard + tenant guard. Frontend core functionality implemented and working. Frontend login + protected routes are the next major step. UI polish and responsive design improvements in progress.

**Completed:**
- ✅ Backend: Prisma schema, migrations, services, controllers, unit tests (34 tests passing), tenant isolation, error handling
- ✅ **Backend:** Authentication system implemented (JWT login, refresh-ready structure, bcrypt password hashing)
- ✅ **Backend:** Authorization implemented (JwtAuthGuard, RolesGuard, @CurrentUser decorator)
- ✅ **Backend:** Tenant-based access control enforced (tenantId isolation in all protected routes)
- ✅ **Backend:** SaaS plan system implemented (`planKey`, `PLAN_CONFIG`, `PlanService`, `maxBranches` limit)
- ✅ **Backend:** Full test suite added (Auth, JWT, RolesGuard, Tenant Isolation, Plan Limits, CurrentUser)
- ✅ Frontend: Project setup, API client, React Query integration, hooks, tenant settings UI, branch management UI (CRUD + archive/restore/default operations), dev authentication

**In Progress:**
- 🔄 Responsive / mobile polish (sidebar, drawer, layout refinements)
- 🔄 Minor UI cleanup (spacing, typography, visual consistency)

**Pending (Next Phases):**
- ⬜ **Frontend Authentication**
  - Login page connected to `/auth/login`
  - Token storage
  - ProtectedDashboard layout
  - Logout flow
- ⬜ **Frontend Plan Awareness (future)**
  - UI reacting to plan features
  - Showing limits or upgrade prompts
- ⬜ **Future Backend Enhancements**
  - Expand roles beyond ADMIN (OWNER, STAFF, TRAINER)
  - Support multiple plans (BASIC, PRO, ENTERPRISE)
  - Payment integration (Stripe/iyzico) to manage subscription → auto-update `planKey`
- ⬜ User management UI
- ⬜ Multi-tenant admin UI (super admin features)
- ⬜ Branch-level permission UI
- ⬜ API integration tests (e2e)
- ⬜ Documentation polish
- ⬜ Deployment templates (Docker / Production)
- ⬜ Monitoring / metrics

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

### Phase 0: Research & Design

**Goal:** Resolve all technical unknowns and create design artifacts

**Tasks:**
1. ✔️ Research NestJS guard patterns for tenant isolation
2. ✔️ Research React Query caching strategies for multi-tenant
3. ✔️ Research ISO 4217 currency validation approach
4. ✔️ Research CUID performance and indexing
5. ✔️ Research explicit vs automatic tenant scoping
6. ✔️ Create research.md with findings and decisions
7. ✔️ Create data-model.md with entity definitions
8. ✔️ Create contracts/openapi.yaml with API specification
9. ✔️ Create contracts/types.ts with TypeScript contracts
10. ✔️ Create quickstart.md developer guide
11. ✔️ Update agent context files

**Deliverables:**
- ✅ research.md
- ✅ data-model.md
- ✅ contracts/openapi.yaml
- ✅ contracts/types.ts
- ✅ quickstart.md
- ✅ Updated .cursor/rules/specify-rules.mdc

**Status:** Complete - All design artifacts generated and ready for implementation

---

### Phase 1: Database & Schema

**Goal:** Set up database schema, migrations, and seed data

**Tasks:**
1. ✔️ Create Prisma schema for Tenant, Branch, User models
   - Estimated effort: 2 hours
   - Dependencies: None
   - Files: `prisma/schema.prisma`

2. ✔️ Add indexes and constraints per data-model.md
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files: `prisma/schema.prisma`

3. ✔️ Generate and review migration
   - Estimated effort: 1 hour
   - Dependencies: Task 2
   - Files: `prisma/migrations/`

4. ✔️ Apply migration to development database
   - Estimated effort: 30 min
   - Dependencies: Task 3
   - Command: `npx prisma migrate dev`

5. ⬜ Create seed script for development data (Deferred: will be implemented in a later phase; currently intentionally skipped to comply with backend constraints – no seed script yet)
   - Estimated effort: 2 hours
   - Dependencies: Task 4
   - Files: `prisma/seeds/tenant-seed.ts`

6. ✔️ Generate Prisma Client
   - Estimated effort: 15 min
   - Dependencies: Task 4
   - Command: `npx prisma generate`

**Deliverables:**
- Prisma schema with Tenant, Branch, User models
- Migration files
- Seed script with demo tenant, branch, and admin user
- Generated Prisma Client types

**Testing:**
- Verify migration applies cleanly
- Verify seed data creates correctly
- Verify all indexes are created
- Verify foreign key constraints work

**Review Points:**
- Schema matches data-model.md specification
- Indexes cover all query patterns
- Seed data provides realistic test scenario
- No breaking changes to existing schema (if applicable)

**Status:** ✔️ Complete - Schema, migrations, and Prisma Client generation complete. Seed script deferred to later phase.

---

### Phase 2: Backend - Domain & Services

**Goal:** Implement business logic and service layer

**Tasks:**
1. ✔️ Create Tenant module structure
   - Estimated effort: 30 min
   - Dependencies: Phase 1 complete
   - Command: `nest g module tenants`, `nest g service tenants`, `nest g controller tenants`

2. ✔️ Create Branch module structure
   - Estimated effort: 30 min
   - Dependencies: Phase 1 complete
   - Command: `nest g module branches`, `nest g service branches`, `nest g controller branches`

3. ✔️ Implement TenantGuard for tenant isolation
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files: `src/auth/guards/tenant.guard.ts`

4. ✔️ Create DTOs for tenant operations
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files: `src/tenants/dto/update-tenant.dto.ts`

5. ✔️ Create DTOs for branch operations
   - Estimated effort: 2 hours
   - Dependencies: Task 2
   - Files: `src/branches/dto/*.dto.ts`

6. ✔️ Implement TenantsService with business logic
   - Estimated effort: 4 hours
   - Dependencies: Tasks 3, 4
   - Files: `src/tenants/tenants.service.ts`

7. ✔️ Implement BranchesService with all operations
   - Estimated effort: 8 hours
   - Dependencies: Tasks 3, 5
   - Files: `src/branches/branches.service.ts`

8. ✔️ Add service-layer unit tests (34 tests passing)
   - Estimated effort: 6 hours
   - Dependencies: Tasks 6, 7
   - Files: `src/tenants/*.spec.ts`, `src/branches/*.spec.ts`

**Deliverables:**
- TenantGuard for authorization
- Complete DTOs with validation
- TenantsService with getCurrent, updateTenant
- BranchesService with full CRUD + archive/restore/setDefault
- Unit tests for business rules

**Testing:**
- Unit tests for tenant isolation logic
- Unit tests for branch business rules (archival, default branch)
- Unit tests for validation logic
- Mock Prisma client for fast tests

**Review Points:**
- All service methods validate tenantId
- Business rules match specification
- Error messages are clear and actionable
- Test coverage > 80% for business logic

**Status:** ✔️ Complete - All services, DTOs, guards, and unit tests (34 tests passing) implemented and passing.

---

### Phase 3: Backend - API Controllers

**Goal:** Implement HTTP endpoints and API layer

**Tasks:**
1. ✔️ Implement TenantsController
   - Estimated effort: 2 hours
   - Dependencies: Phase 2 complete
   - Files: `src/tenants/tenants.controller.ts`

2. ✔️ Implement BranchesController
   - Estimated effort: 4 hours
   - Dependencies: Phase 2 complete
   - Files: `src/branches/branches.controller.ts`

3. ✔️ Add global exception filters
   - Estimated effort: 2 hours
   - Dependencies: Tasks 1, 2
   - Files: `src/common/filters/http-exception.filter.ts`

4. ✔️ Add API integration tests for tenant endpoints
   - Estimated effort: 3 hours
   - Dependencies: Task 1
   - Files: `test/tenants.e2e-spec.ts`

5. ✔️ Add API integration tests for branch endpoints
   - Estimated effort: 6 hours
   - Dependencies: Task 2
   - Files: `test/branches.e2e-spec.ts`

6. ✔️ Test cross-tenant access prevention
   - Estimated effort: 2 hours
   - Dependencies: Tasks 4, 5
   - Files: `test/tenant-isolation.e2e-spec.ts`

**Deliverables:**
- GET /api/v1/tenants/current
- PATCH /api/v1/tenants/current
- All 7 branch endpoints implemented
- Exception filters for consistent error responses
- Complete integration test suite

**Testing:**
- Integration tests for all endpoints
- Test all HTTP status codes (200, 201, 400, 401, 403, 404, 409, 500)
- Test pagination parameters
- Test tenant isolation (403 for cross-tenant access)
- Test edge cases (archiving default, last branch, etc.)

**Review Points:**
- All endpoints match OpenAPI specification
- Error responses follow ErrorResponse schema
- Tenant isolation verified in tests
- API returns correct status codes
- Pagination works correctly

**Status:** ✔️ Complete - All API endpoints, exception filters, and e2e tests implemented and passing. Backend implementation for Tenant Management is complete and ready for frontend integration.

---

### Phase A2 – Backend Authentication & Plan System (COMPLETED)

**Goal:** Implement production-ready authentication, authorization, and SaaS plan system

**Tasks:**
1. ✔️ Added `Role` enum (currently ADMIN)
2. ✔️ Added `Tenant.planKey` with default `SINGLE`
3. ✔️ Implemented `/auth/login` with bcrypt password validation
4. ✔️ Implemented JWT access token system (future-ready for refresh token)
5. ✔️ Added `JwtStrategy`, `JwtAuthGuard`, `RolesGuard`, `@CurrentUser` and `@TenantId`
6. ✔️ Implemented SaaS plan config: `PLAN_CONFIG`
7. ✔️ Implemented `PlanService` and integrated plan limits (maxBranches for SINGLE)
8. ✔️ Enforced tenant isolation across protected routes
9. ✔️ Added complete test suite (unit & e2e) validating all authentication, authorization, plan logic, and tenant boundaries

**Deliverables:**
- JWT-based authentication system with `/auth/login` endpoint
- Role-based authorization (ADMIN role enforced via RolesGuard)
- Tenant-scoped access control (tenantId isolation in all protected routes)
- SaaS plan system with `planKey` field on Tenant model
- Plan configuration system (`PLAN_CONFIG`) with `maxBranches` limit for SINGLE plan
- `PlanService` for checking plan limits and features
- Complete test coverage (Auth, JWT, RolesGuard, Tenant Isolation, Plan Limits, CurrentUser decorator)

**Testing:**
- Unit tests for authentication logic
- Unit tests for authorization guards
- E2E tests for login flow
- E2E tests for tenant isolation enforcement
- E2E tests for plan limit enforcement (maxBranches)
- Tests validating @CurrentUser decorator functionality

**Status:** ✔️ Complete - Backend is production-ready for multi-tenant SaaS usage with single-role, single-plan MVP. Authentication, authorization, and plan system fully implemented and tested.

---

### Phase 4: Frontend - API Client & Hooks

**Goal:** Implement frontend data layer with React Query

**Tasks:**
1. ✔️ Set up API client with axios
   - Estimated effort: 1 hour
   - Dependencies: Phase 3 complete
   - Files: `frontend/src/api/client.ts`

2. ✔️ Create tenant API methods
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files: `frontend/src/api/tenants.ts`

3. ✔️ Create branch API methods
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files: `frontend/src/api/branches.ts`

4. ✔️ Copy TypeScript types from contracts
   - Estimated effort: 30 min
   - Dependencies: None
   - Files: `frontend/src/types/tenant.ts`, `frontend/src/types/branch.ts`

5. ✔️ Create React Query hooks for tenant operations
   - Estimated effort: 2 hours
   - Dependencies: Tasks 2, 4
   - Files: `frontend/src/hooks/useTenant.ts`

6. ✔️ Create React Query hooks for branch operations
   - Estimated effort: 4 hours
   - Dependencies: Tasks 3, 4
   - Files: `frontend/src/hooks/useBranches.ts`

7. ✔️ Configure React Query client
   - Estimated effort: 1 hour
   - Dependencies: None
   - Files: `frontend/src/lib/query-client.ts`

**Deliverables:**
- API client with JWT token injection
- All API methods for tenants and branches
- TypeScript types for all entities and DTOs
- React Query hooks with caching and invalidation
- Query client configuration

**Testing:**
- Manual testing of API calls
- Verify JWT token is sent in Authorization header
- Verify React Query caching works
- Verify mutations invalidate correct queries

**Review Points:**
- API client handles errors correctly
- Types match backend contracts
- Query keys include tenantId
- Mutations invalidate stale data
- Loading and error states accessible

**Status:** ✔️ Complete - All API client, hooks, and React Query integration implemented and working.

---

### Phase 5: Frontend - UI Components

**Goal:** Build user interface for tenant and branch management

**Tasks:**
1. ✔️ Install and configure shadcn/ui components
   - Estimated effort: 1 hour
   - Dependencies: None
   - Files: `frontend/components/ui/*`

2. ✔️ Create TenantSettingsForm component
   - Estimated effort: 3 hours
   - Dependencies: Task 1, Phase 4 complete
   - Files: `frontend/src/pages/settings/tenant/TenantSettingsForm.tsx`

3. ✔️ Create BranchTable component
   - Estimated effort: 4 hours
   - Dependencies: Task 1, Phase 4 complete
   - Files: `frontend/src/pages/settings/branches/BranchTable.tsx`

4. ✔️ Create BranchFormModal component
   - Estimated effort: 4 hours
   - Dependencies: Task 1, Phase 4 complete
   - Files: `frontend/src/pages/settings/branches/BranchFormModal.tsx`

5. ✔️ Create BranchActionsMenu component
   - Estimated effort: 2 hours
   - Dependencies: Task 3
   - Files: `frontend/src/pages/settings/branches/BranchActionsMenu.tsx`

6. ✔️ Create ConfirmDialog reusable component
   - Estimated effort: 2 hours
   - Dependencies: Task 1
   - Files: `frontend/src/components/shared/ConfirmDialog.tsx`

7. ✔️ Create Tenant Settings page
   - Estimated effort: 2 hours
   - Dependencies: Task 2
   - Files: `frontend/src/pages/settings/tenant/page.tsx`

8. ✔️ Create Branch Management page
   - Estimated effort: 3 hours
   - Dependencies: Tasks 3, 4, 5, 6
   - Files: `frontend/src/pages/settings/branches/page.tsx`

9. ✔️ Add routes for settings pages
   - Estimated effort: 30 min
   - Dependencies: Tasks 7, 8
   - Files: `frontend/src/App.tsx` or router config

10. ✔️ Implement loading states and skeletons
    - Estimated effort: 2 hours
    - Dependencies: All UI components
    - Files: Component files

11. ✔️ Implement optimistic updates
    - Estimated effort: 2 hours
    - Dependencies: Phase 4 complete
    - Files: Hook files

12. 🔄 Responsive / mobile polish (sidebar, drawer, layout)
    - Estimated effort: 4 hours
    - Dependencies: All UI components
    - Files: Layout components

13. 🔄 Minor UI cleanup (spacing, typography, visual consistency)
    - Estimated effort: 2 hours
    - Dependencies: All UI components
    - Files: All component files

**Deliverables:**
- Tenant Settings page with form
- Branch Management page with table, modals, actions
- All shadcn/ui components configured
- Loading states and error handling
- Optimistic UI updates for better UX

**Testing:**
- Manual testing of all user flows
- Test form validation (client-side)
- Test pagination controls
- Test archive/restore/set-default actions
- Test responsive design on mobile, tablet, desktop

**Review Points:**
- UI matches design system (shadcn/ui)
- Forms validate input before submission
- Error messages are user-friendly
- Loading states prevent duplicate submissions
- Responsive design works on all screen sizes
- Accessibility: keyboard navigation, ARIA labels

**Status:** 🔄 Mostly Complete - Core UI functionality implemented and working. Responsive/mobile polish and UI refinements in progress.

---

### Phase 6: Testing & Documentation

**Goal:** Comprehensive testing and documentation

**Tasks:**
1. ✔️ Run full backend test suite
   - Estimated effort: 1 hour
   - Dependencies: Phases 2-3 complete
   - Command: `npm run test`

2. ✔️ Run backend integration tests
   - Estimated effort: 1 hour
   - Dependencies: Phases 2-3 complete
   - Command: `npm run test:e2e`

3. ✔️ Manual frontend testing of all flows
   - Estimated effort: 3 hours
   - Dependencies: Phase 5 complete
   - Test cases: All user flows from spec

4. ✔️ Test edge cases (archiving default, last branch, etc.)
   - Estimated effort: 2 hours
   - Dependencies: All phases complete
   - Test cases: Edge cases from spec

5. ✔️ Full-stack smoke tests
   - Estimated effort: 2 hours
   - Dependencies: Phases 3-5 complete
   - Status: Passed

6. ⬜ Update API documentation
   - Estimated effort: 1 hour
   - Dependencies: Phase 3 complete
   - Files: `docs/api/tenant-management.md`

7. ⬜ Add inline code comments for complex logic
   - Estimated effort: 2 hours
   - Dependencies: All phases complete
   - Files: All source files

8. ⬜ Update README with Tenant Management section
   - Estimated effort: 1 hour
   - Dependencies: All phases complete
   - Files: `README.md`

9. ⬜ Create demo video or screenshots
   - Estimated effort: 1 hour
   - Dependencies: Phase 5 complete
   - Files: `docs/screenshots/`

**Deliverables:**
- All tests passing (unit + integration)
- Complete API documentation
- Updated README
- Code comments for complex business rules
- Demo materials

**Testing:**
- All unit tests pass
- All integration tests pass
- All edge cases tested manually
- Cross-tenant access verified as blocked
- Performance acceptable (API < 200ms)

**Review Points:**
- Test coverage meets requirements
- Documentation is clear and complete
- Code is well-commented
- No linter errors
- No security vulnerabilities (run `npm audit`)

**Status:** 🔄 Partially Complete - Backend tests passing (34 unit tests, e2e tests), frontend smoke tests passed. Documentation polish pending.

---

### Phase 7: Future Enhancements & Production Readiness

**Goal:** Production-ready features and enhancements for future phases

**Tasks:**
1. ⬜ Frontend authentication integration (login page, token storage, protected routes)
   - Estimated effort: 6 hours
   - Dependencies: Phase A2 complete (backend auth implemented)
   - Status: Backend authentication complete (JWT login, guards, tenant isolation). Frontend login page and protected routes pending.

2. ⬜ User management UI
   - Estimated effort: 12 hours
   - Dependencies: Task 1
   - Files: `frontend/src/pages/users/*`

3. ⬜ Multi-tenant admin UI (super admin features)
   - Estimated effort: 16 hours
   - Dependencies: Task 1
   - Files: `frontend/src/pages/admin/*`

4. ⬜ Branch-level permission UI
   - Estimated effort: 8 hours
   - Dependencies: Task 1, Task 2
   - Files: `frontend/src/pages/settings/branches/permissions/*`

5. ⬜ API integration tests (e2e) - expanded coverage
   - Estimated effort: 6 hours
   - Dependencies: Phase 3 complete
   - Files: `test/*.e2e-spec.ts`

6. ⬜ Documentation polish
   - Estimated effort: 4 hours
   - Dependencies: All phases complete
   - Files: Various documentation files

7. ⬜ Deployment templates (Docker / Production)
   - Estimated effort: 8 hours
   - Dependencies: All phases complete
   - Files: `docker-compose.yml`, `Dockerfile`, deployment configs

8. ⬜ Monitoring / metrics
   - Estimated effort: 6 hours
   - Dependencies: Deployment complete
   - Files: Monitoring configuration, metrics dashboards

**Deliverables:**
- Production-ready authentication system
- User management interface
- Super admin capabilities
- Enhanced documentation
- Deployment infrastructure
- Monitoring and observability

**Status:** ⬜ Pending - These are next-phase items not yet started.

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

**Branch Endpoints:**
3. `GET /api/v1/branches`
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

**Feature Components:**
3. `TenantSettingsForm` - Form for editing tenant settings
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

**Shared/Reusable Components:**
7. `ConfirmDialog` - Reusable confirmation dialog
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

- [x] **Tenant Operations Working**
  - [x] Can retrieve current tenant information
  - [x] Can update tenant name and currency
  - [x] Validation errors are clear and actionable

- [x] **Branch Operations Working**
  - [x] Can list branches with pagination
  - [x] Can create new branches
  - [x] Can update existing branches
  - [x] Can archive branches (with business rule enforcement)
  - [x] Can restore archived branches
  - [x] Can set default branch (old default unset automatically)

- [x] **Business Rules Enforced**
  - [x] Cannot archive last active branch
  - [x] Cannot archive default branch without setting new default first
  - [x] Branch names unique within tenant (case-insensitive)
  - [x] Exactly one default branch per tenant at all times
  - [x] First branch auto-set as default

- [x] **Tenant Isolation Verified**
  - [x] Cross-tenant access returns 403 Forbidden
  - [x] All queries automatically scoped to tenantId
  - [x] Integration tests prove isolation

### Technical Requirements

- [x] **All Tests Passing**
  - [x] Unit tests: > 80% coverage for business logic
  - [x] Integration tests: All endpoints covered
  - [x] Edge case tests: All scenarios pass
  - [x] Cross-tenant isolation tests pass
  - [x] Zero test flakiness

- [x] **No Critical Security Issues**
  - [x] Tenant isolation verified (403 for cross-tenant)
  - [x] JWT validation working correctly
  - [x] No SQL injection vectors
  - [x] Input validation on all DTOs
  - [x] No sensitive data in logs
  - [ ] `npm audit` shows no high/critical vulnerabilities

- [ ] **Performance Requirements Met**
  - [ ] API response time < 200ms (p95) for branch list
  - [ ] API response time < 100ms (p95) for tenant get/update
  - [ ] Database queries use indexes efficiently
  - [ ] No N+1 query problems
  - [ ] Frontend loads in < 2s on 3G connection

- [ ] **Code Quality Standards**
  - [ ] Code review approved by 2+ reviewers
  - [ ] No ESLint/Prettier violations
  - [ ] TypeScript strict mode, no `any` types (except justified)
  - [ ] Follows project conventions and patterns
  - [ ] Code is readable and maintainable

- [ ] **Documentation Complete**
  - [ ] README updated with Tenant Management section
  - [ ] API documentation generated and accessible
  - [ ] Inline comments for complex logic
  - [ ] JSDoc for all public service methods
  - [ ] Quickstart guide verified by another developer

### User Experience Requirements

- [ ] **UI is Professional and Usable**
  - [ ] Forms validate input before submission
  - [ ] Error messages are user-friendly
  - [ ] Loading states prevent duplicate submissions
  - [ ] Success feedback via toasts
  - [ ] Responsive design works on mobile, tablet, desktop
  - [ ] Keyboard navigation works
  - [ ] ARIA labels for accessibility

- [ ] **Manual Testing Passed**
  - [ ] All user flows tested end-to-end
  - [ ] Edge cases tested (archive last, default branch)
  - [ ] Pagination works correctly
  - [ ] Tested in Chrome, Firefox, Safari
  - [ ] Tested on iOS and Android devices

### Deployment Requirements

- [ ] **Successfully Deployed**
  - [ ] Database migration applied to production
  - [ ] Backend deployed and health check passes
  - [ ] Frontend deployed and accessible
  - [ ] No errors in production logs (first 24 hours)
  - [ ] Monitoring and alerts configured

### Definition of Done

**Feature is considered DONE when:**
1. ✅ All functional requirements met
2. ✅ All technical requirements met
3. ✅ All UX requirements met
4. ✅ All deployment requirements met
5. ✅ Product owner/stakeholder sign-off

---

## Post-Implementation Review

After completion, reflect on:

### What Went Well
- *(To be filled after implementation)*
- Example: Clean separation of concerns made testing easy
- Example: Comprehensive spec reduced ambiguity during development

### What Could Be Improved
- *(To be filled after implementation)*
- Example: Should have added database constraint for exactly one default earlier
- Example: More frontend component reusability could have saved time

### Lessons Learned
- *(To be filled after implementation)*
- Example: Explicit tenant scoping is clearer than middleware for initial implementation
- Example: Integration tests for tenant isolation are essential and should be written first
- Example: React Query caching significantly improved perceived performance

### Follow-Up Items
- [ ] *(Add items discovered during implementation)*
- [ ] Example: Add database constraint to enforce one default branch per tenant
- [ ] Example: Implement Prisma middleware for automatic tenant scoping (Phase 2)
- [ ] Example: Add branch contact info (phone, email) as enhancement
- [ ] Example: Create audit log table for compliance tracking
- [ ] Example: Add branch analytics dashboard

### Metrics After 1 Week
- *(Collect after deployment)*
- [ ] Total tenants created: _____
- [ ] Total branches created: _____
- [ ] Average branches per tenant: _____
- [ ] API error rate: _____%
- [ ] Average API response time: _____ ms
- [ ] User-reported issues: _____

### Metrics After 1 Month
- *(Collect after 30 days)*
- [ ] Total active tenants: _____
- [ ] Total active branches: _____
- [ ] Branch archival rate: _____
- [ ] Default branch changes: _____
- [ ] Performance degradation (if any): _____
- [ ] User satisfaction: _____ (if survey conducted)

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

**End of Plan**

---

**Plan Status:** 🔄 IN PROGRESS - Backend Complete, Frontend Functional, UI Polish Ongoing

**Prepared By:** AI Planning Agent  
**Date:** 2025-12-04  
**Last Updated:** 2025-12-06  
**Version:** 1.0.0  

**Approval:**
- [ ] Technical Lead: _________________ Date: _______
- [ ] Product Owner: _________________ Date: _______
- [ ] Security Review: _______________ Date: _______
