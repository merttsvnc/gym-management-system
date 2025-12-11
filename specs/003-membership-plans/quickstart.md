# Quickstart Guide: Membership Plan Management

**Version:** 1.0.0  
**Date:** 2025-01-20  
**Feature:** 003-membership-plans

---

## Overview

This guide provides step-by-step instructions for implementing the Membership Plan Management feature. Follow these phases in order, testing after each phase before proceeding.

**Estimated Total Time:** 10-12 person-days

---

## Prerequisites

- Backend: NestJS + Prisma + PostgreSQL setup complete
- Frontend: React + Vite + TypeScript setup complete
- Authentication: JWT auth with tenant claims working
- Member management: Existing Member model and service

---

## Phase 0: Research & Setup (Day 1)

### Step 1: Install Dependencies

```bash
# Backend
cd backend
npm install date-fns

# Frontend (if not already installed)
cd ../frontend
# date-fns may be needed for frontend date calculations too
npm install date-fns
```

### Step 2: Review Research Findings

Read `research.md` to understand:
- Date calculation approach (date-fns `addMonths`)
- Migration strategy (multi-step Prisma migrations)
- Currency validation (regex for ISO 4217)

**Time:** 30 minutes

---

## Phase 1: Database Schema & Migration (Days 2-3)

### Step 1: Update Prisma Schema

Edit `backend/prisma/schema.prisma`:

1. Add `DurationType` and `PlanStatus` enums
2. Add `MembershipPlan` model
3. Modify `Member` model:
   - Add `membershipPlanId` (nullable initially)
   - Add `membershipPriceAtPurchase` (nullable)
   - Keep `membershipType` temporarily

**Example:**
```prisma
enum DurationType {
  DAYS
  MONTHS
}

enum PlanStatus {
  ACTIVE
  ARCHIVED
}

model MembershipPlan {
  id           String      @id @default(cuid())
  tenantId     String
  name         String
  description  String?
  durationType String
  durationValue Int
  price        Decimal     @db.Decimal(10, 2)
  currency     String
  maxFreezeDays Int?
  autoRenew    Boolean     @default(false)
  status       String
  sortOrder    Int?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  members Member[]

  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, sortOrder])
}

model Member {
  // ... existing fields ...
  membershipPlanId String?  // Temporarily nullable
  membershipPlan   MembershipPlan? @relation(fields: [membershipPlanId], references: [id])
  membershipPriceAtPurchase Decimal? @db.Decimal(10, 2)
  membershipType String?  // Temporarily kept for migration
  // ... other fields ...
  @@index([membershipPlanId])
  @@index([tenantId, membershipPlanId])
}
```

**Time:** 1 hour

### Step 2: Create Migration for MembershipPlan Table

```bash
cd backend
npx prisma migrate dev --name add_membership_plan_table
```

Verify migration file created correctly.

**Time:** 15 minutes

### Step 3: Create Migration for Member Changes

```bash
npx prisma migrate dev --name add_member_plan_reference
```

**Time:** 15 minutes

### Step 4: Create Data Migration Script

