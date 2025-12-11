import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

/**
 * Data migration script to create MembershipPlan records from existing membershipType values
 * and assign members to their corresponding plans.
 *
 * This script:
 * 1. For each tenant, finds all unique membershipType values
 * 2. Creates a MembershipPlan for each unique membershipType
 * 3. Assigns all members with that membershipType to the created plan
 * 4. Sets membershipPriceAtPurchase to the plan's price (0 initially)
 */
async function migrateMembershipTypes() {
  console.log('Starting membership type migration...');

  const tenants = await prisma.tenant.findMany();

  for (const tenant of tenants) {
    console.log(`Processing tenant: ${tenant.name} (${tenant.id})`);

    // Get unique membershipType values for this tenant
    const members = await prisma.member.findMany({
      where: {
        tenantId: tenant.id,
      },
      select: { membershipType: true },
      distinct: ['membershipType'],
    });

    // Filter out null values
    const membershipTypes = members
      .map((m) => m.membershipType)
      .filter((type): type is string => type !== null && type.trim() !== '');

    console.log(
      `Found ${membershipTypes.length} unique membership types for tenant ${tenant.name}`,
    );

    for (const membershipType of membershipTypes) {
      // Check if plan already exists (idempotent)
      const existingPlan = await prisma.membershipPlan.findFirst({
        where: {
          tenantId: tenant.id,
          name: membershipType,
        },
      });

      if (existingPlan) {
        console.log(
          `  Plan "${membershipType}" already exists, skipping creation`,
        );
        continue;
      }

      // Create plan for this membershipType
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant.id,
          name: membershipType,
          description: `Migrated from membershipType: ${membershipType}`,
          durationType: 'MONTHS',
          durationValue: 12, // Default assumption: 12 months
          price: 0, // Unknown, to be set manually later
          currency: tenant.defaultCurrency || 'TRY',
          status: 'ACTIVE',
        },
      });

      console.log(`  Created plan: ${plan.name} (${plan.id})`);

      // Assign members to this plan
      const updateResult = await prisma.member.updateMany({
        where: {
          tenantId: tenant.id,
          membershipType: membershipType,
          membershipPlanId: null, // Only update members not already assigned
        },
        data: {
          membershipPlanId: plan.id,
          membershipPriceAtPurchase: plan.price, // Set to plan's current price (0)
        },
      });

      console.log(
        `  Assigned ${updateResult.count} members to plan "${membershipType}"`,
      );
    }
  }

  console.log('Migration complete!');
}

migrateMembershipTypes()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
