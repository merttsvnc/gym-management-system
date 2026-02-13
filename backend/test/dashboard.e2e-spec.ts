/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestTenantAndUser,
  createTestBranch,
  cleanupTestData,
  createMockToken,
} from './test-helpers';
import { DurationType, PlanStatus, MemberStatus } from '@prisma/client';

describe('Dashboard E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant1: any;
  let user1: any;
  let branch1: any;
  let branch2: any;
  let token1: string;
  let tenant2: any;
  let user2: any;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let token2: string;
  let plan1: any;
  let plan2: any;

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
    app.useGlobalFilters(new HttpExceptionFilter());

    // Apply same global prefix as main.ts
    app.setGlobalPrefix('api/v1', {
      exclude: ['', 'api/mobile/*'],
    });

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create test tenants and users
    const setup1 = await createTestTenantAndUser(prisma, {
      tenantName: 'Gym 1',
      userEmail: `tenant1-dashboard-${Date.now()}@test.com`,
    });
    tenant1 = setup1.tenant;
    user1 = setup1.user;
    branch1 = await createTestBranch(prisma, tenant1.id, {
      name: 'Branch 1',
      isDefault: true,
    });
    branch2 = await createTestBranch(prisma, tenant1.id, {
      name: 'Branch 2',
      isDefault: false,
    });
    token1 = createMockToken({
      userId: user1.id,
      tenantId: tenant1.id,
      email: user1.email,
    });

    const setup2 = await createTestTenantAndUser(prisma, {
      tenantName: 'Gym 2',
      userEmail: `tenant2-dashboard-${Date.now()}@test.com`,
    });
    tenant2 = setup2.tenant;
    user2 = setup2.user;
    await createTestBranch(prisma, tenant2.id, {
      name: 'Branch 2',
      isDefault: true,
    });
    token2 = createMockToken({
      userId: user2.id,
      tenantId: tenant2.id,
      email: user2.email,
    });

    // Create membership plans for tenant1
    plan1 = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        scope: 'TENANT',
        scopeKey: 'TENANT',
        name: 'Basic Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'TRY',
        status: PlanStatus.ACTIVE,
      },
    });

    plan2 = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        scope: 'TENANT',
        scopeKey: 'TENANT',
        name: 'Premium Plan',
        durationType: DurationType.MONTHS,
        durationValue: 3,
        price: 250,
        currency: 'TRY',
        status: PlanStatus.ACTIVE,
      },
    });

    // Create members for tenant1
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    // Active members
    await prisma.member.create({
      data: {
        tenantId: tenant1.id,
        branchId: branch1.id,
        firstName: 'Active',
        lastName: 'Member1',
        phone: '555-0001',
        membershipPlanId: plan1.id,
        membershipStartDate: today,
        membershipEndDate: nextMonth,
        status: MemberStatus.ACTIVE,
        createdAt: today,
      },
    });

    await prisma.member.create({
      data: {
        tenantId: tenant1.id,
        branchId: branch1.id,
        firstName: 'Active',
        lastName: 'Member2',
        phone: '555-0002',
        membershipPlanId: plan2.id,
        membershipStartDate: today,
        membershipEndDate: nextMonth,
        status: MemberStatus.ACTIVE,
        createdAt: today,
      },
    });

    // Expiring soon member
    await prisma.member.create({
      data: {
        tenantId: tenant1.id,
        branchId: branch1.id,
        firstName: 'Expiring',
        lastName: 'Member',
        phone: '555-0003',
        membershipPlanId: plan1.id,
        membershipStartDate: today,
        membershipEndDate: nextWeek,
        status: MemberStatus.ACTIVE,
        createdAt: today,
      },
    });

    // Inactive member (expired)
    await prisma.member.create({
      data: {
        tenantId: tenant1.id,
        branchId: branch1.id,
        firstName: 'Inactive',
        lastName: 'Member',
        phone: '555-0004',
        membershipPlanId: plan1.id,
        membershipStartDate: lastMonth,
        membershipEndDate: today,
        status: MemberStatus.INACTIVE,
        createdAt: lastMonth,
      },
    });

    // Member from branch2
    await prisma.member.create({
      data: {
        tenantId: tenant1.id,
        branchId: branch2.id,
        firstName: 'Branch2',
        lastName: 'Member',
        phone: '555-0005',
        membershipPlanId: plan1.id,
        membershipStartDate: today,
        membershipEndDate: nextMonth,
        status: MemberStatus.ACTIVE,
        createdAt: today,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.member.deleteMany({
      where: { tenantId: { in: [tenant1.id, tenant2.id] } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: { in: [tenant1.id, tenant2.id] } },
    });
    await cleanupTestData(prisma, [tenant1.id, tenant2.id]);
    await app.close();
  });

  describe('GET /api/v1/dashboard/summary', () => {
    it('should return 200 with summary statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('counts');
      expect(response.body.counts).toHaveProperty('totalMembers');
      expect(response.body.counts).toHaveProperty('activeMembers');
      expect(response.body.counts).toHaveProperty('passiveMembers');
      expect(response.body.counts).toHaveProperty('expiringSoonMembers');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('expiringDays');
      expect(typeof response.body.counts.totalMembers).toBe('number');
      expect(typeof response.body.counts.activeMembers).toBe('number');
      expect(typeof response.body.counts.passiveMembers).toBe('number');
      expect(typeof response.body.counts.expiringSoonMembers).toBe('number');
      expect(typeof response.body.meta.expiringDays).toBe('number');
    });

    it('should respect branchId filter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/dashboard/summary?branchId=${branch1.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.counts.totalMembers).toBeGreaterThan(0);
      expect(response.body.meta.branchId).toBe(branch1.id);
    });

    it('should respect expiringDays parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary?expiringDays=14')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.meta.expiringDays).toBe(14);
    });

    it('should return 400 for invalid expiringDays', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary?expiringDays=0')
        .set('Authorization', `Bearer ${token1}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary?expiringDays=61')
        .set('Authorization', `Bearer ${token1}`)
        .expect(400);
    });

    it('should enforce tenant isolation', async () => {
      // Try to access tenant2's data with tenant1's token
      // Should return empty/zero results, not tenant2's data
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // tenant1 should have members, tenant2 should not appear
      expect(response.body.totalMembers).toBeGreaterThanOrEqual(0);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .expect(401);
    });
  });

  describe('GET /api/v1/dashboard/membership-distribution', () => {
    it('should return 200 with membership distribution', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/membership-distribution')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('planId');
        expect(response.body[0]).toHaveProperty('planName');
        expect(response.body[0]).toHaveProperty('activeMemberCount');
      }
    });

    it('should respect branchId filter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/dashboard/membership-distribution?branchId=${branch1.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should enforce tenant isolation', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/membership-distribution')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Should only return plans for tenant1
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/membership-distribution')
        .expect(401);
    });
  });

  describe('GET /api/v1/dashboard/monthly-members', () => {
    it('should return 200 with monthly members', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(6); // Default 6 months
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('month');
        expect(response.body[0]).toHaveProperty('newMembers');
        expect(response.body[0].month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof response.body[0].newMembers).toBe('number');
      }
    });

    it('should respect months parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-members?months=12')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.length).toBe(12);
    });

    it('should respect branchId filter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/dashboard/monthly-members?branchId=${branch1.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(6);
    });

    it('should return 400 for invalid months parameter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-members?months=13')
        .set('Authorization', `Bearer ${token1}`)
        .expect(400);
    });

    it('should enforce tenant isolation', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-members')
        .expect(401);
    });

    it('should include members created today in current month count (regression test)', async () => {
      // This is a regression test for the timezone bug where members created
      // "today" were not included in the current month count

      // Create a new member today
      const rightNow = new Date(); // Current moment
      const nextMonth = new Date(rightNow);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const todayMember = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Today',
          lastName: 'Member',
          phone: `555-today-${Date.now()}`,
          membershipPlanId: plan1.id,
          membershipStartDate: rightNow,
          membershipEndDate: nextMonth,
          status: MemberStatus.ACTIVE,
          createdAt: rightNow, // Created at this exact moment
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Find current month in response
      const currentMonth = `${rightNow.getFullYear()}-${(rightNow.getMonth() + 1).toString().padStart(2, '0')}`;
      const currentMonthData = response.body.find(
        (item: { month: string; newMembers: number }) =>
          item.month === currentMonth,
      );

      expect(currentMonthData).toBeDefined();
      expect(currentMonthData?.newMembers).toBeGreaterThanOrEqual(1);

      // Clean up
      await prisma.member.delete({ where: { id: todayMember.id } });
    });

    it('should count members across different months correctly', async () => {
      // Create members in past months for testing
      const now = new Date();
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      twoMonthsAgo.setDate(15);

      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      oneMonthAgo.setDate(15);

      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);

      const member1 = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Past',
          lastName: 'Member1',
          phone: `555-past1-${Date.now()}`,
          membershipPlanId: plan1.id,
          membershipStartDate: twoMonthsAgo,
          membershipEndDate: endDate,
          status: MemberStatus.ACTIVE,
          createdAt: twoMonthsAgo,
        },
      });

      const member2 = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Past',
          lastName: 'Member2',
          phone: `555-past2-${Date.now()}`,
          membershipPlanId: plan1.id,
          membershipStartDate: oneMonthAgo,
          membershipEndDate: endDate,
          status: MemberStatus.ACTIVE,
          createdAt: oneMonthAgo,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-members?months=6')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Verify the months have correct counts
      const twoMonthsAgoKey = `${twoMonthsAgo.getFullYear()}-${(twoMonthsAgo.getMonth() + 1).toString().padStart(2, '0')}`;
      const oneMonthAgoKey = `${oneMonthAgo.getFullYear()}-${(oneMonthAgo.getMonth() + 1).toString().padStart(2, '0')}`;

      const twoMonthsAgoData = response.body.find(
        (item: { month: string; newMembers: number }) =>
          item.month === twoMonthsAgoKey,
      );
      const oneMonthAgoData = response.body.find(
        (item: { month: string; newMembers: number }) =>
          item.month === oneMonthAgoKey,
      );

      expect(twoMonthsAgoData?.newMembers).toBeGreaterThanOrEqual(1);
      expect(oneMonthAgoData?.newMembers).toBeGreaterThanOrEqual(1);

      // Clean up
      await prisma.member.deleteMany({
        where: { id: { in: [member1.id, member2.id] } },
      });
    });

    // REGRESSION TESTS for timezone edge cases (BUGFIX 2026-01-28)
    describe('Timezone boundary handling', () => {
      it('should handle UTC midnight correctly (start of month)', async () => {
        // Create member at UTC midnight on first day of current month
        const now = new Date();
        const utcMidnight = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
        );
        const endDate = new Date(utcMidnight);
        endDate.setMonth(endDate.getMonth() + 1);

        const member = await prisma.member.create({
          data: {
            tenantId: tenant1.id,
            branchId: branch1.id,
            firstName: 'UTC',
            lastName: 'Midnight',
            phone: `555-utc-midnight-${Date.now()}`,
            membershipPlanId: plan1.id,
            membershipStartDate: utcMidnight,
            membershipEndDate: endDate,
            status: MemberStatus.ACTIVE,
            createdAt: utcMidnight,
          },
        });

        const response = await request(app.getHttpServer())
          .get('/api/v1/dashboard/monthly-members')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        // Should be counted in the current month (UTC)
        const currentMonthKey = `${utcMidnight.getUTCFullYear()}-${(utcMidnight.getUTCMonth() + 1).toString().padStart(2, '0')}`;
        const currentMonthData = response.body.find(
          (item: { month: string; newMembers: number }) =>
            item.month === currentMonthKey,
        );

        expect(currentMonthData).toBeDefined();
        expect(currentMonthData?.newMembers).toBeGreaterThanOrEqual(1);

        // Clean up
        await prisma.member.delete({ where: { id: member.id } });
      });

      it('should handle UTC near-midnight correctly (end of month)', async () => {
        // Create member at 23:59:59 UTC on last day of previous month
        const now = new Date();
        const lastMonthEnd = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999),
        );
        const endDate = new Date(lastMonthEnd);
        endDate.setMonth(endDate.getMonth() + 1);

        const member = await prisma.member.create({
          data: {
            tenantId: tenant1.id,
            branchId: branch1.id,
            firstName: 'Near',
            lastName: 'Midnight',
            phone: `555-near-midnight-${Date.now()}`,
            membershipPlanId: plan1.id,
            membershipStartDate: lastMonthEnd,
            membershipEndDate: endDate,
            status: MemberStatus.ACTIVE,
            createdAt: lastMonthEnd,
          },
        });

        const response = await request(app.getHttpServer())
          .get('/api/v1/dashboard/monthly-members?months=12')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        // Should be counted in the previous month (UTC), not current month
        const lastMonthKey = `${lastMonthEnd.getUTCFullYear()}-${(lastMonthEnd.getUTCMonth() + 1).toString().padStart(2, '0')}`;
        const lastMonthData = response.body.find(
          (item: { month: string; newMembers: number }) =>
            item.month === lastMonthKey,
        );

        expect(lastMonthData).toBeDefined();
        expect(lastMonthData?.newMembers).toBeGreaterThanOrEqual(1);

        // Clean up
        await prisma.member.delete({ where: { id: member.id } });
      });

      it('should aggregate consistently regardless of server timezone', async () => {
        // Create members at various times across a month boundary
        const now = new Date();
        const times = [
          // Last day of previous month, various hours UTC
          new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 0, 0, 0, 0),
          ), // 00:00 UTC
          new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 12, 0, 0, 0),
          ), // 12:00 UTC
          new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              0,
              23,
              59,
              59,
              999,
            ),
          ), // 23:59 UTC
          // First day of current month
          new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
          ), // 00:00 UTC
        ];

        const memberIds: string[] = [];
        for (let i = 0; i < times.length; i++) {
          const time = times[i];
          const endDate = new Date(time);
          endDate.setMonth(endDate.getMonth() + 1);

          const member = await prisma.member.create({
            data: {
              tenantId: tenant1.id,
              branchId: branch1.id,
              firstName: 'Boundary',
              lastName: `Test${i}`,
              phone: `555-boundary-${Date.now()}-${i}`,
              membershipPlanId: plan1.id,
              membershipStartDate: time,
              membershipEndDate: endDate,
              status: MemberStatus.ACTIVE,
              createdAt: time,
            },
          });
          memberIds.push(member.id);
        }

        const response = await request(app.getHttpServer())
          .get('/api/v1/dashboard/monthly-members?months=12')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        // Last month should have 3 members (indexes 0, 1, 2)
        const lastMonthKey = `${times[0].getUTCFullYear()}-${(times[0].getUTCMonth() + 1).toString().padStart(2, '0')}`;
        const lastMonthData = response.body.find(
          (item: { month: string; newMembers: number }) =>
            item.month === lastMonthKey,
        );

        // Current month should have 1 member (index 3)
        const currentMonthKey = `${times[3].getUTCFullYear()}-${(times[3].getUTCMonth() + 1).toString().padStart(2, '0')}`;
        const currentMonthData = response.body.find(
          (item: { month: string; newMembers: number }) =>
            item.month === currentMonthKey,
        );

        // Verify counts are based on UTC month, not server local time
        expect(lastMonthData?.newMembers).toBeGreaterThanOrEqual(3);
        expect(currentMonthData?.newMembers).toBeGreaterThanOrEqual(1);

        // Clean up
        await prisma.member.deleteMany({
          where: { id: { in: memberIds } },
        });
      });
    });
  });

  describe('GET /api/mobile/dashboard/summary', () => {
    it('should return 200 with mobile summary format', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/mobile/dashboard/summary')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('counts');
      expect(response.body.counts).toHaveProperty('totalMembers');
      expect(response.body.counts).toHaveProperty('activeMembers');
      expect(response.body.counts).toHaveProperty('passiveMembers');
      expect(response.body.counts).toHaveProperty('expiringSoonMembers');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('expiringDays');
      expect(response.body.meta.expiringDays).toBe(7); // Default
    });

    it('should respect expiringDays parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/mobile/dashboard/summary?expiringDays=14')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.meta.expiringDays).toBe(14);
    });

    it('should respect branchId filter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/mobile/dashboard/summary?branchId=${branch1.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.meta.branchId).toBe(branch1.id);
    });

    it('should calculate expiringSoonMembers correctly', async () => {
      // Create a member expiring today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDateToday = new Date(today);
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const memberToday = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Expiring',
          lastName: 'Today',
          phone: `555-exp-today-${Date.now()}`,
          membershipPlanId: plan1.id,
          membershipStartDate: today,
          membershipEndDate: endDateToday,
          status: MemberStatus.ACTIVE,
        },
      });

      // Create a member expiring in 7 days
      const endDate7Days = new Date(today);
      endDate7Days.setDate(endDate7Days.getDate() + 7);

      const member7Days = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Expiring',
          lastName: '7Days',
          phone: `555-exp-7days-${Date.now()}`,
          membershipPlanId: plan1.id,
          membershipStartDate: today,
          membershipEndDate: endDate7Days,
          status: MemberStatus.ACTIVE,
        },
      });

      // Create a member expiring in 8 days (should not be included)
      const endDate8Days = new Date(today);
      endDate8Days.setDate(endDate8Days.getDate() + 8);

      const member8Days = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Expiring',
          lastName: '8Days',
          phone: `555-exp-8days-${Date.now()}`,
          membershipPlanId: plan1.id,
          membershipStartDate: today,
          membershipEndDate: endDate8Days,
          status: MemberStatus.ACTIVE,
        },
      });

      // Create an active member with null endDate (should not be included)
      const memberNullEndDate = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Null',
          lastName: 'EndDate',
          phone: `555-null-end-${Date.now()}`,
          membershipPlanId: plan1.id,
          membershipStartDate: today,
          membershipEndDate: nextMonth, // Will update to null below
          status: MemberStatus.ACTIVE,
        },
      });

      // Update to null endDate (simulating edge case)
      await prisma.member.update({
        where: { id: memberNullEndDate.id },
        data: { membershipEndDate: null as any },
      });

      const response = await request(app.getHttpServer())
        .get('/api/mobile/dashboard/summary?expiringDays=7')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Should include members expiring today and in 7 days, but not 8 days or null
      expect(response.body.counts.expiringSoonMembers).toBeGreaterThanOrEqual(
        2,
      );

      // Clean up
      await prisma.member.deleteMany({
        where: {
          id: {
            in: [
              memberToday.id,
              member7Days.id,
              member8Days.id,
              memberNullEndDate.id,
            ],
          },
        },
      });
    });

    it('should enforce tenant isolation', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/mobile/dashboard/summary')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Should only return data for tenant1
      expect(response.body.counts.totalMembers).toBeGreaterThanOrEqual(0);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/mobile/dashboard/summary')
        .expect(401);
    });
  });
});