Create `backend/prisma/migrations/[timestamp]_add_member_plan_reference/migrate-data.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateMembershipTypes() {
  const tenants = await prisma.tenant.findMany();
  
  for (const tenant of tenants) {
    // Get unique membershipType values for this tenant
    const members = await prisma.member.findMany({
      where: { tenantId: tenant.id },
      select: { membershipType: true },
      distinct: ['membershipType'],
    });
    
    for (const member of members) {
      if (!member.membershipType) continue;
      
      // Create plan for this membershipType
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant.id,
          name: member.membershipType,
          durationType: 'MONTHS',
          durationValue: 12,
          price: 0,
          currency: tenant.defaultCurrency || 'TRY',
          status: 'ACTIVE',
        },
      });
      
      // Assign members to this plan
      await prisma.member.updateMany({
        where: {
          tenantId: tenant.id,
          membershipType: member.membershipType,
        },
        data: {
          membershipPlanId: plan.id,
          membershipPriceAtPurchase: plan.price,
        },
      });
    }
  }
  
  console.log('Migration complete!');
}

migrateMembershipTypes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run the script:
```bash
npx ts-node prisma/migrations/[timestamp]_add_member_plan_reference/migrate-data.ts
```

**Time:** 2 hours

### Step 5: Create Final Migration to Remove membershipType

Update schema to make `membershipPlanId` NOT NULL and remove `membershipType`:

```prisma
model Member {
  // ... existing fields ...
  membershipPlanId String  // Now required
  // membershipType removed
  // ... other fields ...
}
```

```bash
npx prisma migrate dev --name remove_membership_type_column
```

**Time:** 30 minutes

### Step 6: Verify Migration

```bash
# Check database
npx prisma studio

# Verify:
# - All members have membershipPlanId
# - Plans created for each unique membershipType
# - No membershipType column remaining
```

**Time:** 30 minutes

**Total Phase 1 Time:** ~5 hours

---

## Phase 2: Backend Domain & Service Layer (Days 4-5)

### Step 1: Create Duration Calculator Utility

Create `backend/src/membership-plans/utils/duration-calculator.ts`:

```typescript
import { addDays, addMonths } from 'date-fns';
import { DurationType } from '@prisma/client';

export function calculateMembershipEndDate(
  startDate: Date,
  durationType: DurationType,
  durationValue: number,
): Date {
  if (durationType === 'DAYS') {
    return addDays(startDate, durationValue);
  }
  // MONTHS
  return addMonths(startDate, durationValue);
}
```

Create tests: `backend/src/membership-plans/utils/duration-calculator.spec.ts`

**Time:** 2 hours

### Step 2: Create MembershipPlansService

Create `backend/src/membership-plans/membership-plans.service.ts`:

```typescript
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class MembershipPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreatePlanDto) {
    // Validate name uniqueness (case-insensitive)
    // Validate duration ranges
    // Create plan
  }

  async findAll(tenantId: string, query: PlanListQueryDto) {
    // List plans with pagination and filters
  }

  async findActive(tenantId: string) {
    // Get active plans only
  }

  async findOne(tenantId: string, id: string) {
    // Get single plan with tenant validation
  }

  async update(tenantId: string, id: string, dto: UpdatePlanDto) {
    // Update plan with validation
  }

  async archive(tenantId: string, id: string) {
    // Archive plan, check active members
  }

  async restore(tenantId: string, id: string) {
    // Restore archived plan
  }

  async remove(tenantId: string, id: string) {
    // Delete plan only if no members
  }

  private async checkActiveMembers(planId: string): Promise<number> {
    // Count active members (status=ACTIVE AND membershipEndDate>=today)
  }
}
```

**Time:** 4 hours

### Step 3: Create DTOs

Create:
- `backend/src/membership-plans/dto/create-plan.dto.ts`
- `backend/src/membership-plans/dto/update-plan.dto.ts`
- `backend/src/membership-plans/dto/plan-list-query.dto.ts`

**Time:** 2 hours

### Step 4: Update MembersService

Modify `backend/src/members/members.service.ts`:

```typescript
async create(tenantId: string, dto: CreateMemberDto) {
  // Validate plan exists and is ACTIVE
  // Validate plan belongs to tenant
  // Calculate membershipEndDate using duration calculator
  // Set membershipPriceAtPurchase
  // Create member
}
```

**Time:** 2 hours

### Step 5: Update Member DTOs

Update:
- `backend/src/members/dto/create-member.dto.ts` (replace `membershipType` with `membershipPlanId`)
- `backend/src/members/dto/update-member.dto.ts` (disallow `membershipPlanId`)

**Time:** 1 hour

**Total Phase 2 Time:** ~11 hours

---

## Phase 3: Backend API Controllers (Day 6)

### Step 1: Create MembershipPlansController

Create `backend/src/membership-plans/membership-plans.controller.ts`:

```typescript
@Controller('membership-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipPlansController {
  constructor(private readonly plansService: MembershipPlansService) {}

  @Get()
  findAll(@CurrentUser() user, @Query() query: PlanListQueryDto) {
    return this.plansService.findAll(user.tenantId, query);
  }

  @Get('active')
  findActive(@CurrentUser() user) {
    return this.plansService.findActive(user.tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user, @Param('id') id: string) {
    return this.plansService.findOne(user.tenantId, id);
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() user, @Body() dto: CreatePlanDto) {
    return this.plansService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() user, @Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(user.tenantId, id, dto);
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  archive(@CurrentUser() user, @Param('id') id: string) {
    return this.plansService.archive(user.tenantId, id);
  }

  @Post(':id/restore')
  @Roles('ADMIN')
  restore(@CurrentUser() user, @Param('id') id: string) {
    return this.plansService.restore(user.tenantId, id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@CurrentUser() user, @Param('id') id: string) {
    return this.plansService.remove(user.tenantId, id);
  }
}
```

**Time:** 2 hours

### Step 2: Create MembershipPlansModule

Create `backend/src/membership-plans/membership-plans.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MembershipPlansController } from './membership-plans.controller';
import { MembershipPlansService } from './membership-plans.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MembershipPlansController],
  providers: [MembershipPlansService],
  exports: [MembershipPlansService],
})
export class MembershipPlansModule {}
```

**Time:** 15 minutes

### Step 3: Register Module in AppModule

Update `backend/src/app.module.ts`:

```typescript
import { MembershipPlansModule } from './membership-plans/membership-plans.module';

