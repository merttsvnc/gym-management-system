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
import {
  createTestMember,
  cleanupTestMembers,
} from './e2e/test-helpers';
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
});
