/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

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
import { addDays, addMonths } from 'date-fns';

describe('Membership Renewal E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant1: any;
  let user1: any;
  let branch1: any;
  let branch2: any;
  let token1: string;
  let plan1Month: any;
  let plan3Months: any;
  let planArchived: any;
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

    app.setGlobalPrefix('api/v1', {
      exclude: ['', 'api/mobile/*'],
    });

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create test tenant and user
    const setup1 = await createTestTenantAndUser(prisma, {
      tenantName: 'Renewal Test Gym',
      userEmail: 'renewal-test@test.com',
    });
    tenant1 = setup1.tenant;
    user1 = setup1.user;

    branch1 = await createTestBranch(prisma, tenant1.id, {
      name: 'Renewal Branch 1',
      isDefault: true,
    });

    branch2 = await createTestBranch(prisma, tenant1.id, {
      name: 'Renewal Branch 2',
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
        name: 'Renewal 1 Month',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 100,
        currency: 'TRY',
        status: 'ACTIVE',
      },
    });

    plan3Months = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        name: 'Renewal 3 Months',
        durationType: 'MONTHS',
        durationValue: 3,
        price: 250,
        currency: 'TRY',
        status: 'ACTIVE',
      },
    });

    planArchived = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        name: 'Renewal Archived Plan',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 80,
        currency: 'TRY',
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });

    planBranchScoped = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant1.id,
        branchId: branch2.id,
        scope: 'BRANCH',
        scopeKey: branch2.id,
        name: 'Renewal Branch 2 Plan',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 120,
        currency: 'TRY',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    // Cleanup in correct order (payments reference members)
    await prisma.payment.deleteMany({
      where: { tenantId: tenant1.id },
    });
    await prisma.memberPlanChangeHistory.deleteMany({
      where: { tenantId: tenant1.id },
    });
    await cleanupTestMembers(prisma, [tenant1.id]);
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: tenant1.id },
    });
    await cleanupTestData(prisma, [tenant1.id]);
    await app.close();
  });

  afterEach(async () => {
    // Clean members and related data between tests
    await prisma.payment.deleteMany({
      where: { tenantId: tenant1.id },
    });
    await prisma.memberPlanChangeHistory.deleteMany({
      where: { tenantId: tenant1.id },
    });
    await prisma.member.deleteMany({
      where: { tenantId: tenant1.id },
    });
  });

  describe('POST /api/v1/members/:id/renew-membership', () => {
    // ========================================
    // Expired Member Renewal
    // ========================================
    it('T-REN-001: should renew an expired member starting from today', async () => {
      const pastStart = new Date('2025-01-01');
      const pastEnd = new Date('2025-02-01'); // expired

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: pastStart,
        membershipEndDate: pastEnd,
        status: 'INACTIVE',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      // Should start from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const newStart = new Date(response.body.membershipStartDate);
      newStart.setHours(0, 0, 0, 0);
      expect(newStart.toISOString()).toBe(today.toISOString());

      // Should end 1 month from today (same plan)
      const expectedEnd = addMonths(today, 1);
      const newEnd = new Date(response.body.membershipEndDate);
      newEnd.setHours(0, 0, 0, 0);
      expect(newEnd.toISOString()).toBe(expectedEnd.toISOString());

      // Status should be ACTIVE
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.isMembershipActive).toBe(true);
      expect(response.body.membershipState).toBe('ACTIVE');

      // Renewal info should be present
      expect(response.body.renewal).toBeDefined();
      expect(response.body.renewal.wasExpired).toBe(true);
      expect(response.body.renewal.planId).toBe(plan1Month.id);
    });

    // ========================================
    // Active Member Early Renewal
    // ========================================
    it('T-REN-002: should extend an active member from current end date', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const futureEnd = addMonths(now, 1);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: futureEnd,
        status: 'ACTIVE',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      // Start date should be preserved (original start)
      const respStart = new Date(response.body.membershipStartDate);
      respStart.setHours(0, 0, 0, 0);
      expect(respStart.toISOString()).toBe(now.toISOString());

      // End date should be currentEnd + 1 month (not from today)
      const expectedEnd = addMonths(futureEnd, 1);
      const respEnd = new Date(response.body.membershipEndDate);
      respEnd.setHours(0, 0, 0, 0);
      expect(respEnd.toISOString()).toBe(expectedEnd.toISOString());

      // Renewal info
      expect(response.body.renewal.wasExpired).toBe(false);
      expect(response.body.isMembershipActive).toBe(true);
    });

    // ========================================
    // Different Plan Renewal
    // ========================================
    it('T-REN-003: should renew with a different plan', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: plan3Months.id,
        })
        .expect(200);

      // Plan should be updated
      expect(response.body.membershipPlanId).toBe(plan3Months.id);

      // End date should be currentEnd + 3 months
      const currentEnd = addMonths(now, 1);
      const expectedEnd = addMonths(currentEnd, 3);
      const respEnd = new Date(response.body.membershipEndDate);
      respEnd.setHours(0, 0, 0, 0);
      expect(respEnd.toISOString()).toBe(expectedEnd.toISOString());

      // Price snapshot should be updated
      expect(response.body.membershipPriceAtPurchase).toBeDefined();
      expect(response.body.renewal.planName).toBe('Renewal 3 Months');
    });

    // ========================================
    // Payment Creation
    // ========================================
    it('T-REN-004: should create payment when createPayment=true', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          createPayment: true,
          paymentMethod: 'CASH',
          paymentAmount: 150,
          note: 'Renewal payment',
        })
        .expect(200);

      // Payment should be included in response
      expect(response.body.payment).toBeDefined();
      expect(response.body.payment.amount).toBe('150');
      expect(response.body.payment.paymentMethod).toBe('CASH');

      // Verify payment exists in database
      const payments = await prisma.payment.findMany({
        where: { memberId: member.id, tenantId: tenant1.id },
      });
      expect(payments).toHaveLength(1);
      expect(payments[0].amount.toNumber()).toBe(150);
    });

    it('T-REN-005: should use plan price as default payment amount', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          createPayment: true,
          paymentMethod: 'CREDIT_CARD',
        })
        .expect(200);

      // Payment amount should default to plan price (100)
      expect(response.body.payment).toBeDefined();
      expect(response.body.payment.amount).toBe('100');
    });

    // ========================================
    // Invalid Plan (Archived)
    // ========================================
    it('T-REN-006: should reject renewal with archived plan', async () => {
      const now = new Date();
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: planArchived.id,
        })
        .expect(400);
    });

    // ========================================
    // Archived Member
    // ========================================
    it('T-REN-007: should reject renewal for archived member', async () => {
      const now = new Date();
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ARCHIVED',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(400);

      expect(response.body.message).toContain('Arşivlenmiş');
    });

    // ========================================
    // Paused Member
    // ========================================
    it('T-REN-008: should reject renewal for paused member', async () => {
      const now = new Date();
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'PAUSED',
        pausedAt: now,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(400);

      expect(response.body.message).toContain('Dondurulmuş');
    });

    // ========================================
    // Payment Validation Fail → Transaction Rollback
    // ========================================
    it('T-REN-009: should reject when createPayment=true but paymentMethod missing', async () => {
      const now = new Date();
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          createPayment: true,
          // paymentMethod intentionally missing
        })
        .expect(400);

      // Verify member was NOT updated (transaction should have not committed)
      const unchanged = await prisma.member.findFirst({
        where: { id: member.id, tenantId: tenant1.id },
      });
      expect(unchanged!.membershipEndDate.toISOString()).toBe(
        member.membershipEndDate.toISOString(),
      );
    });

    // ========================================
    // Non-existent Member (404)
    // ========================================
    it('T-REN-010: should return 404 for non-existent member', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/members/non-existent-id/renew-membership')
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(404);
    });

    // ========================================
    // History Record
    // ========================================
    it('T-REN-011: should create history record with RENEWAL changeType', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      const history = await prisma.memberPlanChangeHistory.findFirst({
        where: {
          memberId: member.id,
          tenantId: tenant1.id,
          changeType: 'RENEWAL',
        },
      });

      expect(history).toBeDefined();
      expect(history!.oldPlanId).toBe(plan1Month.id);
      expect(history!.newPlanId).toBe(plan1Month.id);
      expect(history!.appliedAt).toBeDefined();
      expect(history!.changedByUserId).toBe(user1.id);
    });

    // ========================================
    // Branch-scoped Plan Mismatch
    // ========================================
    it('T-REN-012: should reject branch-scoped plan for wrong branch', async () => {
      const now = new Date();
      // Member is in branch1, plan is scoped to branch2
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          membershipPlanId: planBranchScoped.id,
        })
        .expect(400);
    });

    // ========================================
    // INACTIVE member with future end date (edge case)
    // ========================================
    it('T-REN-013: should handle INACTIVE member with future end date as early renewal', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const futureEnd = addMonths(now, 1);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: futureEnd,
        status: 'INACTIVE',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      // Should extend from current end date (early renewal)
      const expectedEnd = addMonths(futureEnd, 1);
      const respEnd = new Date(response.body.membershipEndDate);
      respEnd.setHours(0, 0, 0, 0);
      expect(respEnd.toISOString()).toBe(expectedEnd.toISOString());

      // Status should be set to ACTIVE
      expect(response.body.status).toBe('ACTIVE');
    });

    // ========================================
    // Clears pending plan change
    // ========================================
    it('T-REN-014: should clear pending plan change on renewal', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const futureEnd = addMonths(now, 1);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: futureEnd,
        status: 'ACTIVE',
      });

      // First schedule a plan change
      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ membershipPlanId: plan3Months.id })
        .expect(200);

      // Verify pending exists
      const memberWithPending = await prisma.member.findFirst({
        where: { id: member.id },
      });
      expect(memberWithPending!.pendingMembershipPlanId).toBe(plan3Months.id);

      // Now renew - should clear pending
      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      expect(response.body.pendingMembershipPlanId).toBeNull();
      expect(response.body.pendingMembershipStartDate).toBeNull();
      expect(response.body.pendingMembershipEndDate).toBeNull();
    });

    // ========================================
    // Double Renewal Same Day
    // ========================================
    it('T-REN-015: should handle consecutive renewals correctly', async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const futureEnd = addMonths(now, 1);

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: futureEnd,
        status: 'ACTIVE',
      });

      // First renewal
      const response1 = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      const endAfterFirst = new Date(response1.body.membershipEndDate);
      endAfterFirst.setHours(0, 0, 0, 0);

      // Second renewal - should extend from the result of first renewal
      const response2 = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      const endAfterSecond = new Date(response2.body.membershipEndDate);
      endAfterSecond.setHours(0, 0, 0, 0);

      // After 2 renewals of 1 month each, end should be original + 2 months further
      const expectedEnd = addMonths(futureEnd, 2);
      expect(endAfterSecond.toISOString()).toBe(expectedEnd.toISOString());

      // Should have 2 history records
      const historyCount = await prisma.memberPlanChangeHistory.count({
        where: {
          memberId: member.id,
          changeType: 'RENEWAL',
        },
      });
      expect(historyCount).toBe(2);
    });

    // ========================================
    // No plan on member and no plan in request
    // ========================================
    it('T-REN-016: should reject renewal when no plan available', async () => {
      // Create member without a plan by setting planId to null directly
      const now = new Date();
      const member = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'No',
          lastName: 'Plan',
          phone: `+9${Date.now()}`,
          membershipStartDate: now,
          membershipEndDate: addMonths(now, 1),
          membershipPriceAtPurchase: 0,
          status: 'ACTIVE',
          // membershipPlanId intentionally null
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(400);

      expect(response.body.message).toContain('plan');
    });

    // ========================================
    // Payment with future date rejection
    // ========================================
    it('T-REN-017: should reject payment with future paidOn date', async () => {
      const now = new Date();
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan1Month.id,
        membershipStartDate: now,
        membershipEndDate: addMonths(now, 1),
        status: 'ACTIVE',
      });

      const futureDate = addDays(new Date(), 5);

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          createPayment: true,
          paymentMethod: 'CASH',
          paidOn: futureDate.toISOString(),
        })
        .expect(400);
    });

    // ========================================
    // Derived fields correctness
    // ========================================
    it('T-REN-018: should return correct derived fields after renewal', async () => {
      const pastStart = new Date('2025-01-01');
      const pastEnd = new Date('2025-06-01');

      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        membershipPlanId: plan3Months.id,
        membershipStartDate: pastStart,
        membershipEndDate: pastEnd,
        status: 'INACTIVE',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/renew-membership`)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      expect(response.body.isMembershipActive).toBe(true);
      expect(response.body.membershipState).toBe('ACTIVE');
      expect(response.body.daysRemaining).toBeGreaterThan(0);
      expect(typeof response.body.remainingDays).toBe('number');
      expect(response.body.isExpiringSoon).toBeDefined();
    });
  });
});
