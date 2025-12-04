# Quickstart Guide: Tenant Management

**Version:** 1.0.0  
**Date:** 2025-12-04  
**Audience:** Developers implementing the Tenant Management module

---

## Overview

This guide provides a step-by-step walkthrough for implementing the Tenant Management module, from database setup to frontend integration.

**Estimated Time:** 8-10 person-days

**Prerequisites:**
- NestJS project initialized
- React + Vite frontend initialized
- PostgreSQL database running
- Prisma ORM configured
- Basic authentication (JWT) implemented

---

## Phase 1: Database Setup (Day 1)

### 1.1 Create Prisma Schema

Add the following models to your `prisma/schema.prisma`:

```prisma
model Tenant {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  defaultCurrency String   @default("USD")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  branches        Branch[]
  users           User[]

  @@index([slug])
}

model Branch {
  id         String    @id @default(cuid())
  tenantId   String
  name       String
  address    String
  isDefault  Boolean   @default(false)
  isActive   Boolean   @default(true)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  archivedAt DateTime?

  tenant     Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([tenantId, isActive])
  @@index([tenantId, isDefault])
}

model User {
  id           String   @id @default(cuid())
  tenantId     String
  email        String   @unique
  passwordHash String
  firstName    String
  lastName     String
  role         Role     @default(ADMIN)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([email])
}

enum Role {
  ADMIN
}
```

### 1.2 Generate and Run Migration

```bash
# Generate migration
npx prisma migrate dev --name add-tenant-management

# Apply migration
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

### 1.3 Create Seed Data (Development)

Create `prisma/seeds/tenant-seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedTenants() {
  // Create demo tenant
  const demoTenant = await prisma.tenant.create({
    data: {
      name: 'Demo Gym',
      slug: 'demo-gym',
      defaultCurrency: 'USD',
    },
  });

  // Create default branch
  await prisma.branch.create({
    data: {
      tenantId: demoTenant.id,
      name: 'Main Branch',
      address: '123 Fitness St, New York, NY 10001',
      isDefault: true,
      isActive: true,
    },
  });

  // Create admin user
  await prisma.user.create({
    data: {
      tenantId: demoTenant.id,
      email: 'admin@demo-gym.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });

  console.log('✅ Tenant seed data created');
}

seedTenants();
```

Run seed:
```bash
npx ts-node prisma/seeds/tenant-seed.ts
```

---

## Phase 2: Backend Implementation (Days 2-4)

### 2.1 Create Tenant Module Structure

```bash
nest g module tenants
nest g service tenants
nest g controller tenants

nest g module branches
nest g service branches
nest g controller branches
```

### 2.2 Implement Tenant Guard

Create `src/auth/guards/tenant.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Tenant context not found');
    }

    // tenantId is now available in request.user.tenantId
    return true;
  }
}
```

### 2.3 Create DTOs

**src/tenants/dto/update-tenant.dto.ts:**

```typescript
import { IsOptional, IsString, MinLength, MaxLength, IsIn } from 'class-validator';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'BRL', 'MXN', 'ZAR', 'TRY', 'SGD', 'HKD', 'NZD'];

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  defaultCurrency?: string;
}
```

**src/branches/dto/create-branch.dto.ts:**

```typescript
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9 '\-&]+$/, {
    message: 'Only alphanumeric characters, spaces, hyphens, apostrophes, and ampersands allowed',
  })
  name: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address: string;
}
```

### 2.4 Implement Services

**src/tenants/tenants.service.ts:**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async getCurrentTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
    });
  }
}
```

**src/branches/branches.service.ts** (key methods):

```typescript
async listBranches(tenantId: string, query: BranchListQueryDto) {
  const { page = 1, limit = 20, includeArchived = false } = query;
  
  const where = {
    tenantId,
    ...(includeArchived ? {} : { isActive: true }),
  };

  const [data, total] = await Promise.all([
    this.prisma.branch.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    this.prisma.branch.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async archiveBranch(tenantId: string, branchId: string) {
  const branch = await this.getBranch(tenantId, branchId);

  if (branch.isDefault) {
    throw new BadRequestException('Cannot archive default branch. Set another branch as default first.');
  }

  const activeCount = await this.prisma.branch.count({
    where: { tenantId, isActive: true },
  });

  if (activeCount <= 1) {
    throw new BadRequestException('Cannot archive the last active branch');
  }

  return this.prisma.branch.update({
    where: { id: branchId },
    data: {
      isActive: false,
      archivedAt: new Date(),
    },
  });
}

async setDefaultBranch(tenantId: string, branchId: string) {
  const branch = await this.getBranch(tenantId, branchId);

  if (!branch.isActive) {
    throw new BadRequestException('Cannot set archived branch as default');
  }

  return this.prisma.$transaction([
    this.prisma.branch.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    }),
    this.prisma.branch.update({
      where: { id: branchId },
      data: { isDefault: true },
    }),
  ]).then(([_, updated]) => updated);
}
```

### 2.5 Implement Controllers

**src/tenants/tenants.controller.ts:**

