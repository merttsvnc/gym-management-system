# Quickstart Guide: Branch-Aware Membership Plans

**Version:** 1.0.0  
**Date:** 2025-01-27  
**Feature:** 004-branch-aware-plans

---

## Overview

This guide provides step-by-step instructions for implementing Branch-Aware Membership Plans. This feature extends existing membership plans to support both tenant-scoped (TENANT) and branch-scoped (BRANCH) plans.

**Estimated Total Time:** 4-6 person-days

---

## Prerequisites

- Backend: NestJS + Prisma + PostgreSQL setup complete
- Existing MembershipPlan model and service (from feature 003)
- Existing Branch model and service (from feature 001)
- Authentication: JWT auth with tenant claims working
- Tenant isolation infrastructure in place

---

## Phase 0: Research & Understanding (30 minutes)

### Step 1: Review Research Findings

Read `research.md` to understand:
- **Prisma uniqueness constraint limitations:** Prisma doesn't support conditional unique constraints
- **Hybrid validation approach:** Database constraint for BRANCH scope + application-level validation for both scopes
- **Migration strategy:** Safe migration with defaults (scope=TENANT for existing plans)

**Key Decision:** Remove `@@unique([tenantId, name])`, add `@@unique([tenantId, branchId, name])`, implement application-level validation for TENANT scope uniqueness.

**Time:** 30 minutes

---

## Phase 1: Database Schema & Migration (Day 1)

### Step 1: Update Prisma Schema

Edit `backend/prisma/schema.prisma`:

1. Add `PlanScope` enum:
```prisma
enum PlanScope {
  TENANT
  BRANCH
}
```

2. Update `MembershipPlan` model:
   - Add `scope` field: `PlanScope @default(TENANT)`
   - Add `branchId` field: `String?` (nullable)
   - Add `branch` relation: `Branch?` (optional)
   - **Remove** `@@unique([tenantId, name])` constraint
   - **Add** `@@unique([tenantId, branchId, name])` constraint
   - Add indexes: `[tenantId, scope]`, `[tenantId, scope, status]`, `[tenantId, branchId]`, `[branchId]`

**Example:**
```prisma
model MembershipPlan {
  id            String       @id @default(cuid())
  tenantId      String
  scope         PlanScope    @default(TENANT) // NEW
  branchId      String?      // NEW
  name          String
  description   String?
  durationType  DurationType
  durationValue Int
  price         Decimal      @db.Decimal(10, 2)
  currency      String
  maxFreezeDays Int?
  autoRenew     Boolean      @default(false)
  status        PlanStatus
  sortOrder     Int?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  tenant  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch  Branch?  @relation(fields: [branchId], references: [id], onDelete: Restrict) // NEW
  members Member[]

  // REMOVED: @@unique([tenantId, name])
  @@unique([tenantId, branchId, name]) // NEW: For BRANCH scope uniqueness
  @@index([tenantId])
  @@index([tenantId, scope]) // NEW
  @@index([tenantId, status])
  @@index([tenantId, branchId]) // NEW
  @@index([tenantId, scope, status]) // NEW
  @@index([branchId]) // NEW
  @@index([tenantId, sortOrder])
}
```

**Time:** 30 minutes

### Step 2: Create Migration

Run Prisma migration:

```bash
cd backend
npx prisma migrate dev --name add_scope_and_branch_id_to_membership_plan
```

**Important:** Review the generated migration file. It should:
1. Add `scope` column with default "TENANT"
2. Add `branchId` column (nullable)
3. Add foreign key constraint for `branchId → Branch.id`
4. Drop existing `@@unique([tenantId, name])` constraint
5. Add new `@@unique([tenantId, branchId, name])` constraint
6. Add indexes
7. Update existing plans: `SET scope = 'TENANT', branchId = NULL`

**Time:** 1 hour (including review and testing)

### Step 3: Test Migration

1. Test on development database:
```bash
# Reset database
npx prisma migrate reset

# Verify migration runs successfully
npx prisma migrate dev
```

2. Verify existing plans:
```sql
-- All existing plans should have scope = 'TENANT' and branchId = NULL
SELECT id, scope, branchId FROM "MembershipPlan";
```

**Time:** 30 minutes

---

## Phase 2: Service Layer Updates (Day 2)

### Step 1: Update CreatePlanInput Interface

Edit `backend/src/membership-plans/membership-plans.service.ts`:

