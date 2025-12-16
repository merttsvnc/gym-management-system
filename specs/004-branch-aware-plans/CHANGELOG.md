# Documentation Update Changelog

**Date:** 2025-01-27  
**Purpose:** Address remaining issues and make plan implementation-safe

## Summary of Changes

### 1. TENANT-scope Uniqueness and Race Conditions

**Files Modified:**
- `spec.md` - Business Rules section (Plan Name Uniqueness)
- `plan.md` - Uniqueness Constraint Strategy section
- `data-model.md` - Validation Rules and Uniqueness Constraints sections

**Changes:**
- **Clarified database constraint limitation:** Documented that `@@unique([tenantId, branchId, name])` does NOT enforce TENANT-scope uniqueness because PostgreSQL allows multiple NULLs in UNIQUE indexes
- **Added race condition note:** Documented that application-level validation alone can allow duplicates under concurrent requests
- **Chose and documented approach:** Selected "Strong Guarantee" approach using `scopeKey` computed column:
  - `scopeKey = "TENANT"` for TENANT scope plans
  - `scopeKey = branchId` for BRANCH scope plans
  - Database constraint: `@@unique([tenantId, scope, scopeKey, name])`
  - Provides database-level enforcement for both scopes, preventing race conditions

**Updated Prisma Schema:**
- Added `scopeKey` field to MembershipPlan model
- Changed unique constraint from `@@unique([tenantId, branchId, name])` to `@@unique([tenantId, scope, scopeKey, name])`
- Updated migration strategy to include scopeKey column

---

### 2. Status Code Consistency

**Files Modified:**
- `spec.md` - All endpoint status code sections
- `plan.md` - Integration tests section
- `contracts/openapi.yaml` - All endpoint response definitions

**Standardized Status Codes:**
- **409 Conflict:** Duplicate plan name conflicts (create/update operations)
- **400 Bad Request:** Invalid input, invalid scope/branchId combination, invalid format, attempting to change immutable fields
- **403 Forbidden:** Cross-tenant access, unauthorized role, branchId belongs to different tenant
- **404 Not Found:** Plan not found
- **Removed:** All instances of "400 Conflict" (incorrect status code)

**Specific Updates:**
- POST /membership-plans: Changed duplicate name error from 400 to 409 Conflict
- PATCH /membership-plans/:id: Changed duplicate name error from 400 to 409 Conflict
- All endpoints: Clarified when to use 400 vs 409 vs 403

---

### 3. Archive Endpoint Idempotency

**Files Modified:**
- `spec.md` - POST /:id/archive endpoint section
- `contracts/openapi.yaml` - Archive endpoint definition

**Changes:**
- **Chose Option A (Idempotent):** POST /:id/archive is now idempotent
- **Behavior:** If plan is already archived, returns 200 OK with unchanged state (no error)
- **Removed:** 400 Bad Request response for "plan already archived"
- **Updated:** Status code 200 description to clarify idempotent behavior
- **Updated:** Business logic section to document idempotent behavior explicitly

---

### 4. Restore Endpoint Uniqueness Behavior

**Files Modified:**
- `spec.md` - POST /:id/restore endpoint section
- `data-model.md` - Plan Restoration state transition section
- `contracts/openapi.yaml` - Restore endpoint definition

**Changes:**
- **Confirmed behavior:** Restore conflicts return 400 Bad Request (not 409, as restore is a validation error)
- **Clarified scope context:** Error message specifies "same scope context" (same tenant for TENANT scope, same branch for BRANCH scope)
- **Added:** Explicit check for "plan already active" returning 400 Bad Request
- **Updated:** Error message: "Cannot restore plan: an ACTIVE plan with the same name already exists for this scope."

---

### 5. Prisma Schema Section Cleanup

**Files Modified:**
- `spec.md` - Data Model (Prisma Schema) section
- `plan.md` - Database Changes and Migration sections
- `data-model.md` - Database Schema (Prisma) section

**Changes:**
- **Removed:** All mentions of `@@unique([tenantId, name])` as a "safeguard"
- **Updated:** Prisma model to include `scopeKey` field
- **Updated:** Unique constraint to `@@unique([tenantId, scope, scopeKey, name])`
- **Updated:** Migration strategy to include scopeKey column creation and population
- **Updated:** Index strategy documentation
- **Clarified:** Database-level vs application-level validation responsibilities

---

## File-by-File Changes

### spec.md
- Updated Business Rules section: Added detailed uniqueness constraint explanation with scopeKey approach
- Updated all endpoint status codes: Standardized to 409 Conflict for duplicates, 400 for invalid input
- Updated archive endpoint: Made idempotent, removed 400 for "already archived"
- Updated restore endpoint: Clarified uniqueness validation and error messages
- Updated Prisma schema section: Added scopeKey field, updated unique constraint
- Updated migration strategy: Added scopeKey column migration steps
- Updated Success Criteria: Changed duplicate name errors from 400 to 409

### plan.md
- Updated Uniqueness Constraint Strategy: Replaced hybrid approach with scopeKey approach
- Updated Phase 0 tasks: Updated decision to use scopeKey approach
- Updated Phase 1 tasks: Added scopeKey field to schema and migration tasks
- Updated Database Changes: Added scopeKey field, updated unique constraint
- Updated Migration SQL: Added scopeKey column creation and population steps
- Updated Index Strategy: Updated unique constraint reference
- Updated Integration Tests: Changed duplicate name errors from 400 Conflict to 409 Conflict

### data-model.md
- Updated Fields table: Added scopeKey field definition
- Updated Validation Rules: Added scopeKey validation rules
- Updated Uniqueness Constraints: Changed to scopeKey-based constraint
- Updated Plan Restoration: Added explicit validation steps and error messages
- Updated Prisma Schema: Added scopeKey field, updated unique constraint
- Updated Migration Notes: Added scopeKey migration steps

### contracts/openapi.yaml
- Updated POST /membership-plans: Added 409 Conflict for duplicate names, clarified 400 vs 409
- Updated PATCH /membership-plans/:id: Added 409 Conflict for duplicate names, clarified 400 vs 409
- Updated POST /membership-plans/:id/archive: Removed 400 for "already archived", made idempotent
- Updated POST /membership-plans/:id/restore: Clarified error messages and scope context

---

## Implementation Impact

**Backend Implementation Notes:**
1. **scopeKey field:** Must be computed and set before database operations:
   - For TENANT scope: `scopeKey = "TENANT"`
   - For BRANCH scope: `scopeKey = branchId`
2. **Migration:** Must add scopeKey column and populate it before adding unique constraint
3. **Service layer:** Still requires case-insensitive and ACTIVE-only validation (database constraint is case-sensitive)
4. **Archive endpoint:** Must check if already archived and return 200 OK if so
5. **Restore endpoint:** Must check if already active and validate uniqueness before restoring

**Status Code Implementation:**
- Use `ConflictException` (409) for duplicate name conflicts in create/update
- Use `BadRequestException` (400) for validation errors, invalid input, immutable field changes
- Use `ForbiddenException` (403) for cross-tenant access, unauthorized roles
- Use `NotFoundException` (404) for plan not found

---

**End of Changelog**