```typescript
import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('api/v1/tenants')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get('current')
  getCurrentTenant(@CurrentUser('tenantId') tenantId: string) {
    return this.tenantsService.getCurrentTenant(tenantId);
  }

  @Patch('current')
  updateTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateTenant(tenantId, dto);
  }
}
```

---

## Phase 3: Frontend Implementation (Days 5-7)

### 3.1 Create API Client

**src/api/client.ts:**

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
```

**src/api/tenants.ts:**

```typescript
import apiClient from './client';
import { TenantResponse, UpdateTenantRequest } from '../types/tenant';

export const tenantsApi = {
  getCurrent: () => 
    apiClient.get<TenantResponse>('/api/v1/tenants/current').then(res => res.data),

  updateCurrent: (data: UpdateTenantRequest) =>
    apiClient.patch<TenantResponse>('/api/v1/tenants/current', data).then(res => res.data),
};
```

### 3.2 Create React Query Hooks

**src/hooks/useTenant.ts:**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '../api/tenants';
import { toast } from 'sonner';

export function useCurrentTenant() {
  return useQuery({
    queryKey: ['tenant', 'current'],
    queryFn: tenantsApi.getCurrent,
    staleTime: Infinity,
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: tenantsApi.updateCurrent,
    onSuccess: () => {
      queryClient.invalidateQueries(['tenant', 'current']);
      toast.success('Tenant settings updated successfully');
    },
    onError: () => {
      toast.error('Failed to update tenant settings');
    },
  });
}
```

### 3.3 Create UI Components

**src/pages/settings/tenant/TenantSettingsForm.tsx:**

```typescript
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCurrentTenant, useUpdateTenant } from '@/hooks/useTenant';

export function TenantSettingsForm() {
  const { data: tenant } = useCurrentTenant();
  const updateTenant = useUpdateTenant();
  const { register, handleSubmit } = useForm({
    defaultValues: tenant,
  });

  const onSubmit = (data) => {
    updateTenant.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input label="Tenant Name" {...register('name')} />
      <Select label="Currency" {...register('defaultCurrency')}>
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        {/* ... more currencies */}
      </Select>
      <Button type="submit" loading={updateTenant.isLoading}>
        Save Changes
      </Button>
    </form>
  );
}
```

---

## Phase 4: Testing (Day 8)

### 4.1 Backend Integration Tests

**test/branches.e2e-spec.ts:**

```typescript
describe('Branches API', () => {
  it('should list branches for current tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.pagination).toHaveProperty('total');
  });

  it('should not allow cross-tenant access', async () => {
    const otherTenantBranchId = 'clx9999999999';
    
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${otherTenantBranchId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(403);
  });
});
```

### 4.2 Frontend Component Tests

```typescript
import { render, screen } from '@testing-library/react';
import { BranchTable } from './BranchTable';

test('renders branch list', () => {
  render(<BranchTable branches={mockBranches} />);
  expect(screen.getByText('Main Branch')).toBeInTheDocument();
});
```

---

## Phase 5: Documentation (Day 9)

- Update API documentation
- Add inline code comments
- Update README with Tenant Management section

---

## Common Pitfalls & Solutions

### ❌ Problem: Forgot to filter by tenantId
```typescript
// WRONG
await prisma.branch.findMany();
```

```typescript
// CORRECT
await prisma.branch.findMany({ where: { tenantId } });
```

### ❌ Problem: Not validating tenant access in service layer
```typescript
// WRONG
async getBranch(branchId: string) {
  return this.prisma.branch.findUnique({ where: { id: branchId } });
}
```

```typescript
// CORRECT
async getBranch(tenantId: string, branchId: string) {
  const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
  if (branch.tenantId !== tenantId) {
    throw new ForbiddenException('Access denied');
  }
  return branch;
}
```

### ❌ Problem: Not handling archived branches in default branch logic
```typescript
// WRONG
async setDefaultBranch(branchId: string) {
  // Missing isActive check
}
```

```typescript
// CORRECT
async setDefaultBranch(tenantId: string, branchId: string) {
  const branch = await this.getBranch(tenantId, branchId);
  if (!branch.isActive) {
    throw new BadRequestException('Cannot set archived branch as default');
  }
  // ... rest of logic
}
```

---

## Verification Checklist

Before marking the feature as complete:

- [ ] All Prisma migrations applied and tested
- [ ] All API endpoints return correct status codes
- [ ] Tenant isolation verified (cross-tenant access returns 403)
- [ ] Default branch logic works (exactly one default per tenant)
- [ ] Branch archival rules enforced (cannot archive last/default)
- [ ] Frontend forms validate input correctly
- [ ] React Query caching and invalidation working
- [ ] Unit tests for business rules passing
- [ ] Integration tests for all endpoints passing
- [ ] Error messages are user-friendly
- [ ] Loading states implemented
- [ ] Success/error toasts working

---

## Next Steps

After Tenant Management is complete:

1. **User Management Module:** Implement user invitation, role management
2. **Member Management Module:** Register gym members, assign to branches
3. **Subscription Module:** Membership plans, recurring payments
4. **Check-In Module:** Member check-ins at branches

---

**End of Quickstart Guide**

