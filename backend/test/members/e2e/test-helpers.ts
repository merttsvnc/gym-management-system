import { PrismaService } from '../../../src/prisma/prisma.service';
import { MemberGender, MemberStatus } from '@prisma/client';

/**
 * Helper function to create a test member
 */
export async function createTestMember(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  overrides?: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    gender: MemberGender;
    dateOfBirth: Date;
    membershipType: string;
    membershipPlanId: string;
    membershipStartDate: Date;
    membershipEndDate: Date;
    membershipPriceAtPurchase: number;
    status: MemberStatus;
    pausedAt: Date;
    resumedAt: Date;
    notes: string;
  }>,
) {
  const now = new Date();
  const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const defaultEndDate = new Date(
    defaultStartDate.getTime() + 365 * 24 * 60 * 60 * 1000,
  ); // 1 year from start

  // Get a default plan for the tenant
  const defaultPlan = await prisma.membershipPlan.findFirst({
    where: { tenantId, status: 'ACTIVE' },
  });

  const phone =
    overrides?.phone ||
    `+${Math.floor(Math.random() * 9000000000) + 1000000000}`;

  return prisma.member.create({
    data: {
      tenantId,
      branchId,
      firstName: overrides?.firstName || 'Test',
      lastName: overrides?.lastName || 'Member',
      phone,
      email: overrides?.email,
      gender: overrides?.gender,
      dateOfBirth: overrides?.dateOfBirth,
      membershipType: overrides?.membershipType || 'Basic',
      membershipPlanId: overrides?.membershipPlanId || defaultPlan?.id,
      membershipStartDate: overrides?.membershipStartDate || defaultStartDate,
      membershipEndDate: overrides?.membershipEndDate || defaultEndDate,
      membershipPriceAtPurchase: overrides?.membershipPriceAtPurchase || 100,
      status: overrides?.status || MemberStatus.ACTIVE,
      pausedAt: overrides?.pausedAt,
      resumedAt: overrides?.resumedAt,
      notes: overrides?.notes,
    },
  });
}

/**
 * Helper function to clean up test members
 */
export async function cleanupTestMembers(
  prisma: PrismaService,
  tenantIds?: string[],
) {
  if (tenantIds && tenantIds.length > 0) {
    const validTenantIds = tenantIds.filter(
      (id): id is string => id !== undefined,
    );
    if (validTenantIds.length > 0) {
      await prisma.member.deleteMany({
        where: { tenantId: { in: validTenantIds } },
      });
    }
  } else {
    await prisma.member.deleteMany({});
  }
}

/**
 * Helper to create multiple test members
 */
export async function createMultipleTestMembers(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  count: number,
  baseOverrides?: Partial<{
    status: MemberStatus;
    membershipType: string;
  }>,
) {
  const members = [];
  for (let i = 0; i < count; i++) {
    const member = await createTestMember(prisma, tenantId, branchId, {
      firstName: `Member${i}`,
      lastName: `Test${i}`,
      phone: `+12345${String(i).padStart(5, '0')}`,
      ...baseOverrides,
    });
    members.push(member);
  }
  return members;
}