```typescript
export interface CreatePlanInput {
  scope: PlanScope; // NEW: Required
  branchId?: string; // NEW: Required if scope is BRANCH
  name: string;
  description?: string;
  durationType: DurationType;
  durationValue: number;
  price: number;
  currency: string;
  maxFreezeDays?: number;
  autoRenew?: boolean;
  sortOrder?: number;
}
```

**Time:** 15 minutes

### Step 2: Implement Scope Validation Logic

Add new private method to `MembershipPlansService`:

```typescript
/**
 * Validate plan scope and branchId consistency
 * Business rules:
 * - TENANT scope requires branchId = null
 * - BRANCH scope requires branchId (not null)
 * - branchId must belong to current tenant
 * - Branch must be active (if BRANCH scope)
 */
private async validateScopeAndBranch(
  tenantId: string,
  scope: PlanScope,
  branchId: string | null | undefined,
): Promise<void> {
  if (scope === PlanScope.TENANT) {
    if (branchId !== null && branchId !== undefined) {
      throw new BadRequestException(
        'TENANT-scoped plans cannot have a branchId. Set branchId to null or omit it.',
      );
    }
  } else if (scope === PlanScope.BRANCH) {
    if (!branchId) {
      throw new BadRequestException(
        'BRANCH-scoped plans require a branchId.',
      );
    }

    // Validate branch exists and belongs to tenant
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    if (branch.tenantId !== tenantId) {
      throw new BadRequestException(
        'Branch does not belong to current tenant',
      );
    }

    if (!branch.isActive) {
      throw new BadRequestException(
        'Cannot create plan for archived branch',
      );
    }
  }
}
```

**Time:** 1 hour

### Step 3: Update Uniqueness Validation Logic

Refactor `checkNameUniqueness` method:

```typescript
/**
 * Check plan name uniqueness based on scope
 * Business rules:
 * - TENANT scope: Unique per tenant (case-insensitive, ACTIVE only)
 * - BRANCH scope: Unique per branch (case-insensitive, ACTIVE only)
 * - Archived plans do not count toward uniqueness
 */
private async checkNameUniqueness(
  tenantId: string,
  scope: PlanScope,
  branchId: string | null,
  name: string,
  excludePlanId: string | null,
): Promise<void> {
  const where: Prisma.MembershipPlanWhereInput = {
    tenantId,
    scope,
    status: PlanStatus.ACTIVE, // Only ACTIVE plans count
    name: {
      equals: name.trim(),
      mode: 'insensitive',
    },
  };

  if (scope === PlanScope.BRANCH) {
    where.branchId = branchId;
  } else {
    where.branchId = null; // TENANT scope
  }

  if (excludePlanId) {
    where.id = {
      not: excludePlanId,
    };
  }

  const existingPlan = await this.prisma.membershipPlan.findFirst({
    where,
  });

  if (existingPlan) {
    const scopeLabel = scope === PlanScope.TENANT ? 'tenant' : 'branch';
    throw new ConflictException(
      `A plan with this name already exists for this ${scopeLabel}. Please choose a different name.`,
    );
  }
}
```

**Time:** 2 hours

### Step 4: Update createPlanForTenant Method

```typescript
async createPlanForTenant(
  tenantId: string,
  input: CreatePlanInput,
): Promise<MembershipPlan> {
  // Validate scope and branchId
  await this.validateScopeAndBranch(tenantId, input.scope, input.branchId);

  // Validate duration value
  this.validateDurationValue(input.durationType, input.durationValue);

  // Validate currency format
  this.validateCurrency(input.currency);

  // Validate price
  if (input.price < 0) {
    throw new BadRequestException('Fiyat negatif olamaz');
  }

  // Check name uniqueness (scope-based)
  await this.checkNameUniqueness(
    tenantId,
    input.scope,
    input.scope === PlanScope.BRANCH ? input.branchId! : null,
    input.name,
    null,
  );

  // Create plan with status ACTIVE
  return this.prisma.membershipPlan.create({
    data: {
      tenantId,
      scope: input.scope,
      branchId: input.scope === PlanScope.BRANCH ? input.branchId! : null,
      name: input.name.trim(),
      description: input.description?.trim(),
      durationType: input.durationType,
      durationValue: input.durationValue,
      price: input.price,
      currency: input.currency.toUpperCase(),
      maxFreezeDays: input.maxFreezeDays,
      autoRenew: input.autoRenew ?? false,
      status: PlanStatus.ACTIVE,
      sortOrder: input.sortOrder,
    },
  });
}
```

