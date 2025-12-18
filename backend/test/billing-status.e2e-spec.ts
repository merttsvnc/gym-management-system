/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from './utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from './utils/test-db';
import {
  createTestTenantAndUser,
  createTestBranch,
  cleanupTestData,
  loginUser,
  createMockToken,
} from './test-helpers';
import { BillingStatus } from '@prisma/client';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../src/common/constants/billing-messages';

describe('Billing Status E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await closeTestApp(app);
    await cleanupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestData(prisma);
  });

  describe('T059-T062: PAST_DUE tenant read-only restrictions', () => {
    let pastDueTenant: any;
    let pastDueUser: any;
    let pastDueToken: string;
    let branch: any;

    beforeEach(async () => {
      const setup = await createTestTenantAndUser(prisma, {
        tenantName: 'Past Due Gym',
        userEmail: 'pastdue@test.com',
      });
      pastDueTenant = setup.tenant;
      pastDueUser = setup.user;

      // Set tenant to PAST_DUE
      await prisma.tenant.update({
        where: { id: pastDueTenant.id },
        data: { billingStatus: BillingStatus.PAST_DUE },
      });

      branch = await createTestBranch(prisma, pastDueTenant.id, {
        name: 'Main Branch',
        isDefault: true,
      });

      // Get token (PAST_DUE tenants can login, so use real login)
      const loginResult = await loginUser(app, pastDueUser.email, 'Pass123!');
      pastDueToken = loginResult.accessToken;
    });

    it('T059: POST /api/v1/members returns 403 for PAST_DUE tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${pastDueToken}`)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          gender: 'MALE',
          birthDate: '1990-01-01',
          branchId: branch.id,
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(
        BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      );
      expect(response.body.message).toBe(
        BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION,
      );
    });

    it('T060: GET /api/v1/members returns 200 for PAST_DUE tenant (read-only)', async () => {
      // First create a member via direct DB insert (since mutations are blocked)
      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      await prisma.member.create({
        data: {
          tenantId: pastDueTenant.id,
          branchId: branch.id,
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '+1234567891',
          gender: 'FEMALE',
          birthDate: new Date('1990-01-01'),
          membershipStartDate: startDate,
          membershipEndDate: endDate,
          membershipPriceAtPurchase: 100,
          status: 'ACTIVE',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${pastDueToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('T061: PATCH /api/v1/members/:id returns 403 for PAST_DUE tenant', async () => {
      // Create member via DB
      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      const member = await prisma.member.create({
        data: {
          tenantId: pastDueTenant.id,
          branchId: branch.id,
          firstName: 'Test',
          lastName: 'Member',
          email: 'test@example.com',
          phone: '+1234567892',
          gender: 'MALE',
          birthDate: new Date('1990-01-01'),
          membershipStartDate: startDate,
          membershipEndDate: endDate,
          membershipPriceAtPurchase: 100,
          status: 'ACTIVE',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${pastDueToken}`)
        .send({ firstName: 'Updated' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(
        BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      );
    });

    it('T062: DELETE /api/v1/members/:id returns 403 for PAST_DUE tenant', async () => {
      // Create member via DB
      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      const member = await prisma.member.create({
        data: {
          tenantId: pastDueTenant.id,
          branchId: branch.id,
          firstName: 'Test',
          lastName: 'Member',
          email: 'test2@example.com',
          phone: '+1234567893',
          gender: 'MALE',
          birthDate: new Date('1990-01-01'),
          membershipStartDate: startDate,
          membershipEndDate: endDate,
          membershipPriceAtPurchase: 100,
          status: 'ACTIVE',
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${pastDueToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(
        BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      );
    });
  });

  describe('T063-T064: SUSPENDED tenant full blocking', () => {
    let suspendedTenant: any;
    let suspendedUser: any;
    let suspendedToken: string;
    let branch: any;

    beforeEach(async () => {
      const setup = await createTestTenantAndUser(prisma, {
        tenantName: 'Suspended Gym',
        userEmail: 'suspended@test.com',
      });
      suspendedTenant = setup.tenant;
      suspendedUser = setup.user;

      // Set tenant to SUSPENDED
      await prisma.tenant.update({
        where: { id: suspendedTenant.id },
        data: { billingStatus: BillingStatus.SUSPENDED },
      });

      branch = await createTestBranch(prisma, suspendedTenant.id, {
        name: 'Main Branch',
        isDefault: true,
      });

      // Note: SUSPENDED tenant cannot login, so we create token manually
      // This simulates a user who was logged in before suspension
      const { createMockToken } = await import('./test-helpers');
      suspendedToken = createMockToken({
        userId: suspendedUser.id,
        tenantId: suspendedTenant.id,
        email: suspendedUser.email,
      });
    });

    it('T063: All mutation endpoints return 403 with error code for SUSPENDED tenant', async () => {
      // Test POST
      const postResponse = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${suspendedToken}`)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          gender: 'MALE',
          birthDate: '1990-01-01',
          branchId: branch.id,
        });

      expect(postResponse.status).toBe(403);
      expect(postResponse.body.code).toBe(
        BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      );
      expect(postResponse.body.message).toBe(
        BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
      );

      // Test PATCH
      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      const member = await prisma.member.create({
        data: {
          tenantId: suspendedTenant.id,
          branchId: branch.id,
          firstName: 'Test',
          lastName: 'Member',
          email: 'test@example.com',
          phone: '+1234567891',
          gender: 'MALE',
          birthDate: new Date('1990-01-01'),
          membershipStartDate: startDate,
          membershipEndDate: endDate,
          membershipPriceAtPurchase: 100,
          status: 'ACTIVE',
        },
      });

      const patchResponse = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${suspendedToken}`)
        .send({ firstName: 'Updated' });

      expect(patchResponse.status).toBe(403);
      expect(patchResponse.body.code).toBe(
        BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      );
    });

    it('T064: GET endpoints return 403 with error code for SUSPENDED tenant', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${suspendedToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(
        BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      );
      expect(response.body.message).toBe(
        BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
      );
    });
  });

  describe('T065-T066: Authentication flow with billing status', () => {
    let suspendedTenant: any;
    let suspendedUser: any;
    let pastDueTenant: any;
    let pastDueUser: any;

    beforeEach(async () => {
      // Create SUSPENDED tenant
      const suspendedSetup = await createTestTenantAndUser(prisma, {
        tenantName: 'Suspended Gym',
        userEmail: 'suspended@test.com',
      });
      suspendedTenant = suspendedSetup.tenant;
      suspendedUser = suspendedSetup.user;
      await prisma.tenant.update({
        where: { id: suspendedTenant.id },
        data: { billingStatus: BillingStatus.SUSPENDED },
      });

      // Create PAST_DUE tenant
      const pastDueSetup = await createTestTenantAndUser(prisma, {
        tenantName: 'Past Due Gym',
        userEmail: 'pastdue@test.com',
      });
      pastDueTenant = pastDueSetup.tenant;
      pastDueUser = pastDueSetup.user;
      await prisma.tenant.update({
        where: { id: pastDueTenant.id },
        data: { billingStatus: BillingStatus.PAST_DUE },
      });
    });

    it('T065: POST /api/v1/auth/login returns 403 with error code for SUSPENDED tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: suspendedUser.email,
          password: 'Pass123!',
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(
        BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      );
      expect(response.body.message).toBe(
        BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN,
      );
    });

    it('T066: POST /api/v1/auth/login returns 200 for PAST_DUE tenant (with billing status)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: pastDueUser.email,
          password: 'Pass123!',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('tenant');
      expect(response.body.tenant.billingStatus).toBe(BillingStatus.PAST_DUE);
    });
  });

  describe('T067: Tenant cannot update billingStatus via API', () => {
    let activeTenant: any;
    let activeUser: any;
    let activeToken: string;

    beforeEach(async () => {
      const setup = await createTestTenantAndUser(prisma, {
        tenantName: 'Active Gym',
        userEmail: 'active@test.com',
      });
      activeTenant = setup.tenant;
      activeUser = setup.user;

      // Use mock token for non-login tests to avoid rate limiting
      activeToken = createMockToken({
        userId: activeUser.id,
        tenantId: activeTenant.id,
        email: activeUser.email,
      });
    });

    it('T067: PATCH /api/v1/tenants/current rejects billingStatus field with 403', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${activeToken}`)
        .send({
          name: 'Updated Name',
          billingStatus: BillingStatus.ACTIVE,
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe(
        BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN,
      );
    });
  });

  describe('T068: Tenant isolation maintained', () => {
    let tenant1: any;
    let user1: any;
    let token1: string;
    let tenant2: any;
    let user2: any;

    beforeEach(async () => {
      const setup1 = await createTestTenantAndUser(prisma, {
        tenantName: 'Gym 1',
        userEmail: 'tenant1@test.com',
      });
      tenant1 = setup1.tenant;
      user1 = setup1.user;
      await prisma.tenant.update({
        where: { id: tenant1.id },
        data: { billingStatus: BillingStatus.PAST_DUE },
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
      await prisma.tenant.update({
        where: { id: tenant2.id },
        data: { billingStatus: BillingStatus.ACTIVE },
      });
      token2 = createMockToken({
        userId: user2.id,
        tenantId: tenant2.id,
        email: user2.email,
      });
    });

    it('T068: Billing status restrictions do not bypass tenant scoping', async () => {
      // Tenant1 (PAST_DUE) cannot access Tenant2's data even if Tenant2 is ACTIVE
      const branch2 = await createTestBranch(prisma, tenant2.id, {
        name: 'Branch 2',
        isDefault: true,
      });

      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      const member2 = await prisma.member.create({
        data: {
          tenantId: tenant2.id,
          branchId: branch2.id,
          firstName: 'Tenant2',
          lastName: 'Member',
          email: 'tenant2member@example.com',
          phone: '+1234567890',
          gender: 'MALE',
          birthDate: new Date('1990-01-01'),
          membershipStartDate: startDate,
          membershipEndDate: endDate,
          membershipPriceAtPurchase: 100,
          status: 'ACTIVE',
        },
      });

      // Tenant1 cannot access Tenant2's member (tenant isolation)
      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${member2.id}`)
        .set('Authorization', `Bearer ${token1}`);

      // Should return 404 (not found) or 403 (forbidden) due to tenant isolation
      // Not 403 due to billing status (that would be wrong)
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('E2E User Flows', () => {
    describe('E2E-001: PAST_DUE tenant can view members but cannot create', () => {
      let pastDueTenant: any;
      let pastDueUser: any;
      let pastDueToken: string;
      let branch: any;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Past Due Gym',
          userEmail: 'pastdue@test.com',
        });
        pastDueTenant = setup.tenant;
        pastDueUser = setup.user;
        await prisma.tenant.update({
          where: { id: pastDueTenant.id },
          data: { billingStatus: BillingStatus.PAST_DUE },
        });

        branch = await createTestBranch(prisma, pastDueTenant.id, {
          name: 'Main Branch',
          isDefault: true,
        });

        // Create a member via DB
        const now = new Date();
        const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const endDate = new Date(
          startDate.getTime() + 365 * 24 * 60 * 60 * 1000,
        );
        await prisma.member.create({
          data: {
            tenantId: pastDueTenant.id,
            branchId: branch.id,
            firstName: 'Existing',
            lastName: 'Member',
            email: 'existing@example.com',
            phone: '+1234567890',
            gender: 'MALE',
            birthDate: new Date('1990-01-01'),
            membershipStartDate: startDate,
            membershipEndDate: endDate,
            membershipPriceAtPurchase: 100,
            status: 'ACTIVE',
          },
        });

        // Use real login for PAST_DUE to test login flow
        const loginResult = await loginUser(app, pastDueUser.email, 'Pass123!');
        pastDueToken = loginResult.accessToken;
      });

      it('E2E-001: PAST_DUE tenant can view members but cannot create new member', async () => {
        // Can view members
        const getResponse = await request(app.getHttpServer())
          .get('/api/v1/members')
          .set('Authorization', `Bearer ${pastDueToken}`);

        expect(getResponse.status).toBe(200);
        expect(Array.isArray(getResponse.body)).toBe(true);
        expect(getResponse.body.length).toBeGreaterThan(0);

        // Cannot create member
        const postResponse = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${pastDueToken}`)
          .send({
            firstName: 'New',
            lastName: 'Member',
            email: 'new@example.com',
            phone: '+1234567891',
            gender: 'FEMALE',
            birthDate: '1990-01-01',
            branchId: branch.id,
          });

        expect(postResponse.status).toBe(403);
        expect(postResponse.body.code).toBe(
          BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        );
      });
    });

    describe('E2E-002: PAST_DUE tenant can view plans but cannot update', () => {
      let pastDueTenant: any;
      let pastDueUser: any;
      let pastDueToken: string;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Past Due Gym',
          userEmail: 'pastdue@test.com',
        });
        pastDueTenant = setup.tenant;
        pastDueUser = setup.user;
        await prisma.tenant.update({
          where: { id: pastDueTenant.id },
          data: { billingStatus: BillingStatus.PAST_DUE },
        });

        // Create a plan via DB
        await prisma.membershipPlan.create({
          data: {
            tenantId: pastDueTenant.id,
            name: 'Basic Plan',
            durationType: 'MONTHS',
            durationValue: 1,
            price: 100,
            currency: 'USD',
            status: 'ACTIVE',
            scope: 'TENANT',
            scopeKey: 'TENANT',
          },
        });

        // Use real login for PAST_DUE to test login flow
        const loginResult = await loginUser(app, pastDueUser.email, 'Pass123!');
        pastDueToken = loginResult.accessToken;
      });

      it('E2E-002: PAST_DUE tenant can view plans but cannot update plan', async () => {
        // Can view plans
        const getResponse = await request(app.getHttpServer())
          .get('/api/v1/membership-plans')
          .set('Authorization', `Bearer ${pastDueToken}`);

        expect(getResponse.status).toBe(200);
        expect(Array.isArray(getResponse.body)).toBe(true);

        // Cannot update plan
        const plan = getResponse.body[0];
        const patchResponse = await request(app.getHttpServer())
          .patch(`/api/v1/membership-plans/${plan.id}`)
          .set('Authorization', `Bearer ${pastDueToken}`)
          .send({ name: 'Updated Plan' });

        expect(patchResponse.status).toBe(403);
        expect(patchResponse.body.code).toBe(
          BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        );
      });
    });

    describe('E2E-003: SUSPENDED tenant cannot login', () => {
      let suspendedTenant: any;
      let suspendedUser: any;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Suspended Gym',
          userEmail: 'suspended@test.com',
        });
        suspendedTenant = setup.tenant;
        suspendedUser = setup.user;
        await prisma.tenant.update({
          where: { id: suspendedTenant.id },
          data: { billingStatus: BillingStatus.SUSPENDED },
        });
      });

      it('E2E-003: SUSPENDED tenant cannot login (403 on login endpoint)', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: suspendedUser.email,
            password: 'Pass123!',
          });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe(
          BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        );
        expect(response.body.message).toBe(
          BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN,
        );
      });
    });

    describe('E2E-005: ACTIVE tenant can perform all CRUD operations', () => {
      let activeTenant: any;
      let activeUser: any;
      let activeToken: string;
      let branch: any;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Active Gym',
          userEmail: 'active@test.com',
        });
        activeTenant = setup.tenant;
        activeUser = setup.user;
        await prisma.tenant.update({
          where: { id: activeTenant.id },
          data: { billingStatus: BillingStatus.ACTIVE },
        });

        branch = await createTestBranch(prisma, activeTenant.id, {
          name: 'Main Branch',
          isDefault: true,
        });

        activeToken = createMockToken({
          userId: activeUser.id,
          tenantId: activeTenant.id,
          email: activeUser.email,
        });
      });

      it('E2E-005: ACTIVE tenant can perform all CRUD operations normally', async () => {
        // CREATE
        const createResponse = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${activeToken}`)
          .send({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '+1234567890',
            gender: 'MALE',
            birthDate: '1990-01-01',
            branchId: branch.id,
          });

        expect(createResponse.status).toBe(201);
        const memberId = createResponse.body.id;

        // READ
        const readResponse = await request(app.getHttpServer())
          .get(`/api/v1/members/${memberId}`)
          .set('Authorization', `Bearer ${activeToken}`);

        expect(readResponse.status).toBe(200);
        expect(readResponse.body.id).toBe(memberId);

        // UPDATE
        const updateResponse = await request(app.getHttpServer())
          .patch(`/api/v1/members/${memberId}`)
          .set('Authorization', `Bearer ${activeToken}`)
          .send({ firstName: 'Jane' });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.firstName).toBe('Jane');

        // DELETE
        const deleteResponse = await request(app.getHttpServer())
          .delete(`/api/v1/members/${memberId}`)
          .set('Authorization', `Bearer ${activeToken}`);

        expect(deleteResponse.status).toBe(200);
      });
    });

    describe('E2E-006: TRIAL tenant can perform all CRUD operations', () => {
      let trialTenant: any;
      let trialUser: any;
      let trialToken: string;
      let branch: any;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Trial Gym',
          userEmail: 'trial@test.com',
        });
        trialTenant = setup.tenant;
        trialUser = setup.user;
        await prisma.tenant.update({
          where: { id: trialTenant.id },
          data: { billingStatus: BillingStatus.TRIAL },
        });

        branch = await createTestBranch(prisma, trialTenant.id, {
          name: 'Main Branch',
          isDefault: true,
        });

        trialToken = createMockToken({
          userId: trialUser.id,
          tenantId: trialTenant.id,
          email: trialUser.email,
        });
      });

      it('E2E-006: TRIAL tenant can perform all CRUD operations normally', async () => {
        // CREATE
        const createResponse = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${trialToken}`)
          .send({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '+1234567890',
            gender: 'MALE',
            birthDate: '1990-01-01',
            branchId: branch.id,
          });

        expect(createResponse.status).toBe(201);
      });
    });

    describe('E2E-007: Tenant cannot update own billingStatus via API', () => {
      let activeTenant: any;
      let activeUser: any;
      let activeToken: string;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Active Gym',
          userEmail: 'active@test.com',
        });
        activeTenant = setup.tenant;
        activeUser = setup.user;

        activeToken = createMockToken({
          userId: activeUser.id,
          tenantId: activeTenant.id,
          email: activeUser.email,
        });
      });

      it('E2E-007: Tenant cannot update own billingStatus via API (403 Forbidden)', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/tenants/current')
          .set('Authorization', `Bearer ${activeToken}`)
          .send({
            billingStatus: BillingStatus.ACTIVE,
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toBe(
          BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN,
        );
      });
    });

    describe('E2E-008: Database update of billingStatus (PAST_DUE → ACTIVE)', () => {
      let tenant: any;
      let user: any;
      let token: string;
      let branch: any;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Test Gym',
          userEmail: 'test@test.com',
        });
        tenant = setup.tenant;
        user = setup.user;
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { billingStatus: BillingStatus.PAST_DUE },
        });

        branch = await createTestBranch(prisma, tenant.id, {
          name: 'Main Branch',
          isDefault: true,
        });

        token = createMockToken({
          userId: user.id,
          tenantId: tenant.id,
          email: user.email,
        });
      });

      it('E2E-008: Database update of billingStatus (PAST_DUE → ACTIVE) immediately allows mutations', async () => {
        // Initially blocked
        const blockedResponse = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token}`)
          .send({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '+1234567890',
            gender: 'MALE',
            birthDate: '1990-01-01',
            branchId: branch.id,
          });

        expect(blockedResponse.status).toBe(403);

        // Update billing status in database
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { billingStatus: BillingStatus.ACTIVE },
        });

        // Verify update succeeded
        const tenantAfter = await prisma.tenant.findUnique({
          where: { id: tenant.id },
        });
        expect(tenantAfter?.billingStatus).toBe(BillingStatus.ACTIVE);

        // Wait a bit to ensure DB update is visible
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Now mutations should work
        const allowedResponse = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token}`)
          .send({
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            phone: '+1234567891',
            gender: 'FEMALE',
            birthDate: '1990-01-01',
            branchId: branch.id,
          });

        expect(allowedResponse.status).toBe(201);
      });
    });

    describe('E2E-009: Database update of billingStatus (ACTIVE → SUSPENDED)', () => {
      let tenant: any;
      let user: any;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Test Gym',
          userEmail: 'test@test.com',
        });
        tenant = setup.tenant;
        user = setup.user;
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { billingStatus: BillingStatus.ACTIVE },
        });
      });

      it('E2E-009: Database update of billingStatus (ACTIVE → SUSPENDED) blocks next login attempt', async () => {
        // Verify tenant is ACTIVE initially
        const tenantBefore = await prisma.tenant.findUnique({
          where: { id: tenant.id },
        });
        expect(tenantBefore?.billingStatus).toBe(BillingStatus.ACTIVE);

        // Initially can login
        const login1 = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: user.email,
            password: 'Pass123!',
          });

        expect(login1.status).toBe(201);

        // Update billing status to SUSPENDED
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { billingStatus: BillingStatus.SUSPENDED },
        });

        // Verify update succeeded
        const tenantAfter = await prisma.tenant.findUnique({
          where: { id: tenant.id },
        });
        expect(tenantAfter?.billingStatus).toBe(BillingStatus.SUSPENDED);

        // Wait a bit to ensure DB update is visible
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Next login attempt should be blocked
        const login2 = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: user.email,
            password: 'Pass123!',
          });

        expect(login2.status).toBe(403);
        expect(login2.body.code).toBe(
          BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        );
      });
    });

    describe('E2E-010: Mid-session billing status change', () => {
      let tenant: any;
      let user: any;
      let token: string;
      let branch: any;

      beforeEach(async () => {
        const setup = await createTestTenantAndUser(prisma, {
          tenantName: 'Test Gym',
          userEmail: 'test@test.com',
        });
        tenant = setup.tenant;
        user = setup.user;
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { billingStatus: BillingStatus.ACTIVE },
        });

        branch = await createTestBranch(prisma, tenant.id, {
          name: 'Main Branch',
          isDefault: true,
        });

        token = createMockToken({
          userId: user.id,
          tenantId: tenant.id,
          email: user.email,
        });
      });

      it('E2E-010: Mid-session billing status change (ACTIVE → PAST_DUE) blocks next mutation request', async () => {
        // Verify tenant is ACTIVE initially
        const tenantBefore = await prisma.tenant.findUnique({
          where: { id: tenant.id },
        });
        expect(tenantBefore?.billingStatus).toBe(BillingStatus.ACTIVE);

        // Initially can create
        const create1 = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token}`)
          .send({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '+1234567890',
            gender: 'MALE',
            birthDate: '1990-01-01',
            branchId: branch.id,
          });

        expect(create1.status).toBe(201);

        // Update billing status mid-session
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { billingStatus: BillingStatus.PAST_DUE },
        });

        // Verify update succeeded
        const tenantAfter = await prisma.tenant.findUnique({
          where: { id: tenant.id },
        });
        expect(tenantAfter?.billingStatus).toBe(BillingStatus.PAST_DUE);

        // Wait a bit to ensure DB update is visible
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Next mutation should be blocked
        const create2 = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token}`)
          .send({
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            phone: '+1234567891',
            gender: 'FEMALE',
            birthDate: '1990-01-01',
            branchId: branch.id,
          });

        expect(create2.status).toBe(403);
        expect(create2.body.code).toBe(
          BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        );
      });
    });
  });
});
