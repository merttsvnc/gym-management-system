import { PrismaService } from '../src/prisma/prisma.service';

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
    // Clean up only specific tenants and their related data
    await prisma.user.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.branch.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: tenantIds } },
    });
  } else {
    // Clean up all test data
    await prisma.user.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.tenant.deleteMany({});
  }
}
