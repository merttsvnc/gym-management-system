import { PrismaService } from '../src/prisma/prisma.service';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

/**
 * Test helper to create a mock JWT token for testing
 * Encodes user info as base64 JSON (for our test JwtAuthGuard)
 */
export function createMockToken(user: {
  userId: string;
  tenantId: string;
  email?: string;
  role?: string;
}): string {
  const payload = {
    userId: user.userId,
    tenantId: user.tenantId,
    email: user.email || 'test@example.com',
    role: user.role || 'ADMIN',
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
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
): Promise<{ accessToken: string; refreshToken: string; userId: string; tenantId: string }> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
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
  },
) {
  const tenant = await prisma.tenant.create({
    data: {
      name: data?.tenantName || 'Test Gym',
      slug: data?.tenantSlug || `test-gym-${Date.now()}`,
      defaultCurrency: 'USD',
    },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: data?.userEmail || `test-${Date.now()}@example.com`,
      passwordHash: 'hashed-password',
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
    await prisma.branch.deleteMany({});
    await prisma.tenant.deleteMany({});
  }
}