**Time:** 30 minutes

### Step 5: Update updatePlanForTenant Method

Add scope immutability check:

```typescript
async updatePlanForTenant(
  tenantId: string,
  planId: string,
  input: UpdatePlanInput,
): Promise<MembershipPlan> {
  const existingPlan = await this.getPlanByIdForTenant(tenantId, planId);

  // Prevent scope and branchId changes (immutable)
  if (input.scope !== undefined && input.scope !== existingPlan.scope) {
    throw new BadRequestException(
      'Plan scope cannot be changed after creation',
    );
  }

  if (input.branchId !== undefined && input.branchId !== existingPlan.branchId) {
    throw new BadRequestException(
      'Plan branchId cannot be changed after creation',
    );
  }

  // ... rest of validation logic ...
  
  // Check name uniqueness if name is being updated
  if (input.name && input.name.trim() !== existingPlan.name) {
    await this.checkNameUniqueness(
      tenantId,
      existingPlan.scope,
      existingPlan.branchId,
      input.name,
      planId,
    );
  }

  // ... rest of update logic ...
}
```

**Time:** 1 hour

### Step 6: Update Plan Listing Methods

Update `listPlansForTenant` to support scope and branchId filters:

```typescript
async listPlansForTenant(
  tenantId: string,
  filters: PlanListFilters = {},
): Promise<PlanListResponse> {
  const { scope, branchId, q, includeArchived, page = 1, limit = 20 } = filters;

  const where: Prisma.MembershipPlanWhereInput = {
    tenantId,
  };

  if (scope) {
    where.scope = scope;
  }

  if (branchId) {
    // Validate branchId belongs to tenant
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.tenantId !== tenantId) {
      throw new BadRequestException(
        'Invalid branchId: branch not found or access denied',
      );
    }

    where.branchId = branchId;
  }

  if (q) {
    where.name = {
      contains: q,
      mode: 'insensitive',
    };
  }

  if (!includeArchived) {
    where.status = PlanStatus.ACTIVE;
  }

  // ... rest of query logic ...
}
```

Update `listActivePlansForTenant` to support branchId filter:

```typescript
async listActivePlansForTenant(
  tenantId: string,
  branchId?: string,
): Promise<MembershipPlan[]> {
  const where: Prisma.MembershipPlanWhereInput = {
    tenantId,
    status: PlanStatus.ACTIVE,
  };

  if (branchId) {
    // Validate branchId belongs to tenant
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.tenantId !== tenantId) {
      throw new BadRequestException(
        'Invalid branchId: branch not found or access denied',
      );
    }

    // Return TENANT plans + BRANCH plans for this branch
    where.OR = [
      { scope: PlanScope.TENANT },
      { scope: PlanScope.BRANCH, branchId },
    ];
  } else {
    // Return only TENANT plans
    where.scope = PlanScope.TENANT;
  }

  return this.prisma.membershipPlan.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}
```

**Time:** 1 hour

---

## Phase 3: DTOs & Controller Updates (Day 3)

### Step 1: Update CreatePlanDto

Edit `backend/src/membership-plans/dto/create-plan.dto.ts`:

```typescript
import { IsEnum, IsString, IsOptional, IsNumber, Min, Max, ValidateIf } from 'class-validator';
import { PlanScope } from '@prisma/client';

export class CreatePlanDto {
  @IsEnum(PlanScope)
  scope: PlanScope;

  @ValidateIf((o) => o.scope === PlanScope.BRANCH)
  @IsString()
  branchId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // ... rest of fields ...
}
```

**Time:** 30 minutes

### Step 2: Update UpdatePlanDto

Edit `backend/src/membership-plans/dto/update-plan.dto.ts`:

```typescript
// Explicitly exclude scope and branchId (immutable)
export class UpdatePlanDto {
  // scope and branchId are NOT included (immutable)
  
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  // ... rest of fields ...
}
```

**Time:** 30 minutes

### Step 3: Update PlanListQueryDto

Edit `backend/src/membership-plans/dto/plan-list-query.dto.ts`:

```typescript
import { IsEnum, IsString, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { PlanScope } from '@prisma/client';

export class PlanListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(PlanScope)
  scope?: PlanScope;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  includeMemberCount?: boolean;
}
```

**Time:** 30 minutes

### Step 4: Update Controller Methods