@Module({
  imports: [
    // ... other modules
    MembershipPlansModule,
  ],
})
export class AppModule {}
```

**Time:** 15 minutes

### Step 4: Update MembersController

Update `backend/src/members/members.controller.ts` to use new DTO structure.

**Time:** 1 hour

**Total Phase 3 Time:** ~4 hours

---

## Phase 4: Frontend API Client & Hooks (Day 7)

### Step 1: Create API Client

Create `frontend/src/api/membership-plans.ts`:

```typescript
import { client } from './client';
import type { MembershipPlan, CreatePlanRequest, UpdatePlanRequest, PlanListQuery } from '../types/membership-plan';

export const membershipPlansApi = {
  list: (query?: PlanListQuery) => client.get<PlanListResponse>('/membership-plans', { params: query }),
  getActive: () => client.get<MembershipPlan[]>('/membership-plans/active'),
  getById: (id: string) => client.get<MembershipPlan>(`/membership-plans/${id}`),
  create: (data: CreatePlanRequest) => client.post<MembershipPlan>('/membership-plans', data),
  update: (id: string, data: UpdatePlanRequest) => client.patch<MembershipPlan>(`/membership-plans/${id}`, data),
  archive: (id: string) => client.post(`/membership-plans/${id}/archive`),
  restore: (id: string) => client.post(`/membership-plans/${id}/restore`),
  delete: (id: string) => client.delete(`/membership-plans/${id}`),
};
```

**Time:** 1 hour

### Step 2: Create React Query Hooks

Create `frontend/src/hooks/use-membership-plans.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipPlansApi } from '../api/membership-plans';

export function useMembershipPlans(query?: PlanListQuery) {
  return useQuery({
    queryKey: ['membership-plans', query],
    queryFn: () => membershipPlansApi.list(query),
  });
}

