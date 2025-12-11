/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
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

describe('MembershipPlans E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant1: any;
  let user1: any;
  let branch1: any;
  let token1: string;
  let tenant2: any;
  let user2: any;
  let branch2: any;
  let token2: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply global validation pipe (same as main.ts)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create test tenants and users
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

    const setup2 = await createTestTenantAndUser(prisma, {
      tenantName: 'Gym 2',
      userEmail: 'tenant2@test.com',
    });
    tenant2 = setup2.tenant;
    user2 = setup2.user;
    branch2 = await createTestBranch(prisma, tenant2.id, {
      name: 'Branch 2',
      isDefault: true,
    });
    token2 = createMockToken({
      userId: user2.id,
      tenantId: tenant2.id,
      email: user2.email,
    });
  });

  afterAll(async () => {
    // Clean up membership plans and members
    await prisma.member.deleteMany({
      where: { tenantId: { in: [tenant1.id, tenant2.id] } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: { in: [tenant1.id, tenant2.id] } },
    });
    await cleanupTestData(prisma, [tenant1.id, tenant2.id]);
    await app.close();
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.member.deleteMany({
      where: { tenantId: { in: [tenant1.id, tenant2.id] } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: { in: [tenant1.id, tenant2.id] } },
    });
  });

  // =====================================================================
  // T124: GET /api/v1/membership-plans - List plans
  // =====================================================================

  describe('T124 - GET /api/v1/membership-plans', () => {
    it('should return only tenant-specific plans with tenant isolation', async () => {
      // Create plans for tenant1
      const plan1 = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Basic Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      const plan2 = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Premium Plan',
          durationType: DurationType.MONTHS,
          durationValue: 6,
          price: 500,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Create plan for tenant2
      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant2.id,
          name: 'Tenant2 Plan',
          durationType: DurationType.MONTHS,
          durationValue: 3,
          price: 300,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Tenant1 should only see their plans
      const response = await request(app.getHttpServer())
        .get('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(2);
      expect(
        response.body.data.every((plan: any) => plan.tenantId === tenant1.id),
      ).toBe(true);

      const planNames = response.body.data.map((p: any) => p.name);
      expect(planNames).toContain('Basic Plan');
      expect(planNames).toContain('Premium Plan');
      expect(planNames).not.toContain('Tenant2 Plan');
    });

    it('should support pagination', async () => {
      // Create multiple plans
      for (let i = 1; i <= 5; i++) {
        await prisma.membershipPlan.create({
          data: {
            tenantId: tenant1.id,
            name: `Plan ${i}`,
            durationType: DurationType.MONTHS,
            durationValue: i,
            price: i * 100,
            currency: 'USD',
            status: PlanStatus.ACTIVE,
          },
        });
      }

      // Request first page with limit 2
      const response = await request(app.getHttpServer())
        .get('/api/v1/membership-plans?page=1&limit=2')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 5);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 2);
      expect(response.body).toHaveProperty('totalPages', 3);
    });

    it('should filter by status', async () => {
      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Active Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Archived Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ARCHIVED,
        },
      });

      // Filter for ACTIVE plans only
      const response = await request(app.getHttpServer())
        .get('/api/v1/membership-plans?status=ACTIVE')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Active Plan');
      expect(response.body.data[0].status).toBe('ACTIVE');
    });

    it('should support search by name', async () => {
      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Monthly Yoga',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Annual Fitness',
          durationType: DurationType.MONTHS,
          durationValue: 12,
          price: 1000,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Search for "yoga"
      const response = await request(app.getHttpServer())
        .get('/api/v1/membership-plans?search=yoga')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Monthly Yoga');
    });
  });

  // =====================================================================
  // T125: GET /api/v1/membership-plans/active - Active plans only
  // =====================================================================

  describe('T125 - GET /api/v1/membership-plans/active', () => {
    it('should return only ACTIVE plans', async () => {
      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Active Plan 1',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Active Plan 2',
          durationType: DurationType.DAYS,
          durationValue: 30,
          price: 80,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Archived Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ARCHIVED,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/membership-plans/active')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(
        response.body.every((plan: any) => plan.status === 'ACTIVE'),
      ).toBe(true);

      const planNames = response.body.map((p: any) => p.name);
      expect(planNames).toContain('Active Plan 1');
      expect(planNames).toContain('Active Plan 2');
      expect(planNames).not.toContain('Archived Plan');
    });

    it('should respect tenant isolation for active plans', async () => {
      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Tenant1 Active',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant2.id,
          name: 'Tenant2 Active',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/membership-plans/active')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Tenant1 Active');
      expect(response.body[0].tenantId).toBe(tenant1.id);
    });
  });

  // =====================================================================
  // T126: GET /api/v1/membership-plans/:id - Get single plan
  // =====================================================================

  describe('T126 - GET /api/v1/membership-plans/:id', () => {
    it('should return plan when it belongs to tenant', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Test Plan',
          durationType: DurationType.MONTHS,
          durationValue: 3,
          price: 300,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', plan.id);
      expect(response.body).toHaveProperty('name', 'Test Plan');
      expect(response.body).toHaveProperty('tenantId', tenant1.id);
    });

    it('should return 404 for non-existent plan', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/api/v1/membership-plans/${fakeId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);
    });

    it('should return 404/403 for cross-tenant access', async () => {
      // Create plan for tenant1
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Tenant1 Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Try to access with tenant2's token
      const response = await request(app.getHttpServer())
        .get(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect((res) => {
          // Accept either 404 or 403
          expect([404, 403]).toContain(res.status);
        });
    });
  });

  // =====================================================================
  // T127: POST /api/v1/membership-plans - Create plan
  // =====================================================================

  describe('T127 - POST /api/v1/membership-plans', () => {
    it('should create plan with valid payload', async () => {
      const createDto = {
        name: 'New Plan',
        description: 'Test description',
        durationType: DurationType.MONTHS,
        durationValue: 6,
        price: 500,
        currency: 'USD',
        maxFreezeDays: 15,
        autoRenew: true,
        sortOrder: 1,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'New Plan');
      expect(response.body).toHaveProperty('description', 'Test description');
      expect(response.body).toHaveProperty('durationType', 'MONTHS');
      expect(response.body).toHaveProperty('durationValue', 6);
      expect(response.body).toHaveProperty('price', 500);
      expect(response.body).toHaveProperty('currency', 'USD');
      expect(response.body).toHaveProperty('status', 'ACTIVE');
      expect(response.body).toHaveProperty('tenantId', tenant1.id);
    });

    it('should reject invalid duration value for DAYS', async () => {
      const createDto = {
        name: 'Invalid Days Plan',
        durationType: DurationType.DAYS,
        durationValue: 1000, // > 730
        price: 100,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(400);

      expect(response.body.message).toContain('730');
    });

    it('should reject invalid duration value for MONTHS', async () => {
      const createDto = {
        name: 'Invalid Months Plan',
        durationType: DurationType.MONTHS,
        durationValue: 30, // > 24
        price: 100,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(400);

      expect(response.body.message).toContain('24');
    });

    it('should reject invalid currency format', async () => {
      const createDto = {
        name: 'Invalid Currency Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'INVALID',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(400);

      expect(response.body.message).toContain('currency');
    });

    it('should reject negative price', async () => {
      const createDto = {
        name: 'Negative Price Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: -100,
        currency: 'USD',
      };

      await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(400);
    });

    it('should accept zero price (promotional plan)', async () => {
      const createDto = {
        name: 'Free Trial',
        durationType: DurationType.DAYS,
        durationValue: 7,
        price: 0,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('price', 0);
    });
  });

  // =====================================================================
  // T128: Duplicate plan name validation
  // =====================================================================

  describe('T128 - Duplicate plan name validation', () => {
    it('should reject duplicate plan name (case-insensitive)', async () => {
      // Create first plan
      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Basic Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Try to create duplicate
      const createDto = {
        name: 'basic plan', // Different case
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect((res) => {
          // Accept either 400 or 409
          expect([400, 409]).toContain(res.status);
        });

      expect(response.body.message).toBeDefined();
    });

    it('should allow same name in different tenants', async () => {
      // Create plan for tenant1
      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Standard Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Create plan with same name for tenant2 - should succeed
      const createDto = {
        name: 'Standard Plan',
        durationType: DurationType.MONTHS,
        durationValue: 1,
        price: 100,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/membership-plans')
        .set('Authorization', `Bearer ${token2}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('name', 'Standard Plan');
      expect(response.body).toHaveProperty('tenantId', tenant2.id);
    });
  });

  // =====================================================================
  // T129: PATCH /api/v1/membership-plans/:id - Update plan
  // =====================================================================

  describe('T129 - PATCH /api/v1/membership-plans/:id', () => {
    it('should update plan correctly', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Original Name',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      const updateDto = {
        name: 'Updated Name',
        price: 150,
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Updated Name');
      expect(response.body).toHaveProperty('price', 150);
    });

    it('should not affect existing members when updating plan', async () => {
      // Create plan
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Test Plan',
          durationType: DurationType.MONTHS,
          durationValue: 3,
          price: 300,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Create member with the plan
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-04-01');
      const member = await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+905551234567',
          membershipPlanId: plan.id,
          membershipStartAt: startDate,
          membershipEndAt: endDate,
          membershipPriceAtPurchase: 300,
          status: MemberStatus.ACTIVE,
        },
      });

      // Update plan duration and price
      await request(app.getHttpServer())
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          durationValue: 6,
          price: 500,
        })
        .expect(200);

      // Verify member's dates and price are unchanged
      const updatedMember = await prisma.member.findUnique({
        where: { id: member.id },
      });

      expect(updatedMember?.membershipStartAt).toEqual(startDate);
      expect(updatedMember?.membershipEndAt).toEqual(endDate);
      expect(updatedMember?.membershipPriceAtPurchase).toBe(300);
    });

    it('should reject update to duplicate name', async () => {
      // Create two plans
      const plan1 = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Plan One',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Plan Two',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Try to update plan1 to have same name as plan2
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/membership-plans/${plan1.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ name: 'Plan Two' })
        .expect((res) => {
          expect([400, 409]).toContain(res.status);
        });
    });
  });

  // =====================================================================
  // T130: POST /api/v1/membership-plans/:id/archive - Archive plan
  // =====================================================================

  describe('T130 - POST /api/v1/membership-plans/:id/archive', () => {
    it('should archive plan and return active member count', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'To Archive',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Create active members with valid memberships
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 30);

      await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Active',
          lastName: 'Member1',
          phone: '+905551234561',
          membershipPlanId: plan.id,
          membershipStartAt: today,
          membershipEndAt: futureDate,
          membershipPriceAtPurchase: 100,
          status: MemberStatus.ACTIVE,
        },
      });

      await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Active',
          lastName: 'Member2',
          phone: '+905551234562',
          membershipPlanId: plan.id,
          membershipStartAt: today,
          membershipEndAt: futureDate,
          membershipPriceAtPurchase: 100,
          status: MemberStatus.ACTIVE,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ARCHIVED');
      expect(response.body).toHaveProperty('activeMemberCount', 2);

      // Verify plan is archived in database
      const archivedPlan = await prisma.membershipPlan.findUnique({
        where: { id: plan.id },
      });
      expect(archivedPlan?.status).toBe(PlanStatus.ARCHIVED);
    });

    it('should archive plan with zero active members without warning', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'No Members Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ARCHIVED');
      expect(response.body.activeMemberCount).toBeUndefined();
    });

    it('should not count PAUSED members as active', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Paused Members Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 30);

      // Create PAUSED member
      await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Paused',
          lastName: 'Member',
          phone: '+905551234563',
          membershipPlanId: plan.id,
          membershipStartAt: today,
          membershipEndAt: futureDate,
          membershipPriceAtPurchase: 100,
          status: MemberStatus.PAUSED,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ARCHIVED');
      expect(response.body.activeMemberCount).toBeUndefined();
    });

    it('should not count members with expired memberships', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Expired Members Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);

      // Create member with expired membership
      await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Expired',
          lastName: 'Member',
          phone: '+905551234564',
          membershipPlanId: plan.id,
          membershipStartAt: pastDate,
          membershipEndAt: pastDate, // Already expired
          membershipPriceAtPurchase: 100,
          status: MemberStatus.ACTIVE,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ARCHIVED');
      expect(response.body.activeMemberCount).toBeUndefined();
    });
  });

  // =====================================================================
  // T131: POST /api/v1/membership-plans/:id/restore - Restore plan
  // =====================================================================

  describe('T131 - POST /api/v1/membership-plans/:id/restore', () => {
    it('should restore archived plan to ACTIVE', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Archived Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ARCHIVED,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/membership-plans/${plan.id}/restore`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ACTIVE');

      // Verify in database
      const restoredPlan = await prisma.membershipPlan.findUnique({
        where: { id: plan.id },
      });
      expect(restoredPlan?.status).toBe(PlanStatus.ACTIVE);
    });
  });

  // =====================================================================
  // T132: DELETE /api/v1/membership-plans/:id - Delete plan
  // =====================================================================

  describe('T132 - DELETE /api/v1/membership-plans/:id', () => {
    it('should delete plan without members successfully', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Plan to Delete',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);

      // Verify plan is deleted
      const deletedPlan = await prisma.membershipPlan.findUnique({
        where: { id: plan.id },
      });
      expect(deletedPlan).toBeNull();
    });

    it('should reject deletion of plan with members', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Plan with Members',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Create member with the plan
      await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Member',
          lastName: 'Test',
          phone: '+905551234565',
          membershipPlanId: plan.id,
          membershipStartAt: new Date(),
          membershipEndAt: new Date(),
          membershipPriceAtPurchase: 100,
          status: MemberStatus.ACTIVE,
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(400);

      expect(response.body.message).toMatch(/member/i);

      // Verify plan still exists
      const existingPlan = await prisma.membershipPlan.findUnique({
        where: { id: plan.id },
      });
      expect(existingPlan).not.toBeNull();
    });

    it('should allow deletion of plan with only archived members', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Plan with Archived Members',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Create archived member
      await prisma.member.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          firstName: 'Archived',
          lastName: 'Member',
          phone: '+905551234566',
          membershipPlanId: plan.id,
          membershipStartAt: new Date(),
          membershipEndAt: new Date(),
          membershipPriceAtPurchase: 100,
          status: MemberStatus.ARCHIVED,
        },
      });

      // Should succeed since archived members don't count
      await request(app.getHttpServer())
        .delete(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);
    });
  });

  // =====================================================================
  // T133: Tenant isolation
  // =====================================================================

  describe('T133 - Tenant isolation', () => {
    it('should block cross-tenant access to plan details', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Tenant1 Private Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Try to access with tenant2's token
      await request(app.getHttpServer())
        .get(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect((res) => {
          expect([403, 404]).toContain(res.status);
        });
    });

    it('should block cross-tenant plan updates', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Tenant1 Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Try to update with tenant2's token
      await request(app.getHttpServer())
        .patch(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ name: 'Hacked Name' })
        .expect((res) => {
          expect([403, 404]).toContain(res.status);
        });

      // Verify name unchanged
      const unchangedPlan = await prisma.membershipPlan.findUnique({
        where: { id: plan.id },
      });
      expect(unchangedPlan?.name).toBe('Tenant1 Plan');
    });

    it('should block cross-tenant plan deletion', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Tenant1 Protected Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Try to delete with tenant2's token
      await request(app.getHttpServer())
        .delete(`/api/v1/membership-plans/${plan.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect((res) => {
          expect([403, 404]).toContain(res.status);
        });

      // Verify plan still exists
      const existingPlan = await prisma.membershipPlan.findUnique({
        where: { id: plan.id },
      });
      expect(existingPlan).not.toBeNull();
    });

    it('should block cross-tenant plan archival', async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: 'Tenant1 Active Plan',
          durationType: DurationType.MONTHS,
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: PlanStatus.ACTIVE,
        },
      });

      // Try to archive with tenant2's token
      await request(app.getHttpServer())
        .post(`/api/v1/membership-plans/${plan.id}/archive`)
        .set('Authorization', `Bearer ${token2}`)
        .expect((res) => {
          expect([403, 404]).toContain(res.status);
        });

      // Verify status unchanged
      const unchangedPlan = await prisma.membershipPlan.findUnique({
        where: { id: plan.id },
      });
      expect(unchangedPlan?.status).toBe(PlanStatus.ACTIVE);
    });
  });
});
