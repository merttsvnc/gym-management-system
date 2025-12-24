# Research: Branch-Aware Membership Plans

**Version:** 1.0.0  
**Date:** 2025-01-27  
**Status:** Complete

---

## Overview

This document consolidates research findings and design decisions for implementing branch-aware membership plans, with particular focus on resolving Prisma uniqueness constraint limitations.

---

## Research Question 1: Prisma Uniqueness Constraints for Conditional Scoping

### Question
How can we enforce different uniqueness constraints based on plan scope (TENANT vs BRANCH) when Prisma does not support conditional unique constraints?

### Research Findings

**Prisma Limitation:**
- Prisma does not support conditional unique constraints (e.g., "unique per tenant if scope=TENANT, unique per branch if scope=BRANCH")
- Prisma unique constraints are static and cannot depend on field values
- PostgreSQL supports partial unique indexes, but Prisma does not expose this feature directly

**Current State:**
- Existing schema has `@@unique([tenantId, name])` constraint
- This constraint prevents having the same plan name for TENANT and BRANCH scopes within the same tenant
- Business requirement allows duplicate names between TENANT and BRANCH scopes

**Database-Level Options:**

1. **Partial Unique Index (PostgreSQL):**
   ```sql
   CREATE UNIQUE INDEX "MembershipPlan_tenantId_name_tenant_scope" 
   ON "MembershipPlan"("tenantId", "name") 
   WHERE "scope" = 'TENANT' AND "branchId" IS NULL;
   
   CREATE UNIQUE INDEX "MembershipPlan_tenantId_branchId_name_branch_scope" 
   ON "MembershipPlan"("tenantId", "branchId", "name") 
   WHERE "scope" = 'BRANCH' AND "branchId" IS NOT NULL;
   ```
   - **Pros:** Database-level enforcement, prevents conflicts at lowest level
   - **Cons:** Prisma doesn't support partial indexes directly, requires raw SQL in migration, not visible in Prisma schema

2. **Composite Unique Constraint:**
   ```prisma
   @@unique([tenantId, branchId, name])
   ```
   - **Pros:** Prisma-native, visible in schema
   - **Cons:** Allows NULL branchId, so multiple TENANT plans can have same name (violates TENANT uniqueness requirement)

3. **Separate Unique Constraints:**
   - Not possible in Prisma (cannot have conditional constraints)

**Application-Level Options:**

1. **Full Application-Level Validation:**
   - Remove all unique constraints from Prisma schema
   - Enforce uniqueness entirely in service layer
   - **Pros:** Full control, handles case-insensitivity, ACTIVE-only checks
   - **Cons:** No database-level safeguard, potential for race conditions

2. **Hybrid Approach:**
   - Use database constraint for BRANCH scope: `@@unique([tenantId, branchId, name])`
   - Use application-level validation for TENANT scope
   - **Pros:** Database safeguard for BRANCH scope, application handles TENANT scope and business rules
   - **Cons:** Two different enforcement mechanisms

### Decision

**Chosen Approach: Hybrid (Database + Application Validation)**

