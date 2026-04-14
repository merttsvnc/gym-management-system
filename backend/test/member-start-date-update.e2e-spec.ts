/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestTenantAndUser,
  createTestBranch,
  createTestMembershipPlan,
  cleanupTestData,
  createMockToken,
} from './test-helpers';
import { addDays, addMonths } from 'date-fns';

describe('Member Start Date Update E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: any;
  let user: any;
  let branch: any;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix('api/v1', {
      exclude: ['', 'health', 'api/mobile/*'],
    });

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    const setup = await createTestTenantAndUser(prisma, {
      tenantName: 'Start Date Test Gym',
      userEmail: `startdate-test-${Date.now()}@test.com`,
    });
    tenant = setup.tenant;
    user = setup.user;
    branch = await createTestBranch(prisma, tenant.id, {
      name: 'Start Date Test Branch',
      isDefault: true,
    });
    token = createMockToken({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
    });
  });

  afterAll(async () => {
    await prisma.memberPlanChangeHistory.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.member.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: tenant.id },
    });
    await cleanupTestData(prisma, [tenant.id]);
    await app.close();
  });

  afterEach(async () => {
    await prisma.memberPlanChangeHistory.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.member.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: tenant.id },
    });
  });

  // Helper: create a member via API
  async function createMember(
    planId: string,
    startDate?: string,
    phone?: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId: branch.id,
        firstName: 'Test',
        lastName: 'Member',
        phone: phone || `+9055${Date.now().toString().slice(-8)}`,
        membershipPlanId: planId,
        ...(startDate && { membershipStartDate: startDate }),
      })
      .expect(201);
    return res.body;
  }

  // =====================================================================
  // T-SD-01: Start date update triggers end date recalculation (MONTHS plan)
  // =====================================================================
  describe('T-SD-01 - Start date change recalculates end date (MONTHS)', () => {
    it('should auto-recalculate membershipEndDate when membershipStartDate changes', async () => {
      // Create a 3-month plan
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Quarterly Plan',
          durationType: 'MONTHS',
          durationValue: 3,
          price: 300,
        },
      );

      // Create member starting today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const member = await createMember(plan.id, today.toISOString());

      // Verify initial dates
      const originalStart = new Date(member.membershipStartDate);
      const originalEnd = new Date(member.membershipEndDate);
      const expectedOriginalEnd = addMonths(originalStart, 3);
      expect(originalEnd.toISOString().slice(0, 10)).toBe(
        expectedOriginalEnd.toISOString().slice(0, 10),
      );

      // Update start date to 10 days in the past
      const newStartDate = new Date(today);
      newStartDate.setDate(newStartDate.getDate() - 10);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipStartDate: newStartDate.toISOString() })
        .expect(200);

      // Verify: end date was recalculated from new start + plan duration
      const updatedStart = new Date(res.body.membershipStartDate);
      const updatedEnd = new Date(res.body.membershipEndDate);
      const expectedNewEnd = addMonths(newStartDate, 3);

      expect(updatedStart.toISOString().slice(0, 10)).toBe(
        newStartDate.toISOString().slice(0, 10),
      );
      expect(updatedEnd.toISOString().slice(0, 10)).toBe(
        expectedNewEnd.toISOString().slice(0, 10),
      );

      // End date should be different from original
      expect(updatedEnd.toISOString()).not.toBe(originalEnd.toISOString());
    });
  });

  // =====================================================================
  // T-SD-02: Start date update triggers end date recalculation (DAYS plan)
  // =====================================================================
  describe('T-SD-02 - Start date change recalculates end date (DAYS)', () => {
    it('should auto-recalculate membershipEndDate for DAYS-type plans', async () => {
      // Create a 30-day plan
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: '30 Day Plan',
          durationType: 'DAYS',
          durationValue: 30,
          price: 100,
        },
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const member = await createMember(plan.id, today.toISOString());

      // Update start date to 5 days ahead
      const newStartDate = addDays(today, 5);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipStartDate: newStartDate.toISOString() })
        .expect(200);

      const updatedEnd = new Date(res.body.membershipEndDate);
      const expectedEnd = addDays(newStartDate, 30);

      expect(updatedEnd.toISOString().slice(0, 10)).toBe(
        expectedEnd.toISOString().slice(0, 10),
      );
    });
  });

  // =====================================================================
  // T-SD-03: No start date in request → end date preserved (legacy behavior)
  // =====================================================================
  describe('T-SD-03 - No start date change preserves end date', () => {
    it('should NOT recalculate end date when only other fields are updated', async () => {
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Monthly Plan',
          durationType: 'MONTHS',
          durationValue: 1,
          price: 100,
        },
      );

      const member = await createMember(plan.id);
      const originalEnd = member.membershipEndDate;

      // Update only firstName (no date fields)
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(res.body.firstName).toBe('Updated');
      expect(res.body.membershipEndDate).toBe(originalEnd);
    });
  });

  // =====================================================================
  // T-SD-04: Same start date sent → no recalculation (idempotent)
  // =====================================================================
  describe('T-SD-04 - Same start date is idempotent', () => {
    it('should NOT recalculate if the same start date is sent', async () => {
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Yearly Plan',
          durationType: 'MONTHS',
          durationValue: 12,
          price: 1200,
        },
      );

      const member = await createMember(plan.id);
      const originalEnd = member.membershipEndDate;

      // Send the same start date
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          membershipStartDate: member.membershipStartDate,
        })
        .expect(200);

      expect(res.body.membershipEndDate).toBe(originalEnd);
    });
  });

  // =====================================================================
  // T-SD-05: PAUSED member → start date update rejected
  // =====================================================================
  describe('T-SD-05 - PAUSED member blocks start date change', () => {
    it('should return 400 when trying to change start date of a paused member', async () => {
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Pause Test Plan',
          durationType: 'MONTHS',
          durationValue: 6,
          price: 600,
        },
      );

      const member = await createMember(plan.id);

      // Pause the member
      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PAUSED' })
        .expect(200);

      // Try to change start date
      const newStartDate = new Date();
      newStartDate.setDate(newStartDate.getDate() - 5);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipStartDate: newStartDate.toISOString() })
        .expect(400);

      expect(res.body.message).toContain('Dondurulmuş');
    });
  });

  // =====================================================================
  // T-SD-06: Pending plan change dates recalculated when start date changes
  // =====================================================================
  describe('T-SD-06 - Pending plan change dates recalculated', () => {
    it('should recalculate pending plan change dates when start date changes', async () => {
      // Create current plan and pending plan
      const currentPlan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Current Plan',
          durationType: 'MONTHS',
          durationValue: 1,
          price: 100,
        },
      );

      const pendingPlan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Pending Plan',
          durationType: 'MONTHS',
          durationValue: 3,
          price: 300,
        },
      );

      const member = await createMember(currentPlan.id);

      // Schedule a plan change
      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipPlanId: pendingPlan.id })
        .expect(200);

      // Now change start date
      const newStartDate = new Date();
      newStartDate.setDate(newStartDate.getDate() - 5);
      newStartDate.setHours(0, 0, 0, 0);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipStartDate: newStartDate.toISOString() })
        .expect(200);

      // Verify: pending start date should be new end date + 1 day
      const updatedEnd = new Date(res.body.membershipEndDate);
      const expectedPendingStart = new Date(updatedEnd);
      expectedPendingStart.setUTCDate(expectedPendingStart.getUTCDate() + 1);
      expectedPendingStart.setUTCHours(0, 0, 0, 0);

      const actualPendingStart = new Date(res.body.pendingMembershipStartDate);
      expect(actualPendingStart.toISOString().slice(0, 10)).toBe(
        expectedPendingStart.toISOString().slice(0, 10),
      );

      // Verify: pending end date should be pending start + pending plan duration
      const expectedPendingEnd = addMonths(expectedPendingStart, 3);
      const actualPendingEnd = new Date(res.body.pendingMembershipEndDate);
      expect(actualPendingEnd.toISOString().slice(0, 10)).toBe(
        expectedPendingEnd.toISOString().slice(0, 10),
      );
    });
  });

  // =====================================================================
  // T-SD-07: End date can still be set explicitly (without start date change)
  // =====================================================================
  describe('T-SD-07 - Explicit end date update still works', () => {
    it('should allow explicit membershipEndDate update when start date is not changed', async () => {
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Explicit End Plan',
          durationType: 'MONTHS',
          durationValue: 1,
          price: 100,
        },
      );

      const member = await createMember(plan.id);

      // Set a custom end date (much later)
      const customEnd = new Date();
      customEnd.setFullYear(customEnd.getFullYear() + 2);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipEndDate: customEnd.toISOString() })
        .expect(200);

      expect(
        new Date(res.body.membershipEndDate).toISOString().slice(0, 10),
      ).toBe(customEnd.toISOString().slice(0, 10));
    });
  });

  // =====================================================================
  // T-SD-08: membershipPlanId still forbidden in PATCH
  // =====================================================================
  describe('T-SD-08 - membershipPlanId still forbidden', () => {
    it('should reject PATCH with membershipPlanId (v1 restriction preserved)', async () => {
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Forbidden Test Plan',
          durationType: 'MONTHS',
          durationValue: 1,
          price: 100,
        },
      );

      const member = await createMember(plan.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipPlanId: 'some-other-plan-id' })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // =====================================================================
  // T-SD-09: Legacy alias membershipStartAt also triggers recalculation
  // =====================================================================
  describe('T-SD-09 - Legacy alias membershipStartAt works', () => {
    it('should recalculate end date when using membershipStartAt alias', async () => {
      const plan = await createTestMembershipPlan(
        prisma,
        tenant.id,
        undefined,
        {
          name: 'Legacy Alias Plan',
          durationType: 'DAYS',
          durationValue: 60,
          price: 200,
        },
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const member = await createMember(plan.id, today.toISOString());

      const newStartDate = addDays(today, -3);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipStartAt: newStartDate.toISOString() })
        .expect(200);

      const updatedEnd = new Date(res.body.membershipEndDate);
      const expectedEnd = addDays(newStartDate, 60);

      expect(updatedEnd.toISOString().slice(0, 10)).toBe(
        expectedEnd.toISOString().slice(0, 10),
      );
    });
  });
});
