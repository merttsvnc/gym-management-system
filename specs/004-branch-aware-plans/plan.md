# Implementation Plan: Branch-Aware Membership Plans

**Version:** 1.0.0  
**Created:** 2025-01-27  
**Updated:** 2025-01-27  
**Status:** Planning

---

## Overview

### Feature Summary
Enable membership plans to be defined either globally for a tenant (TENANT scope) or specifically for a single branch (BRANCH scope). This enhancement extends the existing membership plan system to support branch-level plan definitions, enabling future features such as accounting, payments, and branch-level reporting.

### Related Specification
- `/specs/004-branch-aware-plans/spec.md`

### Estimated Effort
- Backend: 3-4 person-days
- Testing: 1-2 person-days
- Total: 4-6 person-days

---

## Constitution Compliance Check

Before proceeding, verify alignment with core constitutional principles:

- [x] **Long-Term Maintainability:** Application-level uniqueness validation is explicit and maintainable, even if more verbose than database constraints
- [x] **Security & Correctness:** Tenant isolation maintained, scope validation enforced, branch validation prevents cross-tenant access
- [x] **Explicit Domain Rules:** Scope-based uniqueness rules are explicit in service layer with clear validation logic
- [x] **Layered Architecture:** Business logic in service layer, controllers handle HTTP only
- [x] **Multi-Tenant Isolation:** All queries filter by tenantId, branch validation ensures branch belongs to tenant
- [x] **Data Integrity:** Migration strategy preserves existing data, adds new fields with defaults
- [ ] **Professional UI/UX:** Frontend implementation deferred to future feature
- [x] **Performance & Scalability:** Proper indexes planned for scope-based queries
- [x] **Testing Coverage:** Unit tests for validation logic, integration tests for API endpoints

---

## Technical Context

### Current State
- MembershipPlan model has `@@unique([tenantId, name])` constraint
- Service layer enforces case-insensitive uniqueness within tenant
- All plans are currently tenant-scoped (no branchId field exists)

### Required Changes
- Add `scope` field (enum: TENANT | BRANCH) to MembershipPlan
- Add `branchId` field (nullable String) to MembershipPlan
- Add `branch` relation to Branch model
- **CRITICAL:** Handle uniqueness constraints differently for TENANT vs BRANCH scopes

### Uniqueness Constraint Strategy

**Problem:** Prisma does not support conditional unique constraints. We need:
- TENANT scope: unique per tenant (`tenantId + name`)
- BRANCH scope: unique per branch (`tenantId + branchId + name`)

**Solution:** Hybrid approach combining database-level and application-level validation:

1. **Remove existing `@@unique([tenantId, name])` constraint** from Prisma schema
   - Reason: This constraint prevents having the same plan name for TENANT and BRANCH scopes within the same tenant, which is allowed by business rules
   - Migration: Drop the unique constraint in migration

2. **Add composite unique constraint for BRANCH scope only:** `@@unique([tenantId, branchId, name])`
   - This enforces uniqueness for BRANCH-scoped plans per branch
   - TENANT-scoped plans (where branchId is null) are NOT covered by this constraint

3. **Application-level validation for TENANT scope:**
   - Service layer checks uniqueness for TENANT-scoped plans (tenantId + name, case-insensitive, ACTIVE only)
   - This validation runs before database insert/update operations

4. **Application-level validation for BRANCH scope:**
   - Service layer validates uniqueness for BRANCH-scoped plans (tenantId + branchId + name, case-insensitive, ACTIVE only)
   - Database constraint `@@unique([tenantId, branchId, name])` provides additional safeguard
   - Note: Database constraint is case-sensitive, so application-level validation handles case-insensitivity

**Why This Approach:**
- Database constraints provide data integrity at the lowest level
- Application-level validation provides business rule enforcement (case-insensitive, ACTIVE-only)
- Allows TENANT and BRANCH scopes to coexist with same name (business requirement)
- Prevents conflicts between scopes while maintaining data integrity

**Validation Logic:**
```typescript
// For TENANT scope: Check tenantId + name (case-insensitive, ACTIVE only)
// For BRANCH scope: Check tenantId + branchId + name (case-insensitive, ACTIVE only)
// Archived plans do not count toward uniqueness
```

