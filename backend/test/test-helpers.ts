/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../src/prisma/prisma.service';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';

/**
 * Test helper to create a JWT token for E2E testing
 * Creates a real JWT token using the same secret as the app
 */
export function createMockToken(user: {
  userId: string;
  tenantId: string;
  email?: string;
  role?: string;
}): string {
  const payload = {
    sub: user.userId, // JWT standard uses 'sub' for subject (userId)
    tenantId: user.tenantId,
    email: user.email || 'test@example.com',
    role: user.role || 'ADMIN',
  };

  // Use the same secret as in .env or default
  const secret = process.env.JWT_ACCESS_SECRET || 'your_access_secret_here';

  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

/**
 * Create a tenant in the database
 */
export async function createTenant(
  prisma: PrismaService,
  name: string,
  planKey: 'SINGLE' = 'SINGLE',
) {
  return prisma.tenant.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      defaultCurrency: 'USD',
      planKey,
    },
  });
}

/**
 * Create an admin user with a hashed password
 */
export async function createAdminUser(
  prisma: PrismaService,
  tenantId: string,
  email: string,
  rawPassword: string = 'Pass123!',
) {
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  return prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
}

/**
 * Create a user with a specific role
 * Note: Currently only ADMIN role is available in the schema
 */
export async function createUserWithRole(
  prisma: PrismaService,
  tenantId: string,
  email: string,
  role: 'ADMIN',
  rawPassword: string = 'Pass123!',
) {
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  return prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      role,
    },
  });
}

/**
 * Create a regular user (non-admin) for testing
 * Since only ADMIN role exists, we'll create an ADMIN but can simulate different
 * permissions in future when more roles are added
 */
export async function createRegularUser(
  prisma: PrismaService,
  tenantId: string,
  email: string,
  rawPassword: string = 'Pass123!',
) {
  // For now, all users are ADMIN since that's the only role
  // In the future, this would create a user with limited permissions
  return createAdminUser(prisma, tenantId, email, rawPassword);
}

/**
 * Login and get access token
 */
export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  userId: string;
  tenantId: string;
}> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
    userId: response.body.user.id,
    tenantId: response.body.user.tenantId,
  };
}

/**
 * Creates test tenant and user for e2e tests
 */
export async function createTestTenantAndUser(
  prisma: PrismaService,
  data?: {
    tenantName?: string;
    tenantSlug?: string;
    userEmail?: string;
    userPassword?: string;
  },
) {
  const tenant = await prisma.tenant.create({
    data: {
      name: data?.tenantName || 'Test Gym',
      slug:
        data?.tenantSlug ||
        `test-gym-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      defaultCurrency: 'USD',
      planKey: 'SINGLE', // Default to SINGLE plan (max 3 branches)
    },
  });

  const password = data?.userPassword || 'Pass123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email:
        data?.userEmail ||
        `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      role: 'ADMIN',
    },
  });

  return { tenant, user };
}

/**
 * Creates a test branch for a tenant
 */
export async function createTestBranch(
  prisma: PrismaService,
  tenantId: string,
  data?: {
    name?: string;
    address?: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
) {
  // Generate unique branch name if not provided
  const branchName =
    data?.name ||
    `Test Branch ${Date.now()}-${Math.random().toString(36).substring(7)}`;

  return prisma.branch.create({
    data: {
      tenantId,
      name: branchName,
      address: data?.address || '123 Test St, Test City',
      isDefault: data?.isDefault ?? false,
      isActive: data?.isActive ?? true,
    },
  });
}

/**
 * Creates a test membership plan for a tenant
 */
export async function createTestMembershipPlan(
  prisma: PrismaService,
  tenantId: string,
  branchId?: string,
  data?: {
    name?: string;
    price?: number;
    durationType?: string;
    durationValue?: number;
    scope?: string;
  },
) {
  const planName =
    data?.name ||
    `Test Plan ${Date.now()}-${Math.random().toString(36).substring(7)}`;

  return prisma.membershipPlan.create({
    data: {
      tenantId,
      branchId,
      scope: (data?.scope as any) || 'TENANT',
      scopeKey: branchId ? `BRANCH:${branchId}` : 'TENANT',
      name: planName,
      description: 'Test plan description',
      durationType: (data?.durationType as any) || 'MONTHS',
      durationValue: data?.durationValue || 12,
      price: data?.price || 100,
      currency: 'USD',
      maxFreezeDays: 30,
      autoRenew: false,
      status: 'ACTIVE',
    },
  });
}

/**
 * Cleans up test data
 * If tenantIds are provided, only deletes data for those tenants
 * Otherwise, deletes all test data
 */
export async function cleanupTestData(
  prisma: PrismaService,
  tenantIds?: string[],
) {
  if (tenantIds && tenantIds.length > 0) {
    // Filter out undefined values
    const validTenantIds = tenantIds.filter(
      (id): id is string => id !== undefined,
    );

    if (validTenantIds.length === 0) {
      return;
    }

    // Clean up only specific tenants and their related data
    // Delete in correct order to respect foreign key constraints
    await prisma.payment.deleteMany({
      where: { tenantId: { in: validTenantIds } },
    });
    await prisma.member.deleteMany({
      where: { tenantId: { in: validTenantIds } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: { in: validTenantIds } },
    });
    await prisma.user.deleteMany({
      where: { tenantId: { in: validTenantIds } },
    });
    await prisma.branch.deleteMany({
      where: { tenantId: { in: validTenantIds } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: validTenantIds } },
    });
  } else {
    // Clean up all test data
    await prisma.user.deleteMany({});
    await prisma.member.deleteMany({});
    await prisma.membershipPlan.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.tenant.deleteMany({});
  }
}