Edit `backend/src/membership-plans/membership-plans.controller.ts`:

Update `create` method to pass scope and branchId:

```typescript
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
async create(
  @CurrentUser() user: JwtPayload,
  @Body() createPlanDto: CreatePlanDto,
): Promise<MembershipPlan> {
  return this.plansService.createPlanForTenant(user.tenantId, {
    scope: createPlanDto.scope,
    branchId: createPlanDto.branchId,
    name: createPlanDto.name,
    // ... rest of fields ...
  });
}
```

Update `list` method to pass filters:

```typescript
@Get()
@UseGuards(JwtAuthGuard)
async list(
  @CurrentUser() user: JwtPayload,
  @Query() query: PlanListQueryDto,
): Promise<PlanListResponse> {
  return this.plansService.listPlansForTenant(user.tenantId, {
    scope: query.scope,
    branchId: query.branchId,
    q: query.q,
    includeArchived: query.includeArchived,
    page: query.page,
    limit: query.limit,
  });
}
```

Update `getActivePlans` method:

```typescript
@Get('active')
@UseGuards(JwtAuthGuard)
async getActivePlans(
  @CurrentUser() user: JwtPayload,
  @Query('branchId') branchId?: string,
): Promise<MembershipPlan[]> {
  return this.plansService.listActivePlansForTenant(user.tenantId, branchId);
}
```

**Time:** 1 hour

---

## Phase 4: Testing (Day 4)

### Step 1: Unit Tests

Create/update `backend/src/membership-plans/membership-plans.service.spec.ts`:

Test cases to add:
- [ ] Create TENANT-scoped plan (success)
- [ ] Create TENANT-scoped plan with branchId (failure)
- [ ] Create BRANCH-scoped plan without branchId (failure)
- [ ] Create BRANCH-scoped plan with branchId from different tenant (failure)
- [ ] Create BRANCH-scoped plan with archived branch (failure)
- [ ] Create duplicate TENANT plan name (failure)
- [ ] Create duplicate BRANCH plan name within branch (failure)
- [ ] Create duplicate names across different branches (success)
- [ ] Create duplicate names between TENANT and BRANCH scopes (success)
- [ ] Update plan attempting to change scope (failure)
- [ ] Update plan attempting to change branchId (failure)
- [ ] List plans with scope filter
- [ ] List plans with branchId filter

**Time:** 3 hours

### Step 2: Integration Tests

Create/update `backend/test/membership-plans.e2e-spec.ts`:

Test cases to add:
- [ ] POST /membership-plans with TENANT scope
- [ ] POST /membership-plans with BRANCH scope
- [ ] POST /membership-plans rejects TENANT plan with branchId (400)
- [ ] POST /membership-plans rejects BRANCH plan without branchId (400)
- [ ] GET /membership-plans with scope filter
- [ ] GET /membership-plans with branchId filter
- [ ] GET /membership-plans/active with branchId
- [ ] PATCH /membership-plans/:id rejects scope change (400)

**Time:** 4 hours

---

## Verification Checklist

Before considering this feature complete:

- [ ] Migration runs successfully on development database
- [ ] All existing plans have scope=TENANT and branchId=null
- [ ] Can create TENANT-scoped plan
- [ ] Can create BRANCH-scoped plan
- [ ] Scope validation works correctly
- [ ] Uniqueness validation works for both scopes
- [ ] Plan listing with scope filter works
- [ ] Plan listing with branchId filter works
- [ ] Active plans endpoint returns correct plans based on branchId
- [ ] Scope immutability enforced
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Tenant isolation maintained

---

## Common Issues & Solutions

### Issue: Migration fails with unique constraint violation

**Solution:** Ensure migration updates all existing plans before dropping the old constraint:
```sql
UPDATE "MembershipPlan" SET scope = 'TENANT', "branchId" = NULL;
```

### Issue: Uniqueness check fails for TENANT scope

**Solution:** Ensure `checkNameUniqueness` filters by `scope = TENANT` and `branchId = null` for TENANT scope.

### Issue: Branch validation fails for valid branch

**Solution:** Ensure branch validation checks `branch.tenantId === tenantId` and `branch.isActive === true`.

---

## Next Steps

After completing this feature:

1. Frontend implementation (deferred to future feature)
2. Plan migration between scopes (deferred)
3. Plan assignment rules based on member branch (deferred)

---

**End of Quickstart Guide**


