/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestTenantAndUser,
  createTestBranch,
  cleanupTestData,
  createMockToken,
} from './test-helpers';
import { DurationType, PlanStatus, MemberStatus } from '@prisma/client';

describe('REPRODUCTION: Monthly Members Bug - New Tenant Shows Zero Counts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let newTenant: any;
  let newUser: any;
  let newBranch: any;
  let newToken: string;
  let newPlan: any;
  let member1: any;
  let member2: any;
  let member3: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply global validation pipe (same as main.ts)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    // Apply same global prefix as main.ts
    app.setGlobalPrefix('api/v1', {
      exclude: ['', 'health', 'api/mobile/*'],
    });

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    console.log('\n=== STEP 1: Creating brand new tenant ===');
    // Create a brand new tenant and user
    const setup = await createTestTenantAndUser(prisma, {
      tenantName: 'Brand New Gym',
      userEmail: `repro-new-tenant-${Date.now()}@test.com`,
    });
    newTenant = setup.tenant;
    newUser = setup.user;
    newBranch = await createTestBranch(prisma, newTenant.id, {
      name: 'Main Branch',
      isDefault: true,
    });
    newToken = createMockToken({
      userId: newUser.id,
      tenantId: newTenant.id,
      email: newUser.email,
    });

    console.log(`Tenant ID: ${newTenant.id}`);
    console.log(`Branch ID: ${newBranch.id}`);

    console.log('\n=== STEP 2: Creating a membership plan ===');
    // Create a membership plan
    newPlan = await prisma.membershipPlan.create({
      data: {
        tenantId: newTenant.id,
        scope: 'TENANT',
        scopeKey: 'TENANT',
        name: 'Monthly Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 200,
        currency: 'TRY',
        status: PlanStatus.ACTIVE,
      },
    });

    console.log(`Plan ID: ${newPlan.id}`);

    console.log('\n=== STEP 3: Creating 3 members in current month ===');
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Create 3 members all in the current month (today)
    member1 = await prisma.member.create({
      data: {
        tenantId: newTenant.id,
        branchId: newBranch.id,
        firstName: 'Member',
        lastName: 'One',
        phone: `+905551234${Date.now().toString().slice(-3)}`,
        membershipPlanId: newPlan.id,
        membershipStartDate: today,
        membershipEndDate: nextMonth,
        status: MemberStatus.ACTIVE,
        createdAt: today, // Explicitly set to today
      },
    });

    member2 = await prisma.member.create({
      data: {
        tenantId: newTenant.id,
        branchId: newBranch.id,
        firstName: 'Member',
        lastName: 'Two',
        phone: `+905551235${Date.now().toString().slice(-3)}`,
        membershipPlanId: newPlan.id,
        membershipStartDate: today,
        membershipEndDate: nextMonth,
        status: MemberStatus.ACTIVE,
        createdAt: today, // Explicitly set to today
      },
    });

    member3 = await prisma.member.create({
      data: {
        tenantId: newTenant.id,
        branchId: newBranch.id,
        firstName: 'Member',
        lastName: 'Three',
        phone: `+905551236${Date.now().toString().slice(-3)}`,
        membershipPlanId: newPlan.id,
        membershipStartDate: today,
        membershipEndDate: nextMonth,
        status: MemberStatus.ACTIVE,
        createdAt: today, // Explicitly set to today
      },
    });

    console.log(`Member 1 created at: ${member1.createdAt.toISOString()}`);
    console.log(`Member 2 created at: ${member2.createdAt.toISOString()}`);
    console.log(`Member 3 created at: ${member3.createdAt.toISOString()}`);
    console.log(
      `Current month (YYYY-MM): ${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`,
    );
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.member.deleteMany({
      where: { tenantId: newTenant.id },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: newTenant.id },
    });
    await cleanupTestData(prisma, [newTenant.id]);
    await app.close();
  });

  it('REPRO TEST: Should show 3 new members in current month (but currently shows 0)', async () => {
    console.log('\n=== STEP 4: Calling dashboard endpoint ===');

    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboard/monthly-members')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    console.log('\n=== RAW BACKEND RESPONSE ===');
    console.log(JSON.stringify(response.body, null, 2));

    // Analyze the response
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(6); // Default 6 months

    // Find current month in response
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;

    console.log(`\nLooking for month key: ${currentMonthKey}`);

    const currentMonthData = response.body.find(
      (item: { month: string; newMembers: number }) =>
        item.month === currentMonthKey,
    );

    if (currentMonthData) {
      console.log(`Found current month data:`, currentMonthData);
      console.log(
        `\nBUG REPRODUCTION: Expected 3 new members, got ${currentMonthData.newMembers}`,
      );

      // This assertion will FAIL if the bug exists
      expect(currentMonthData.newMembers).toBe(3);
    } else {
      console.log(
        `ERROR: Current month ${currentMonthKey} not found in response!`,
      );
      console.log(
        'Available months:',
        response.body.map(
          (item: { month: string; newMembers: number }) => item.month,
        ),
      );
      fail(`Current month ${currentMonthKey} not found in response`);
    }
  });

  it('Should also show counts in tenant-wide query (no branch filter)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboard/monthly-members')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    const currentMonthData = response.body.find(
      (item: { month: string; newMembers: number }) =>
        item.month === currentMonthKey,
    );

    expect(currentMonthData).toBeDefined();
    expect(currentMonthData?.newMembers).toBeGreaterThanOrEqual(3);
  });

  it('Should show counts when filtered by branch', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/dashboard/monthly-members?branchId=${newBranch.id}`)
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    const currentMonthData = response.body.find(
      (item: { month: string; newMembers: number }) =>
        item.month === currentMonthKey,
    );

    expect(currentMonthData).toBeDefined();
    expect(currentMonthData?.newMembers).toBeGreaterThanOrEqual(3);
  });
});