### Dependencies
- Existing MembershipPlan model and service
- Existing Branch model
- Tenant isolation infrastructure

### Integration Points
- MembershipPlan service layer (validation logic)
- MembershipPlan controller (scope filtering)
- Member service (plan selection logic - future)

---

## Implementation Phases

### Phase 0: Research & Design

**Goal:** Resolve all technical unknowns and finalize design decisions

**Tasks:**
1. [x] Research Prisma uniqueness constraint limitations
   - **Finding:** Prisma does not support conditional unique constraints based on field values
   - **Decision:** Use hybrid approach (database + application validation)

2. [x] Clarify uniqueness constraint strategy
   - **Decision:** Remove `@@unique([tenantId, name])`, add `@@unique([tenantId, branchId, name])` for BRANCH scope, application-level validation for both scopes

3. [x] Review migration strategy for existing plans
   - **Decision:** Set all existing plans to scope=TENANT, branchId=null

**Deliverables:**
- research.md (this section)
- Clarified uniqueness constraint strategy

**Review Points:**
- Uniqueness constraint approach approved
- Migration strategy validated

---

### Phase 1: Database Schema & Migration

**Goal:** Update Prisma schema and create migration

**Tasks:**
1. [ ] Update Prisma schema
   - Estimated effort: 30 minutes
   - Dependencies: None
   - Files affected: `backend/prisma/schema.prisma`
   - Add `scope` field (enum PlanScope: TENANT | BRANCH)
   - Add `branchId` field (nullable String)
   - Add `branch` relation to Branch model
   - **Remove** `@@unique([tenantId, name])` constraint
   - **Add** `@@unique([tenantId, branchId, name])` constraint (for BRANCH scope)
   - Add indexes: `[tenantId, scope]`, `[tenantId, scope, status]`, `[tenantId, branchId]`, `[branchId]`

