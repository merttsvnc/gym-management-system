/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

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

/**
 * E2E Tests for Derived Membership Status
 *
 * Tests the single source of truth for membership activity:
 * - Active = membershipEndDate >= today
 * - Expired = membershipEndDate < today OR null
 * - Expiring Soon = Active AND membershipEndDate <= today + 7 days
 *
 * Verifies:
 * 1. Dashboard KPIs use derived status (not persisted status field)
 * 2. Member endpoints return computed fields
 * 3. Frontend receives consistent status information
 */
describe('Derived Membership Status E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: any;
  let user: any;
  let branch: any;
  let token: string;
  let plan: any;

  // Test members with different scenarios
  let memberExpired: any; // membershipEndDate in past
  let memberActiveExpiringSoon: any; // membershipEndDate within 7 days
  let memberActiveNormal: any; // membershipEndDate > 7 days
  let memberWithStatusActiveButExpired: any; // status=ACTIVE but membershipEndDate expired
  let memberWithStatusInactiveButActive: any; // status=INACTIVE but membershipEndDate valid

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
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create test tenant and user
    const setup = await createTestTenantAndUser(prisma, {
      tenantName: 'Test Gym - Derived Status',
      userEmail: `derived-status-${Date.now()}@test.com`,
    });
    tenant = setup.tenant;
    user = setup.user;
    branch = await createTestBranch(prisma, tenant.id, {
      name: 'Main Branch',
      isDefault: true,
    });
    token = createMockToken({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
    });

    // Create membership plan
    plan = await prisma.membershipPlan.create({
      data: {
        tenantId: tenant.id,
        scope: 'TENANT',
        scopeKey: 'TENANT',
        name: 'Monthly Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'TRY',
        status: PlanStatus.ACTIVE,
      },
    });

    // Setup dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const inFiveDays = new Date(today);
    inFiveDays.setDate(inFiveDays.getDate() + 5);

    const inFifteenDays = new Date(today);
    inFifteenDays.setDate(inFifteenDays.getDate() + 15);

    // 1. Expired member (membershipEndDate in past)
    memberExpired = await prisma.member.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Expired',
        lastName: 'Member',
        phone: '555-EXPIRED',
        membershipPlanId: plan.id,
        membershipStartDate: fiveDaysAgo,
        membershipEndDate: yesterday,
        status: MemberStatus.INACTIVE,
      },
    });

    // 2. Active member expiring soon (within 7 days)
    memberActiveExpiringSoon = await prisma.member.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Expiring',
        lastName: 'Soon',
        phone: '555-EXPIRING',
        membershipPlanId: plan.id,
        membershipStartDate: today,
        membershipEndDate: inFiveDays,
        status: MemberStatus.ACTIVE,
      },
    });

    // 3. Active member with plenty of time (> 7 days)
    memberActiveNormal = await prisma.member.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Active',
        lastName: 'Normal',
        phone: '555-ACTIVE',
        membershipPlanId: plan.id,
        membershipStartDate: today,
        membershipEndDate: inFifteenDays,
        status: MemberStatus.ACTIVE,
      },
    });

    // 4. Inconsistent: status=ACTIVE but membershipEndDate expired (the bug scenario)
    memberWithStatusActiveButExpired = await prisma.member.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Inconsistent',
        lastName: 'ActiveExpired',
        phone: '555-INCONSISTENT1',
        membershipPlanId: plan.id,
        membershipStartDate: fiveDaysAgo,
        membershipEndDate: yesterday,
        status: MemberStatus.ACTIVE, // Status says active
      },
    });

    // 5. Inconsistent: status=INACTIVE but membershipEndDate is valid
    memberWithStatusInactiveButActive = await prisma.member.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Inconsistent',
        lastName: 'InactiveValid',
        phone: '555-INCONSISTENT2',
        membershipPlanId: plan.id,
        membershipStartDate: today,
        membershipEndDate: inFifteenDays,
        status: MemberStatus.INACTIVE, // Status says inactive
      },
    });
  });

  afterAll(async () => {
    await prisma.member.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: tenant.id },
    });
    await cleanupTestData(prisma, [tenant.id]);
    await app.close();
  });

  describe('Dashboard Summary - Derived Status', () => {
    it('should calculate active members based on membershipEndDate only', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Expected active members:
      // - memberActiveExpiringSoon (endDate in 5 days)
      // - memberActiveNormal (endDate in 15 days)
      // - memberWithStatusInactiveButActive (endDate in 15 days, despite status=INACTIVE)
      //
      // NOT active:
      // - memberExpired (endDate yesterday)
      // - memberWithStatusActiveButExpired (endDate yesterday, despite status=ACTIVE)

      expect(response.body.activeMembers).toBe(3);
      expect(response.body.inactiveMembers).toBe(2); // total - active = 5 - 3 = 2
      expect(response.body.totalMembers).toBe(5);
    });

    it('should calculate expiring soon members correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Expected expiring soon:
      // - memberActiveExpiringSoon (endDate in 5 days)
      // NOT expiring soon:
      // - memberActiveNormal (endDate in 15 days - too far)
      // - memberWithStatusInactiveButActive (endDate in 15 days - too far)
      // - memberExpired (expired)
      // - memberWithStatusActiveButExpired (expired)

      expect(response.body.expiringSoon).toBe(1);
    });
  });

  describe('Member Endpoints - Computed Fields', () => {
    it('should return computed fields for expired member', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberExpired.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('isMembershipActive', false);
      expect(response.body).toHaveProperty('membershipState', 'EXPIRED');
      expect(response.body).toHaveProperty('daysRemaining', 0);
      expect(response.body).toHaveProperty('isExpiringSoon', false);
    });

    it('should return computed fields for expiring soon member', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberActiveExpiringSoon.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('isMembershipActive', true);
      expect(response.body).toHaveProperty('membershipState', 'ACTIVE');
      expect(response.body.daysRemaining).toBeGreaterThanOrEqual(0);
      expect(response.body.daysRemaining).toBeLessThanOrEqual(7);
      expect(response.body).toHaveProperty('isExpiringSoon', true);
    });

    it('should return computed fields for active member', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberActiveNormal.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('isMembershipActive', true);
      expect(response.body).toHaveProperty('membershipState', 'ACTIVE');
      expect(response.body.daysRemaining).toBeGreaterThan(7);
      expect(response.body).toHaveProperty('isExpiringSoon', false);
    });

    it('should show EXPIRED for member with status=ACTIVE but expired date (bug scenario)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberWithStatusActiveButExpired.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // This is the bug fix: membershipState should be EXPIRED despite status=ACTIVE
      expect(response.body).toHaveProperty('isMembershipActive', false);
      expect(response.body).toHaveProperty('membershipState', 'EXPIRED');
      expect(response.body).toHaveProperty('daysRemaining', 0);
      expect(response.body).toHaveProperty('isExpiringSoon', false);

      // Persisted status field is still ACTIVE (kept for other purposes)
      expect(response.body.status).toBe('ACTIVE');
    });

    it('should show ACTIVE for member with status=INACTIVE but valid date', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberWithStatusInactiveButActive.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // membershipState should be ACTIVE despite status=INACTIVE
      expect(response.body).toHaveProperty('isMembershipActive', true);
      expect(response.body).toHaveProperty('membershipState', 'ACTIVE');
      expect(response.body.daysRemaining).toBeGreaterThan(7);
      expect(response.body).toHaveProperty('isExpiringSoon', false);

      // Persisted status field is still INACTIVE
      expect(response.body.status).toBe('INACTIVE');
    });
  });

  describe('Member List - Computed Fields', () => {
    it('should include computed fields in member list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check first member has computed fields
      const member = response.body.data[0];
      expect(member).toHaveProperty('isMembershipActive');
      expect(member).toHaveProperty('membershipState');
      expect(member).toHaveProperty('daysRemaining');
      expect(member).toHaveProperty('isExpiringSoon');
      expect(typeof member.isMembershipActive).toBe('boolean');
      expect(['ACTIVE', 'EXPIRED']).toContain(member.membershipState);
    });
  });

  describe('Membership Distribution - Derived Status', () => {
    it('should only count active members based on membershipEndDate', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/membership-distribution')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // All members use the same plan, so should have one entry
      const distribution = response.body[0];
      expect(distribution.planId).toBe(plan.id);

      // Should count 3 active members (based on endDate):
      // - memberActiveExpiringSoon
      // - memberActiveNormal
      // - memberWithStatusInactiveButActive
      expect(distribution.activeMemberCount).toBe(3);
    });
  });
});
