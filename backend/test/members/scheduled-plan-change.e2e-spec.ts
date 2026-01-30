/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createTestTenantAndUser,
  createTestBranch,
  cleanupTestData,
  createMockToken,
} from '../test-helpers';
import { createTestMember, cleanupTestMembers } from './e2e/test-helpers';
import { MembershipPlanChangeSchedulerService } from '../../src/members/services/membership-plan-change-scheduler.service';
import { addDays, addMonths } from 'date-fns';

describe('Scheduled Membership Plan Change E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let schedulerService: MembershipPlanChangeSchedulerService;
  let tenant1: any;
  let user1: any;
  let branch1: any;
  let token1: string;
  let plan1Month: any;
  let plan3Months: any;
  let planBranchScoped: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    schedulerService = app.get<MembershipPlanChangeSchedulerService>(
      MembershipPlanChangeSchedulerService,
    );

    // Create test tenant and user
    const setup1 = await createTestTenantAndUser(prisma, {
      tenantName: 'Gym 1',
      userEmail: 'tenant1@test.com',
    });
    tenant1 = setup1.tenant;
    user1 = setup1.user;
    branch1 = await createTestBranch(prisma, tenant1.id, {
      name: 'Branch 1',
      isDefault: true,
    });
    token1 = createMockToken({
      userId: user1.id,
      tenantId: tenant1.id,
      email: user1.email,
    });

    // Create membership plans
    plan1Month = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        name: '1 Month Plan',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 100,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });

    plan3Months = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        name: '3 Months Plan',
        durationType: 'MONTHS',
        durationValue: 3,
        price: 250,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });

    planBranchScoped = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        branchId: branch1.id,
        scope: 'BRANCH',
        scopeKey: branch1.id,
        name: 'Branch Plan',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 120,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestMembers(prisma, tenant1.id);
    await cleanupTestData(prisma, tenant1.id);
    await app.close();
  });

  describe('POST /api/v1/members/:id/schedule-membership-plan-change', () => {
    it('should schedule a plan change successfully', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: new Date(),
        membershipEndDate: addMonths(new Date(), 1),
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan3Months.id,
        })
        .expect(200);

      expect(response.body.pendingMembershipPlanId).toBe(plan3Months.id);
      expect(response.body.pendingMembershipPriceAtPurchase).toBe('250');
      expect(response.body.pendingMembershipStartDate).toBeDefined();
      expect(response.body.pendingMembershipEndDate).toBeDefined();
      expect(response.body.pendingMembershipScheduledAt).toBeDefined();
      // Active plan should remain unchanged
      expect(response.body.membershipPlanId).toBe(plan1Month.id);

      // Verify history record was created
      const history = await prisma.memberPlanChangeHistory.findFirst({
        where: {
          memberId: member.id,
          changeType: 'SCHEDULED',
        },
      });
      expect(history).toBeDefined();
      expect(history?.oldPlanId).toBe(plan1Month.id);
      expect(history?.newPlanId).toBe(plan3Months.id);
    });

    it('should overwrite existing pending change', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: new Date(),
        membershipEndDate: addMonths(new Date(), 1),
      });

      // Schedule first change
      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan3Months.id,
        })
        .expect(200);

      // Schedule second change (should overwrite)
      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: planBranchScoped.id,
        })
        .expect(200);

      expect(response.body.pendingMembershipPlanId).toBe(planBranchScoped.id);
      expect(response.body.pendingMembershipPriceAtPurchase).toBe('120');

      // Verify two history records exist
      const historyRecords = await prisma.memberPlanChangeHistory.findMany({
        where: {
          memberId: member.id,
          changeType: 'SCHEDULED',
        },
      });
      expect(historyRecords.length).toBe(2);
    });

    it('should return no-op message when same plan selected and no pending exists', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: new Date(),
        membershipEndDate: addMonths(new Date(), 1),
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan1Month.id,
        })
        .expect(200);

      expect(response.body.message).toBe(
        'Zaten aktif olan plan seçildi. Değişiklik yapılmadı.',
      );
      expect(response.body.pendingMembershipPlanId).toBeNull();
    });

    it('should return 404 if member not found', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/members/invalid-id/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan3Months.id,
        })
        .expect(404);
    });

    it('should return 404 if plan not found', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: 'invalid-plan-id',
        })
        .expect(404);
    });

    it('should return 400 if plan is inactive', async () => {
      const archivedPlan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Archived Plan',
          durationType: 'MONTHS',
          durationValue: 1,
          price: 50,
          currency: 'USD',
          status: 'ARCHIVED',
        },
      });

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: archivedPlan.id,
        })
        .expect(400);
    });

    it('should return 400 if branch-scoped plan does not match member branch', async () => {
      const branch2 = await createTestBranch(prisma, tenant1.id, {
        name: 'Branch 2',
      });

      const branch2Plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch2.id,
          scope: 'BRANCH',
          scopeKey: branch2.id,
          name: 'Branch 2 Plan',
          durationType: 'MONTHS',
          durationValue: 1,
          price: 130,
          currency: 'USD',
          status: 'ACTIVE',
        },
      });

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: branch2Plan.id,
        })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/members/:id/schedule-membership-plan-change', () => {
    it('should cancel pending plan change successfully', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: new Date(),
        membershipEndDate: addMonths(new Date(), 1),
      });

      // Schedule a change first
      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan3Months.id,
        })
        .expect(200);

      // Cancel the pending change
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.pendingMembershipPlanId).toBeNull();
      expect(response.body.pendingMembershipStartDate).toBeNull();
      expect(response.body.pendingMembershipEndDate).toBeNull();

      // Verify CANCELLED history record was created
      const history = await prisma.memberPlanChangeHistory.findFirst({
        where: {
          memberId: member.id,
          changeType: 'CANCELLED',
        },
      });
      expect(history).toBeDefined();
    });

    it('should return 200 no-op if no pending change exists', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.pendingMembershipPlanId).toBeNull();
    });
  });

  describe('Scheduled Job - Apply Pending Changes', () => {
    it('should apply pending changes when start date is today or past', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: addDays(today, -30),
        membershipEndDate: today,
      });

      // Schedule change with start date = today
      const pendingStartDate = addDays(today, 1);
      pendingStartDate.setHours(0, 0, 0, 0);
      const pendingEndDate = addMonths(pendingStartDate, 3);

      await prisma.member.update({
        where: { id: member.id },
        data: {
          pendingMembershipPlanId: plan3Months.id,
          pendingMembershipStartDate: pendingStartDate,
          pendingMembershipEndDate: pendingEndDate,
          pendingMembershipPriceAtPurchase: 250,
          pendingMembershipScheduledAt: new Date(),
          pendingMembershipScheduledByUserId: user1.id,
        },
      });

      // Create SCHEDULED history record
      await prisma.memberPlanChangeHistory.create({
        data: {
          tenantId: tenant1.id,
          memberId: member.id,
          oldPlanId: plan1Month.id,
          newPlanId: plan3Months.id,
          oldStartDate: member.membershipStartDate,
          oldEndDate: member.membershipEndDate,
          newStartDate: pendingStartDate,
          newEndDate: pendingEndDate,
          oldPriceAtPurchase: 100,
          newPriceAtPurchase: 250,
          changeType: 'SCHEDULED',
          scheduledAt: new Date(),
          changedByUserId: user1.id,
        },
      });

      // Manually trigger the scheduler (simulating cron job)
      await schedulerService.applyPendingChange(member.id, tenant1.id);

      // Verify active plan was updated
      const updatedMember = await prisma.member.findUnique({
        where: { id: member.id },
      });
      expect(updatedMember?.membershipPlanId).toBe(plan3Months.id);
      expect(updatedMember?.membershipPriceAtPurchase?.toNumber()).toBe(250);
      expect(updatedMember?.pendingMembershipPlanId).toBeNull();

      // Verify APPLIED history record was created
      const appliedHistory = await prisma.memberPlanChangeHistory.findFirst({
        where: {
          memberId: member.id,
          changeType: 'APPLIED',
        },
      });
      expect(appliedHistory).toBeDefined();
      expect(appliedHistory?.appliedAt).toBeDefined();
    });

    it('should be idempotent - not re-apply already applied changes', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
      });

      // Member has no pending change
      await schedulerService.applyPendingChange(member.id, tenant1.id);

      // Should not throw error and should not create duplicate history records
      const historyCount = await prisma.memberPlanChangeHistory.count({
        where: {
          memberId: member.id,
          changeType: 'APPLIED',
        },
      });
      expect(historyCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should apply pending change when pendingStartDate equals today (UTC midnight)', async () => {
      // Arrange: Create a member with membershipEndDate = today
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: addDays(today, -30),
        membershipEndDate: today,
      });

      // Manually set pending fields so pendingMembershipStartDate = today (UTC midnight)
      const pendingStartDate = new Date(today);
      pendingStartDate.setUTCHours(0, 0, 0, 0);
      const pendingEndDate = addMonths(pendingStartDate, 3);
      pendingEndDate.setUTCHours(0, 0, 0, 0);

      await prisma.member.update({
        where: { id: member.id },
        data: {
          pendingMembershipPlanId: plan3Months.id,
          pendingMembershipStartDate: pendingStartDate,
          pendingMembershipEndDate: pendingEndDate,
          pendingMembershipPriceAtPurchase: 250,
          pendingMembershipScheduledAt: new Date(),
          pendingMembershipScheduledByUserId: user1.id,
        },
      });

      // Create SCHEDULED history record
      await prisma.memberPlanChangeHistory.create({
        data: {
          tenantId: tenant1.id,
          memberId: member.id,
          oldPlanId: plan1Month.id,
          newPlanId: plan3Months.id,
          oldStartDate: member.membershipStartDate,
          oldEndDate: member.membershipEndDate,
          newStartDate: pendingStartDate,
          newEndDate: pendingEndDate,
          oldPriceAtPurchase: 100,
          newPriceAtPurchase: 250,
          changeType: 'SCHEDULED',
          scheduledAt: new Date(),
          changedByUserId: user1.id,
        },
      });

      // Act: Call the scheduler apply method directly
      await schedulerService.applyPendingChange(member.id, tenant1.id);

      // Assert: Verify active plan was updated
      const updatedMember = await prisma.member.findUnique({
        where: { id: member.id },
      });

      expect(updatedMember?.membershipPlanId).toBe(plan3Months.id);
      expect(updatedMember?.membershipPriceAtPurchase?.toNumber()).toBe(250);
      expect(updatedMember?.membershipStartDate).toEqual(pendingStartDate);
      expect(updatedMember?.membershipEndDate).toEqual(pendingEndDate);

      // All pending fields should be cleared
      expect(updatedMember?.pendingMembershipPlanId).toBeNull();
      expect(updatedMember?.pendingMembershipStartDate).toBeNull();
      expect(updatedMember?.pendingMembershipEndDate).toBeNull();
      expect(updatedMember?.pendingMembershipPriceAtPurchase).toBeNull();
      expect(updatedMember?.pendingMembershipScheduledAt).toBeNull();
      expect(updatedMember?.pendingMembershipScheduledByUserId).toBeNull();

      // Verify APPLIED history record was created
      const appliedHistory = await prisma.memberPlanChangeHistory.findFirst({
        where: {
          memberId: member.id,
          changeType: 'APPLIED',
        },
      });
      expect(appliedHistory).toBeDefined();
      expect(appliedHistory?.appliedAt).toBeDefined();
      expect(appliedHistory?.newPlanId).toBe(plan3Months.id);
    });

    it('should schedule plan change successfully when membershipEndDate is far in the past', async () => {
      // Arrange: Create a member with a very old end date (simulating edge case)
      const pastEndDate = new Date('2020-01-01T00:00:00.000Z');

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: new Date('2019-12-01T00:00:00.000Z'),
        membershipEndDate: pastEndDate,
      });

      // Act: POST schedule-membership-plan-change with a valid plan
      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan3Months.id,
        })
        .expect(200);

      // Assert: Response should have pending fields set
      expect(response.body.pendingMembershipPlanId).toBe(plan3Months.id);
      expect(response.body.pendingMembershipPriceAtPurchase).toBe('250');
      expect(response.body.pendingMembershipStartDate).toBeDefined();
      expect(response.body.pendingMembershipEndDate).toBeDefined();
      expect(response.body.pendingMembershipScheduledAt).toBeDefined();

      // Verify pending start date is calculated from past end date (pastEndDate + 1 day)
      const updatedMember = await prisma.member.findUnique({
        where: { id: member.id },
      });
      expect(updatedMember?.pendingMembershipStartDate).toBeDefined();

      // Should be Jan 2, 2020 (one day after Jan 1, 2020)
      const pendingStart = updatedMember!.pendingMembershipStartDate!;
      expect(pendingStart.getUTCFullYear()).toBe(2020);
      expect(pendingStart.getUTCMonth()).toBe(0); // January
      expect(pendingStart.getUTCDate()).toBe(2); // Day 2

      // Ensure UTC midnight normalization (hours should be 0)
      expect(pendingStart.getUTCHours()).toBe(0);
      expect(pendingStart.getUTCMinutes()).toBe(0);
      expect(pendingStart.getUTCSeconds()).toBe(0);

      // Verify SCHEDULED history record was created
      const history = await prisma.memberPlanChangeHistory.findFirst({
        where: {
          memberId: member.id,
          changeType: 'SCHEDULED',
        },
      });
      expect(history).toBeDefined();
      expect(history?.newPlanId).toBe(plan3Months.id);
    });

    it('should handle month boundary behavior correctly when scheduling plan change (Jan 31 + 1 month)', async () => {
      // Arrange: Pick a fixed date Jan 31 at UTC midnight
      // Note: This test is designed to verify date-fns addMonths behavior
      // which clamps to last valid day of month (Jan 31 + 1 month = Feb 28/29)
      const jan31 = new Date('2026-01-31T00:00:00.000Z');

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan3Months.id, // Start with 3-month plan
        membershipStartDate: addDays(jan31, -90),
        membershipEndDate: jan31,
      });

      // Act: Schedule a 1-month plan change (different plan to avoid no-op)
      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan1Month.id, // 1 month duration
        })
        .expect(200);

      // Assert: Verify date calculations are robust
      expect(response.body.pendingMembershipPlanId).toBe(plan1Month.id);
      expect(response.body.pendingMembershipStartDate).toBeDefined();
      expect(response.body.pendingMembershipEndDate).toBeDefined();

      // pendingStartDate should be Feb 1 (endDate + 1 day)
      const pendingStartDate = new Date(
        response.body.pendingMembershipStartDate,
      );
      expect(pendingStartDate.getUTCDate()).toBe(1); // Day 1
      expect(pendingStartDate.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(pendingStartDate.getUTCFullYear()).toBe(2026);

      // pendingEndDate must be > pendingStartDate
      const pendingEndDate = new Date(response.body.pendingMembershipEndDate);
      expect(pendingEndDate.getTime()).toBeGreaterThan(
        pendingStartDate.getTime(),
      );

      // For 1-month duration starting Feb 1, 2026:
      // date-fns addMonths(Feb 1, 1) = Mar 1
      // Verify this is the expected result
      expect(pendingEndDate.getUTCDate()).toBe(1); // Day 1
      expect(pendingEndDate.getUTCMonth()).toBe(2); // March (0-indexed)
      expect(pendingEndDate.getUTCFullYear()).toBe(2026);

      // Verify UTC midnight normalization (hours should be 0)
      expect(pendingStartDate.getUTCHours()).toBe(0);
      expect(pendingEndDate.getUTCHours()).toBe(0);

      // Note: date-fns addMonths handles month-end clamping correctly
      // Jan 31 + 1 month = Feb 28/29 (depending on leap year)
      // But since our startDate is Feb 1 (Jan 31 + 1 day), we get Feb 1 + 1 month = Mar 1
      // This test documents the actual behavior of the duration calculator
    });

    it('should store pending dates at UTC midnight (timezone normalization)', async () => {
      // Arrange: Create a member with a future end date
      const futureEndDate = addDays(new Date(), 30);
      futureEndDate.setUTCHours(0, 0, 0, 0);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: new Date(),
        membershipEndDate: futureEndDate,
      });

      // Act: Schedule a plan change
      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan3Months.id,
        })
        .expect(200);

      // Assert: Verify dates are normalized to UTC midnight in response
      const pendingStartDate = new Date(
        response.body.pendingMembershipStartDate,
      );
      const pendingEndDate = new Date(response.body.pendingMembershipEndDate);

      expect(pendingStartDate.getUTCHours()).toBe(0);
      expect(pendingStartDate.getUTCMinutes()).toBe(0);
      expect(pendingStartDate.getUTCSeconds()).toBe(0);
      expect(pendingStartDate.getUTCMilliseconds()).toBe(0);

      expect(pendingEndDate.getUTCHours()).toBe(0);
      expect(pendingEndDate.getUTCMinutes()).toBe(0);
      expect(pendingEndDate.getUTCSeconds()).toBe(0);
      expect(pendingEndDate.getUTCMilliseconds()).toBe(0);

      // Verify dates are also normalized in the database
      const updatedMember = await prisma.member.findUnique({
        where: { id: member.id },
      });

      expect(updatedMember?.pendingMembershipStartDate?.getUTCHours()).toBe(0);
      expect(updatedMember?.pendingMembershipEndDate?.getUTCHours()).toBe(0);
    });
  });
});