2. [ ] Create migration
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/prisma/migrations/`
   - Add `scope` column with default "TENANT"
   - Add `branchId` column (nullable)
   - Add foreign key constraint for `branchId → Branch.id`
   - Drop existing `@@unique([tenantId, name])` constraint
   - Add new `@@unique([tenantId, branchId, name])` constraint
   - Update all existing plans: set `scope = "TENANT"`, ensure `branchId = null`
   - Add indexes

3. [ ] Test migration on development database
   - Estimated effort: 30 minutes
   - Dependencies: Task 2
   - Verify existing plans are migrated correctly
   - Verify constraints are applied correctly
   - Test rollback if needed

**Deliverables:**
- Updated Prisma schema
- Migration file
- Migration tested successfully

**Testing:**
- Migration runs successfully on clean database
- Migration runs successfully on database with existing plans
- Rollback works correctly

**Review Points:**
- Schema changes reviewed
- Migration strategy validated
- Indexes optimized for query patterns

---

### Phase 2: Service Layer Updates

**Goal:** Implement scope validation and uniqueness logic

**Tasks:**
1. [ ] Update CreatePlanInput interface
   - Estimated effort: 15 minutes
   - Dependencies: Phase 1
   - Files affected: `backend/src/membership-plans/membership-plans.service.ts`
   - Add `scope: PlanScope` field
   - Add `branchId?: string` field

2. [ ] Implement scope validation logic
   - Estimated effort: 1 hour
   - Dependencies: Task 1
   - Files affected: `backend/src/membership-plans/membership-plans.service.ts`
   - Validate: TENANT scope requires branchId = null
   - Validate: BRANCH scope requires branchId (not null)
   - Validate: branchId belongs to current tenant
   - Validate: branch is active (if BRANCH scope)

3. [ ] Update uniqueness validation logic
   - Estimated effort: 2 hours
   - Dependencies: Task 2
   - Files affected: `backend/src/membership-plans/membership-plans.service.ts`
   - Refactor `checkNameUniqueness` to handle scope-based uniqueness:
     - TENANT scope: Check `tenantId + name` (case-insensitive, ACTIVE only)
     - BRANCH scope: Check `tenantId + branchId + name` (case-insensitive, ACTIVE only)
   - Exclude archived plans from uniqueness checks
   - Update createPlanForTenant to use new validation
   - Update updatePlanForTenant to use new validation

4. [ ] Enforce scope immutability
   - Estimated effort: 30 minutes
   - Dependencies: Task 3
   - Files affected: `backend/src/membership-plans/membership-plans.service.ts`
   - Prevent scope changes in updatePlanForTenant
   - Prevent branchId changes in updatePlanForTenant (for BRANCH scope)

5. [ ] Update plan listing methods
   - Estimated effort: 1 hour
   - Dependencies: Task 3
   - Files affected: `backend/src/membership-plans/membership-plans.service.ts`
   - Add scope filter to listPlansForTenant
   - Add branchId filter to listPlansForTenant
   - Update listActivePlansForTenant to handle branchId filter (returns TENANT + BRANCH plans for branch)

**Deliverables:**
- Updated service layer with scope validation
- Updated uniqueness validation logic
- Updated plan listing with scope/branchId filters

**Testing:**
- Unit tests for scope validation
- Unit tests for uniqueness validation (TENANT and BRANCH scopes)
- Unit tests for scope immutability
- Unit tests for plan listing filters

**Review Points:**
- Validation logic covers all edge cases
- Uniqueness checks are correct for both scopes
- Performance of uniqueness checks is acceptable

---

### Phase 3: DTOs & Controller Updates

**Goal:** Update API layer to support scope and branchId

**Tasks:**
1. [ ] Update CreatePlanDto
   - Estimated effort: 30 minutes
   - Dependencies: Phase 2
   - Files affected: `backend/src/membership-plans/dto/create-plan.dto.ts`
   - Add `scope: PlanScope` field with validation
   - Add `branchId?: string` field with conditional validation
   - Update validation decorators

2. [ ] Update UpdatePlanDto
   - Estimated effort: 30 minutes
   - Dependencies: Task 1
   - Files affected: `backend/src/membership-plans/dto/update-plan.dto.ts`
   - Explicitly exclude `scope` and `branchId` fields (immutable)
   - Add validation decorators

3. [ ] Update PlanListQueryDto
   - Estimated effort: 30 minutes
   - Dependencies: Task 1
   - Files affected: `backend/src/membership-plans/dto/plan-list-query.dto.ts`
   - Add `scope?: PlanScope` filter
   - Add `branchId?: string` filter
   - Add `includeArchived?: boolean` filter

4. [ ] Update controller methods
   - Estimated effort: 1 hour
   - Dependencies: Tasks 1-3
   - Files affected: `backend/src/membership-plans/membership-plans.controller.ts`
   - Update POST /membership-plans to handle scope and branchId
   - Update GET /membership-plans to handle scope and branchId filters
   - Update GET /membership-plans/active to handle branchId filter
   - Update error responses for scope validation failures

**Deliverables:**
- Updated DTOs with scope and branchId fields
- Updated controller with scope filtering

**Testing:**
- Integration tests for create plan with TENANT scope
- Integration tests for create plan with BRANCH scope
- Integration tests for plan listing with scope filter
- Integration tests for plan listing with branchId filter
- Integration tests for scope immutability (reject scope change)

**Review Points:**
- DTO validation covers all cases
- Error messages are clear and helpful
- API contracts match specification

---

### Phase 4: Testing

**Goal:** Comprehensive test coverage

**Tasks:**
1. [ ] Unit tests for scope validation
   - Estimated effort: 2 hours
   - Dependencies: Phase 2
   - Files affected: `backend/src/membership-plans/membership-plans.service.spec.ts`
   - Test TENANT scope with null branchId (success)
   - Test TENANT scope with branchId (failure)
   - Test BRANCH scope without branchId (failure)
   - Test BRANCH scope with branchId from different tenant (failure)
   - Test BRANCH scope with archived branch (failure)

2. [ ] Unit tests for uniqueness validation
   - Estimated effort: 3 hours
   - Dependencies: Phase 2
   - Files affected: `backend/src/membership-plans/membership-plans.service.spec.ts`
   - Test TENANT scope uniqueness (duplicate name fails)
   - Test BRANCH scope uniqueness (duplicate name within branch fails)
   - Test duplicate names across different branches (success)
   - Test duplicate names between TENANT and BRANCH scopes (success)
   - Test archived plans don't count toward uniqueness

3. [ ] Integration tests for API endpoints
   - Estimated effort: 4 hours
   - Dependencies: Phase 3
   - Files affected: `backend/test/membership-plans.e2e-spec.ts`
   - Test POST /membership-plans with TENANT scope
   - Test POST /membership-plans with BRANCH scope
   - Test GET /membership-plans with scope filter
   - Test GET /membership-plans with branchId filter
   - Test GET /membership-plans/active with branchId
   - Test scope immutability (PATCH rejects scope change)
   - Test tenant isolation (cross-tenant access fails)

**Deliverables:**
- Unit test suite with >90% coverage for validation logic
- Integration test suite covering all API endpoints

**Testing:**
- All tests passing
- Edge cases covered

**Review Points:**
- Test coverage meets requirements
- Tests are maintainable and clear

---

## Dependencies

### External Dependencies
- None

### Internal Dependencies
- Existing MembershipPlan service and controller
- Existing Branch model and service
- Tenant isolation infrastructure (JWT auth, tenant guards)

### Blocking Issues
- None identified

---

## Database Changes

### New Tables/Models
- None (modifying existing MembershipPlan model)

### Schema Modifications

**MembershipPlan Model:**
- Add `scope` field: `PlanScope` enum (TENANT | BRANCH), NOT NULL, default "TENANT"
- Add `branchId` field: `String?` (nullable), foreign key to Branch.id
- Add `branch` relation: `Branch?` (optional)
- **Remove** `@@unique([tenantId, name])` constraint
- **Add** `@@unique([tenantId, branchId, name])` constraint (for BRANCH scope uniqueness)

**New Enum:**
- `PlanScope` enum: TENANT, BRANCH

### Migrations

**Migration: Add scope and branchId to MembershipPlan**

1. **Add scope column:**
   ```sql
   ALTER TABLE "MembershipPlan" 
   ADD COLUMN "scope" "PlanScope" NOT NULL DEFAULT 'TENANT';
   ```

2. **Add branchId column:**
   ```sql
   ALTER TABLE "MembershipPlan" 
   ADD COLUMN "branchId" TEXT;
   ```

3. **Add foreign key constraint:**
   ```sql
   ALTER TABLE "MembershipPlan" 
   ADD CONSTRAINT "MembershipPlan_branchId_fkey" 
   FOREIGN KEY ("branchId") REFERENCES "Branch"("id") 
   ON DELETE RESTRICT ON UPDATE CASCADE;
   ```

4. **Drop existing unique constraint:**
   ```sql
   ALTER TABLE "MembershipPlan" 
   DROP CONSTRAINT IF EXISTS "MembershipPlan_tenantId_name_key";
   ```

5. **Add new composite unique constraint:**
   ```sql
   CREATE UNIQUE INDEX "MembershipPlan_tenantId_branchId_name_key" 
   ON "MembershipPlan"("tenantId", "branchId", "name");
   ```
   Note: This constraint allows NULL branchId (for TENANT scope), so multiple TENANT plans can have the same name. Application-level validation enforces TENANT scope uniqueness.

6. **Update existing plans:**
   ```sql
   UPDATE "MembershipPlan" 
   SET "scope" = 'TENANT', "branchId" = NULL 
   WHERE "branchId" IS NULL;
   ```

7. **Add indexes:**
   ```sql
   CREATE INDEX "MembershipPlan_tenantId_scope_idx" ON "MembershipPlan"("tenantId", "scope");
   CREATE INDEX "MembershipPlan_tenantId_scope_status_idx" ON "MembershipPlan"("tenantId", "scope", "status");
   CREATE INDEX "MembershipPlan_tenantId_branchId_idx" ON "MembershipPlan"("tenantId", "branchId");
   CREATE INDEX "MembershipPlan_branchId_idx" ON "MembershipPlan"("branchId");
   ```

- **Backward compatible:** Yes (adds nullable columns, sets defaults)
- **Data migration required:** Yes (set scope=TENANT for existing plans)
- **Risks:** 
  - Dropping unique constraint could allow duplicates temporarily, but application-level validation prevents this
  - Foreign key constraint prevents deleting branches with plans (onDelete: Restrict)

### Index Strategy

Required indexes and rationale:

- `MembershipPlan(tenantId)`: Tenant-scoped queries (existing)
- `MembershipPlan(tenantId, scope)`: Filter plans by scope
- `MembershipPlan(tenantId, scope, status)`: Filter active plans by scope
- `MembershipPlan(tenantId, branchId)`: Filter BRANCH-scoped plans by branch
- `MembershipPlan(branchId)`: Branch-scoped plan queries
- `MembershipPlan(tenantId, branchId, name)`: Unique constraint for BRANCH scope (composite unique index)
- `MembershipPlan(tenantId, status)`: Filter active plans (existing)
- `MembershipPlan(tenantId, sortOrder)`: Ordered plan lists (existing)

---

## API Changes

### New Endpoints
- None (modifying existing endpoints)

### Modified Endpoints

**GET /api/v1/membership-plans:**
- Add `scope?: PlanScope` query parameter
- Add `branchId?: string` query parameter
- Add `includeArchived?: boolean` query parameter

**GET /api/v1/membership-plans/active:**
- Add `branchId?: string` query parameter
- Returns TENANT plans + BRANCH plans for specified branch

**POST /api/v1/membership-plans:**
- Add `scope: PlanScope` to request body
- Add `branchId?: string` to request body (required if scope=BRANCH)

**PATCH /api/v1/membership-plans/:id:**
- Reject `scope` field (immutable)
- Reject `branchId` field (immutable)

### Contract Updates

**CreatePlanRequest:**
- Add `scope: PlanScope` (required)
- Add `branchId?: string` (required if scope=BRANCH)

**UpdatePlanRequest:**
- Explicitly exclude `scope` and `branchId` (immutable)

**MembershipPlan Response:**
- Add `scope: PlanScope` field
- Add `branchId: string | null` field

**PlanListQuery:**
- Add `scope?: PlanScope` filter
- Add `branchId?: string` filter
- Add `includeArchived?: boolean` filter

---

## Frontend Changes

**Note:** Frontend implementation is explicitly out of scope for this feature (deferred to future feature).

### New Components
- None (deferred)

### Modified Components
- None (deferred)

### New Routes
- None (deferred)

### State Management
- None (deferred)

---

## Testing Strategy

### Unit Tests

**MembershipPlansService:**
- `createPlanForTenant` with TENANT scope (success)
- `createPlanForTenant` with TENANT scope and branchId (failure)
- `createPlanForTenant` with BRANCH scope without branchId (failure)
- `createPlanForTenant` with BRANCH scope with branchId from different tenant (failure)
- `createPlanForTenant` with BRANCH scope with archived branch (failure)
- `createPlanForTenant` with duplicate TENANT plan name (failure)
- `createPlanForTenant` with duplicate BRANCH plan name within branch (failure)
- `createPlanForTenant` with duplicate names across different branches (success)
- `createPlanForTenant` with duplicate names between TENANT and BRANCH scopes (success)
- `updatePlanForTenant` attempting to change scope (failure)
- `updatePlanForTenant` attempting to change branchId (failure)
- `listPlansForTenant` with scope filter
- `listPlansForTenant` with branchId filter
- `listActivePlansForTenant` with branchId filter

### Integration Tests

**POST /api/v1/membership-plans:**
- Create TENANT-scoped plan (success)
- Create BRANCH-scoped plan (success)
- Create TENANT plan with branchId (400 Bad Request)
- Create BRANCH plan without branchId (400 Bad Request)
- Create BRANCH plan with branchId from different tenant (403 Forbidden)
- Create duplicate TENANT plan name (400 Conflict)
- Create duplicate BRANCH plan name within branch (400 Conflict)
- Create duplicate names across branches (200 Success)
- Create duplicate names between TENANT and BRANCH scopes (200 Success)

**GET /api/v1/membership-plans:**
- List plans with scope=TENANT filter
- List plans with scope=BRANCH filter
- List plans with branchId filter
- List plans with includeArchived=true
- Tenant isolation (cross-tenant access returns 403)

**GET /api/v1/membership-plans/active:**
- Returns TENANT plans when branchId not provided
- Returns TENANT + BRANCH plans when branchId provided
- Validates branchId belongs to tenant

**PATCH /api/v1/membership-plans/:id:**
- Reject scope change (400 Bad Request)
- Reject branchId change (400 Bad Request)
- Update other fields successfully

### Manual Testing Checklist
- [ ] Create TENANT-scoped plan via API
- [ ] Create BRANCH-scoped plan via API
- [ ] List plans filtered by scope
- [ ] List plans filtered by branchId
- [ ] Verify duplicate names allowed across scopes
- [ ] Verify duplicate names allowed across branches
- [ ] Verify tenant isolation maintained

---

## Rollout Strategy

### Feature Flags
- Not required (backward compatible changes)

### Deployment Plan
1. **Backend deployment:**
   - Deploy updated backend code
   - Run migration (adds columns, preserves existing data)
   - Verify migration success
   - Monitor for errors

2. **Rollback plan:**
   - If issues occur, rollback backend code
   - Migration can be reversed (drop new columns, restore unique constraint)
   - Existing functionality remains intact

### Monitoring
- Monitor for uniqueness constraint violations (should not occur with application validation)
- Monitor for foreign key constraint violations (branch deletion attempts)
- Monitor API error rates for scope validation failures
- Monitor query performance for scope-based filters

---

## Documentation Updates

### Code Documentation
- [ ] Inline comments for scope validation logic
- [ ] Inline comments for uniqueness validation logic
- [ ] JSDoc for updated service methods
- [ ] Document uniqueness constraint strategy in service file

### External Documentation
- [ ] Update API documentation (OpenAPI spec)
- [ ] Update README with branch-aware plan management

### Specification Updates
- [ ] Verify spec.md matches implementation
- [ ] Document any deviations from spec

---

## Risk Assessment

### Technical Risks

**Risk 1: Uniqueness constraint conflicts**
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:** 
  - Application-level validation prevents conflicts
  - Database constraint provides additional safeguard for BRANCH scope
  - Comprehensive test coverage

**Risk 2: Migration issues with existing data**
- **Likelihood:** Low
- **Impact:** High
- **Mitigation:**
  - Migration sets safe defaults (scope=TENANT, branchId=null)
  - Test migration on development database first
  - Backup database before migration

**Risk 3: Performance impact of application-level uniqueness checks**
- **Likelihood:** Low
- **Impact:** Low
- **Mitigation:**
  - Proper indexes on tenantId, branchId, name
  - Case-insensitive queries use indexed columns
  - Typical tenant has <100 plans, queries are fast

### Security Risks

**Risk 1: Cross-tenant branch access**
- **Mitigation:** Validate branchId belongs to authenticated user's tenant before allowing BRANCH plan creation

**Risk 2: Tenant isolation violation**
- **Mitigation:** All queries filter by tenantId, branch validation ensures branch belongs to tenant

### Performance Risks

**Risk 1: Slow queries with scope filters**
- **Mitigation:** Proper indexes on (tenantId, scope) and (tenantId, branchId)

---

## Success Criteria

How will we know this feature is successfully implemented?

- [x] All acceptance criteria from spec met
- [ ] All tests passing (unit + integration)
- [ ] No critical security issues
- [ ] Performance requirements met (<300ms for plan list queries)
- [ ] Code review approved
- [ ] Documentation complete
- [ ] Migration tested and successful
- [ ] Uniqueness constraints working correctly for both scopes

---

## Post-Implementation Review

After completion, reflect on:

### What Went Well
- 

### What Could Be Improved
- 

### Lessons Learned
- 

### Follow-Up Items
- [ ] Frontend implementation (deferred)
- [ ] Plan migration between scopes (deferred)
- [ ] Plan assignment rules based on member branch (deferred)

---

**End of Plan**