**Rationale:**
- Database constraint `@@unique([tenantId, branchId, name])` provides data integrity safeguard for BRANCH scope
- Application-level validation handles:
  - TENANT scope uniqueness (not enforceable via database constraint due to NULL branchId)
  - Case-insensitive comparisons (database constraints are case-sensitive)
  - ACTIVE-only uniqueness (archived plans don't count)
- This approach balances data integrity with business rule flexibility

**Implementation:**
1. Remove `@@unique([tenantId, name])` constraint
2. Add `@@unique([tenantId, branchId, name])` constraint (allows NULL branchId for TENANT scope)
3. Implement application-level validation:
   - TENANT scope: Check `tenantId + name` (case-insensitive, ACTIVE only)
   - BRANCH scope: Check `tenantId + branchId + name` (case-insensitive, ACTIVE only)
   - Database constraint provides additional safeguard for BRANCH scope

**Alternatives Considered:**
- **Full application-level validation:** Rejected because database constraints provide important data integrity safeguards
- **PostgreSQL partial indexes:** Rejected because Prisma doesn't support them natively, would require raw SQL and not be visible in schema
- **Separate tables for TENANT and BRANCH plans:** Rejected because it would complicate queries and break existing code

---

## Research Question 2: Migration Strategy for Existing Plans

### Question
How should we migrate existing membership plans to support the new scope field?

### Research Findings

**Current State:**
- All existing plans are tenant-scoped (no branchId field)
- Existing plans have `tenantId` and `name` fields
- Existing unique constraint: `@@unique([tenantId, name])`

**Migration Requirements:**
- Add `scope` field with default "TENANT"
- Add `branchId` field (nullable)
- Ensure all existing plans have `scope = "TENANT"` and `branchId = null`
- Drop old unique constraint
- Add new unique constraint

### Decision

**Chosen Approach: Safe Migration with Defaults**

**Rationale:**
- Set `scope = "TENANT"` for all existing plans (matches current behavior)
- Set `branchId = null` for all existing plans (already the case)
- Migration is backward compatible (adds nullable columns with defaults)
- No data loss or transformation required

**Implementation:**
1. Add `scope` column with default "TENANT"
2. Add `branchId` column (nullable)
3. Update all existing plans: `SET scope = 'TENANT', branchId = NULL`
4. Drop old unique constraint
5. Add new unique constraint
6. Add indexes for performance

**Alternatives Considered:**
- **No migration script:** Rejected because we need to explicitly set scope for existing plans
- **Set scope based on branchId:** Rejected because existing plans don't have branchId (all are TENANT-scoped)

---

## Research Question 3: Case-Insensitive Uniqueness Validation

### Question
How should we handle case-insensitive plan name uniqueness when database constraints are case-sensitive?

### Research Findings

**Database Behavior:**
- PostgreSQL unique constraints are case-sensitive by default
- Case-insensitive uniqueness requires either:
  - Application-level validation
  - Database-level function/index (e.g., `LOWER(name)`)
  - Collation settings

**Current Implementation:**
- Service layer uses Prisma `mode: 'insensitive'` for case-insensitive queries
- This is the standard approach in NestJS/Prisma applications

### Decision

**Chosen Approach: Application-Level Case-Insensitive Validation**

**Rationale:**
- Prisma's `mode: 'insensitive'` is the standard approach
- Database constraints remain case-sensitive as a safeguard
- Application-level validation provides business rule enforcement (case-insensitive, ACTIVE-only)
- Consistent with existing codebase patterns

**Implementation:**
- Use Prisma `equals` with `mode: 'insensitive'` in uniqueness checks
- Database constraint provides additional safeguard (catches exact case matches)

**Alternatives Considered:**
- **Database-level LOWER() function:** Rejected because Prisma doesn't support this directly, would require raw SQL
- **Case-sensitive uniqueness:** Rejected because business requirement specifies case-insensitive uniqueness

---

## Research Question 4: Archived Plans and Uniqueness

### Question
Should archived plans count toward uniqueness constraints?

### Research Findings

**Business Requirement:**
- Archived plans should NOT prevent creation of plans with duplicate names
- Archived plans are historical records and should not block new plan creation
- Only ACTIVE plans should enforce uniqueness

**Database Constraint Behavior:**
- Database unique constraints apply to ALL rows, regardless of status
- Cannot conditionally exclude archived plans from uniqueness constraints at database level

### Decision

**Chosen Approach: Application-Level ACTIVE-Only Validation**

**Rationale:**
- Business rule requires ACTIVE-only uniqueness
- Database constraint provides safeguard but doesn't enforce ACTIVE-only rule
- Application-level validation filters by `status = ACTIVE` before checking uniqueness
- This matches existing implementation patterns

**Implementation:**
- Uniqueness validation queries include `status: PlanStatus.ACTIVE` filter
- Database constraint still exists but allows archived plans to have duplicate names
- Application validation enforces business rule (ACTIVE-only uniqueness)

**Alternatives Considered:**
- **Database-level partial unique index with status filter:** Rejected because Prisma doesn't support partial indexes
- **Remove archived plans from database:** Rejected because business requirement is to preserve historical records

---

## Summary of Key Decisions

1. **Uniqueness Constraint Strategy:** Hybrid approach (database constraint for BRANCH scope + application validation for both scopes)
2. **Migration Strategy:** Safe migration with defaults (set scope=TENANT for existing plans)
3. **Case-Insensitive Validation:** Application-level using Prisma `mode: 'insensitive'`
4. **Archived Plans:** Excluded from uniqueness checks via application-level validation (status filter)

---

## References

- Prisma Unique Constraints Documentation: https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#unique
- PostgreSQL Partial Indexes: https://www.postgresql.org/docs/current/indexes-partial.html
- Prisma Case-Insensitive Queries: https://www.prisma.io/docs/concepts/components/prisma-client/filtering-and-sorting#case-insensitive-filtering

---

**End of Research**