export function useActivePlans() {
  return useQuery({
    queryKey: ['membership-plans', 'active'],
    queryFn: () => membershipPlansApi.getActive(),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

// ... other hooks
```

**Time:** 2 hours

### Step 3: Update Shared Types

Update `frontend/src/types/member.ts` and create `frontend/src/types/membership-plan.ts`:

```typescript
// membership-plan.ts
export interface MembershipPlan {
  id: string;
  tenantId: string;
  name: string;
  // ... other fields
}

// member.ts
export interface Member {
  // ... existing fields
  membershipPlanId: string;
  membershipPlan?: MembershipPlan;
  membershipPriceAtPurchase?: number;
}
```

**Time:** 1 hour

**Total Phase 4 Time:** ~4 hours

---

## Phase 5: Frontend UI Components (Days 8-9)

### Step 1: Create PlanSelector Component

Create `frontend/src/components/membership-plans/PlanSelector.tsx`:

```typescript
import { useActivePlans } from '@/hooks/use-membership-plans';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function PlanSelector({ value, onValueChange }) {
  const { data: plans } = useActivePlans();
  
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a plan" />
      </SelectTrigger>
      <SelectContent>
        {plans?.map(plan => (
          <SelectItem key={plan.id} value={plan.id}>
            {plan.name} - {formatDuration(plan.durationType, plan.durationValue)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

**Time:** 2 hours

### Step 2: Create DurationPreview Component

Create `frontend/src/components/membership-plans/DurationPreview.tsx`:

```typescript
import { addDays, addMonths } from 'date-fns';

export function DurationPreview({ startDate, durationType, durationValue }) {
  const endDate = durationType === 'DAYS' 
    ? addDays(startDate, durationValue)
    : addMonths(startDate, durationValue);
  
  return (
    <p className="text-sm text-muted-foreground">
      Membership will end on: {format(endDate, 'yyyy-MM-dd')}
    </p>
  );
}
```

**Time:** 1 hour

### Step 3: Create PlanForm Component

Create `frontend/src/components/membership-plans/PlanForm.tsx` with all form fields.

**Time:** 3 hours

### Step 4: Create Plan List Page

Create `frontend/src/pages/MembershipPlansPage.tsx` with table, filters, pagination.

**Time:** 3 hours

### Step 5: Create Create/Edit Plan Pages

Create pages for creating and editing plans.

**Time:** 3 hours

### Step 6: Update MemberForm

Replace `membershipType` input with `PlanSelector` and add `DurationPreview`.

**Time:** 2 hours

**Total Phase 5 Time:** ~14 hours

---

## Phase 6: Testing & Documentation (Day 10)

### Step 1: Write Unit Tests

- Duration calculator tests
- Plan service tests
- Validation tests

**Time:** 4 hours

### Step 2: Write Integration Tests

- All API endpoints
- Tenant isolation tests
- Member-plan integration tests

**Time:** 4 hours

### Step 3: Update Documentation

- API documentation
- Migration guide
- README updates

**Time:** 2 hours

**Total Phase 6 Time:** ~10 hours

---

## Verification Checklist

Before considering the feature complete:

- [ ] All migrations run successfully
- [ ] All existing members have valid `membershipPlanId`
- [ ] Plan CRUD operations work
- [ ] Plan archival protection works
- [ ] Member creation with plan calculates end date correctly
- [ ] Tenant isolation verified (cross-tenant access blocked)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] UI components render correctly
- [ ] Form validation works
- [ ] Error handling appropriate

---

## Common Pitfalls

1. **Month-End Clamping:** Use `date-fns` `addMonths`, not native Date API
2. **Tenant Isolation:** Always filter by `tenantId` in service layer
3. **Migration Order:** Run data migration before removing `membershipType` column
4. **Plan Name Uniqueness:** Case-insensitive comparison required
5. **Active Member Definition:** Only `status=ACTIVE AND membershipEndDate>=today` counts

---

## Next Steps

After completing this feature:

1. Monitor plan creation and member creation metrics
2. Gather user feedback on plan management UI
3. Plan future enhancements:
   - Plan changes for existing members
   - Advanced freeze logic
   - Auto-renewal job

---

**End of Quickstart Guide**

