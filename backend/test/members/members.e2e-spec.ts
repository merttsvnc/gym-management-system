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
  createMultipleTestMembers,
} from './e2e/test-helpers';
import { MemberStatus, MemberGender } from '@prisma/client';

describe('Members E2E Tests', () => {
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

    // Create default membership plans for each tenant
    await prisma.membershipPlan.create({
      data: {
        id: 'plan-tenant1',
        tenantId: tenant1.id,
        name: 'Basic Plan',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 100,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });

    await prisma.membershipPlan.create({
      data: {
        id: 'plan-tenant2',
        tenantId: tenant2.id,
        name: 'Basic Plan',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 100,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestMembers(prisma, [tenant1.id, tenant2.id]);
    await prisma.membershipPlan.deleteMany({
      where: { tenantId: { in: [tenant1.id, tenant2.id] } },
    });
    await cleanupTestData(prisma, [tenant1.id, tenant2.id]);
    await app.close();
  });

  afterEach(async () => {
    // Clean up members after each test
    await cleanupTestMembers(prisma, [tenant1.id, tenant2.id]);
  });

  // =====================================================================
  // AUTHENTICATION & AUTHORIZATION TESTS
  // =====================================================================

  describe('Authentication', () => {
    it('should return 401 when no token is provided', async () => {
      await request(app.getHttpServer()).get('/api/v1/members').expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should allow access with valid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
    });
  });

  // =====================================================================
  // API SMOKE & VALIDATION TESTS (T062-T066)
  // =====================================================================

  describe('Members - API Smoke & Validation (E2E)', () => {
    // T062: Smoke tests for all endpoints
    describe('T062 - Smoke Tests for All Endpoints', () => {
      it('should create a valid member with minimal required fields', async () => {
        const createDto = {
          branchId: branch1.id,
          firstName: 'Ahmet',
          lastName: 'Yılmaz',
          phone: '+905551234567',
          membershipPlanId: 'plan-tenant1',
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body.firstName).toBe('Ahmet');
        expect(response.body.lastName).toBe('Yılmaz');
        expect(response.body.phone).toBe('+905551234567');
        expect(response.body.status).toBe(MemberStatus.ACTIVE);
        expect(response.body).toHaveProperty('remainingDays');
        expect(typeof response.body.remainingDays).toBe('number');
      });

      it('should get a member by id', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Mehmet',
          lastName: 'Demir',
        });

        const response = await request(app.getHttpServer())
          .get(`/api/v1/members/${member.id}`)
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        expect(response.body.id).toBe(member.id);
        expect(response.body.firstName).toBe('Mehmet');
        expect(response.body.lastName).toBe('Demir');
        expect(response.body).toHaveProperty('remainingDays');
      });

      it('should update member basic fields', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Ayşe',
          phone: '+905559876543',
        });

        const updateDto = {
          firstName: 'Ayşe Updated',
          phone: '+905551111111',
          notes: 'Test notu',
        };

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/members/${member.id}`)
          .set('Authorization', `Bearer ${token1}`)
          .send(updateDto)
          .expect(200);

        expect(response.body.firstName).toBe('Ayşe Updated');
        expect(response.body.phone).toBe('+905551111111');
        expect(response.body.notes).toBe('Test notu');
        expect(response.body).toHaveProperty('remainingDays');
      });

      it('should change status from ACTIVE to INACTIVE', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          status: MemberStatus.ACTIVE,
        });

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: MemberStatus.INACTIVE })
          .expect(200);

        expect(response.body.status).toBe(MemberStatus.INACTIVE);
        expect(response.body).toHaveProperty('remainingDays');
      });

      it('should archive a member', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          status: MemberStatus.ACTIVE,
        });

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/archive`)
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        expect(response.body.status).toBe(MemberStatus.ARCHIVED);
        expect(response.body).toHaveProperty('remainingDays');
      });
    });

    // T063: Tenant isolation tests
    describe('T063 - Tenant Isolation Tests', () => {
      it('should not allow accessing member from another tenant (returns 404)', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Tenant1 Member',
        });

        const response = await request(app.getHttpServer())
          .get(`/api/v1/members/${member.id}`)
          .set('Authorization', `Bearer ${token2}`)
          .expect(404);

        expect(response.body.message).toContain('Üye bulunamadı');
      });

      it('should only return members from current tenant in list', async () => {
        await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Tenant1 Member 1',
        });
        await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Tenant1 Member 2',
        });
        await createTestMember(prisma, tenant2.id, branch2.id, {
          firstName: 'Tenant2 Member',
        });

        const response = await request(app.getHttpServer())
          .get('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        expect(response.body.data).toHaveLength(2);
        expect(
          response.body.data.every((m: any) =>
            m.firstName.startsWith('Tenant1'),
          ),
        ).toBe(true);
      });

      it('should prevent updating member from another tenant', async () => {
        const member = await createTestMember(prisma, tenant2.id, branch2.id);

        await request(app.getHttpServer())
          .patch(`/api/v1/members/${member.id}`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ firstName: 'Hacked' })
          .expect(404);
      });

      it('should prevent status change for member from another tenant', async () => {
        const member = await createTestMember(prisma, tenant2.id, branch2.id);

        await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: MemberStatus.PAUSED })
          .expect(404);
      });
    });

    // T064: Status change transition tests
    describe('T064 - Status Change Transition Tests', () => {
      it('should allow ACTIVE → INACTIVE transition', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          status: MemberStatus.ACTIVE,
        });

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: MemberStatus.INACTIVE })
          .expect(200);

        expect(response.body.status).toBe(MemberStatus.INACTIVE);
      });

      it('should allow INACTIVE → ACTIVE transition', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          status: MemberStatus.INACTIVE,
        });

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: MemberStatus.ACTIVE })
          .expect(200);

        expect(response.body.status).toBe(MemberStatus.ACTIVE);
      });

      it('should reject ARCHIVED → ACTIVE transition with Turkish error', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          status: MemberStatus.ARCHIVED,
        });

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: MemberStatus.ACTIVE })
          .expect(400);

        expect(response.body.message).toContain('Arşivlenmiş');
        expect(response.body.message).toContain('değiştirilemez');
      });

      it('should reject ARCHIVED → PAUSED transition', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          status: MemberStatus.ARCHIVED,
        });

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: MemberStatus.PAUSED })
          .expect(400);

        expect(response.body.message).toContain('Arşivlenmiş');
      });

      it('should reject invalid status string', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id);

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: 'INVALID_STATUS' })
          .expect(400);

        expect(response.body.message).toBeDefined();
      });

      it('should reject INACTIVE → PAUSED transition', async () => {
        const member = await createTestMember(prisma, tenant1.id, branch1.id, {
          status: MemberStatus.INACTIVE,
        });

        const response = await request(app.getHttpServer())
          .post(`/api/v1/members/${member.id}/status`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ status: MemberStatus.PAUSED })
          .expect(400);

        expect(response.body.message).toContain('Geçersiz durum geçişi');
      });
    });

    // T065: Phone uniqueness validation tests
    describe('T065 - Phone Uniqueness Validation Tests', () => {
      it('should reject duplicate phone within same tenant', async () => {
        const phone = '+905551234567';
        await createTestMember(prisma, tenant1.id, branch1.id, { phone });

        const createDto = {
          branchId: branch1.id,
          firstName: 'Duplicate',
          lastName: 'Phone',
          phone,
          membershipPlanId: 'plan-tenant1',
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(409);

        expect(response.body.message).toContain('telefon numarası');
        expect(response.body.message).toContain('zaten kullanılıyor');
      });

      it('should allow same phone across different tenants', async () => {
        const phone = '+905551234567';
        await createTestMember(prisma, tenant1.id, branch1.id, { phone });

        const createDto = {
          branchId: branch2.id,
          firstName: 'Same Phone',
          lastName: 'Different Tenant',
          phone,
          membershipPlanId: 'plan-tenant2',
        };

        await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token2}`)
          .send(createDto)
          .expect(201);
      });

      it('should reject duplicate phone on update within same tenant', async () => {
        const phone1 = '+905551111111';
        const phone2 = '+905552222222';

        const member1 = await createTestMember(prisma, tenant1.id, branch1.id, {
          phone: phone1,
        });
        await createTestMember(prisma, tenant1.id, branch1.id, {
          phone: phone2,
        });

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/members/${member1.id}`)
          .set('Authorization', `Bearer ${token1}`)
          .send({ phone: phone2 })
          .expect(409);

        expect(response.body.message).toContain('telefon numarası');
        expect(response.body.message).toContain('zaten kullanılıyor');
      });
    });

    // T066: Search functionality tests
    describe('T066 - Search Functionality Tests', () => {
      beforeEach(async () => {
        // Create test members with Turkish names
        await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Ahmet',
          lastName: 'Yılmaz',
          phone: '+905551111111',
        });
        await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Mehmet',
          lastName: 'Yıldız',
          phone: '+905552222222',
        });
        await createTestMember(prisma, tenant1.id, branch1.id, {
          firstName: 'Ayşe',
          lastName: 'Demir',
          phone: '+905553333333',
        });
      });

      it('should search by firstName substring (case-insensitive)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/members?search=meh')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].firstName).toBe('Mehmet');
      });

      it('should search by lastName substring', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/members?search=Yıl')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        expect(response.body.data.length).toBeGreaterThanOrEqual(1);
        expect(
          response.body.data.some((m: any) => m.lastName.includes('Yıl')),
        ).toBe(true);
      });

      it('should search by phone substring', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/members?search=1111')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].phone).toBe('+905551111111');
      });

      it('should be case-insensitive when searching', async () => {
        // Search with lowercase
        const responseLower = await request(app.getHttpServer())
          .get('/api/v1/members?search=ahmet')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        // Search with uppercase
        const responseUpper = await request(app.getHttpServer())
          .get('/api/v1/members?search=AHMET')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        // Both should return same results
        expect(responseLower.body.data.length).toBe(
          responseUpper.body.data.length,
        );
        expect(responseLower.body.data.length).toBeGreaterThan(0);
      });

      it('should return empty results for non-matching search', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/members?search=NonExistentName')
          .set('Authorization', `Bearer ${token1}`)
          .expect(200);

        expect(response.body.data).toHaveLength(0);
      });
    });
  });

  describe('Tenant Isolation', () => {
    it('should not allow accessing member from another tenant', async () => {
      // Create member in tenant1
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'John',
      });

      // Try to access with tenant2 token
      await request(app.getHttpServer())
        .get(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(404);
    });

    it('should only return members from own tenant in list', async () => {
      // Create members in both tenants
      await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'Tenant1Member',
      });
      await createTestMember(prisma, tenant2.id, branch2.id, {
        firstName: 'Tenant2Member',
      });

      // List with tenant1 token
      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].firstName).toBe('Tenant1Member');
    });
  });

  // =====================================================================
  // LIST MEMBERS TESTS
  // =====================================================================

  describe('GET /api/v1/members', () => {
    it('should return empty list when no members exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return paginated list of members', async () => {
      await createMultipleTestMembers(prisma, tenant1.id, branch1.id, 5);

      const response = await request(app.getHttpServer())
        .get('/api/v1/members?page=1&limit=3')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 3,
        total: 5,
        totalPages: 2,
      });
    });

    it('should include remainingDays in each member', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id);

      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data[0]).toHaveProperty('remainingDays');
      expect(typeof response.body.data[0].remainingDays).toBe('number');
    });

    it('should filter by branchId', async () => {
      const branch1a = await createTestBranch(prisma, tenant1.id, {
        name: 'Branch 1A',
      });
      const branch1b = await createTestBranch(prisma, tenant1.id, {
        name: 'Branch 1B',
      });

      await createTestMember(prisma, tenant1.id, branch1a.id, {
        firstName: 'Branch1A',
      });
      await createTestMember(prisma, tenant1.id, branch1b.id, {
        firstName: 'Branch1B',
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/members?branchId=${branch1a.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].firstName).toBe('Branch1A');
    });

    it('should filter by status', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'Active',
        status: MemberStatus.ACTIVE,
      });
      await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'Paused',
        status: MemberStatus.PAUSED,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/members?status=PAUSED`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].firstName).toBe('Paused');
    });

    it('should exclude ARCHIVED members by default', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ACTIVE,
      });
      await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ARCHIVED,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe(MemberStatus.ACTIVE);
    });

    it('should include ARCHIVED members when includeArchived=true', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ACTIVE,
      });
      await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ARCHIVED,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/members?includeArchived=true')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('should search by firstName (case-insensitive)', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'John',
        lastName: 'Doe',
      });
      await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'Jane',
        lastName: 'Smith',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/members?search=john')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].firstName).toBe('John');
    });

    it('should search by lastName (case-insensitive)', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'John',
        lastName: 'Doe',
      });
      await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'Jane',
        lastName: 'Smith',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/members?search=smith')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].lastName).toBe('Smith');
    });

    it('should search by phone', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id, {
        phone: '+1234567890',
      });
      await createTestMember(prisma, tenant1.id, branch1.id, {
        phone: '+9876543210',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/members?search=123456')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].phone).toBe('+1234567890');
    });
  });

  // =====================================================================
  // GET SINGLE MEMBER TESTS
  // =====================================================================

  describe('GET /api/v1/members/:id', () => {
    it('should return a single member with remainingDays and branch information', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', member.id);
      expect(response.body).toHaveProperty('remainingDays');
      expect(response.body).toHaveProperty('branch');
      expect(response.body.branch).toHaveProperty('id', branch1.id);
      expect(response.body.branch).toHaveProperty('name');
    });

    it('should return 404 for non-existent member', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/members/non-existent-id')
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);
    });

    it('should return 404 for member from another tenant', async () => {
      const member = await createTestMember(prisma, tenant2.id, branch2.id);

      await request(app.getHttpServer())
        .get(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);
    });
  });

  // =====================================================================
  // CREATE MEMBER TESTS
  // =====================================================================

  describe('POST /api/v1/members', () => {
    it('should create a new member with valid data', async () => {
      const createDto = {
        branchId: branch1.id,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        gender: MemberGender.MALE,
        dateOfBirth: '1990-01-01',
        membershipType: 'Premium',
        membershipPlanId: 'plan-tenant1',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.firstName).toBe('John');
      expect(response.body.lastName).toBe('Doe');
      expect(response.body.phone).toBe('+1234567890');
      expect(response.body.email).toBe('john@example.com');
      expect(response.body.status).toBe(MemberStatus.ACTIVE);
      expect(response.body).toHaveProperty('remainingDays');
    });

    it('should reject duplicate phone within tenant', async () => {
      const phone = '+1234567890';
      await createTestMember(prisma, tenant1.id, branch1.id, { phone });

      const createDto = {
        branchId: branch1.id,
        firstName: 'Jane',
        lastName: 'Doe',
        phone,
        membershipPlanId: 'plan-tenant1',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(409);

      expect(response.body.message).toContain('telefon numarası');
    });

    it('should allow same phone in different tenants', async () => {
      const phone = '+1234567890';
      await createTestMember(prisma, tenant1.id, branch1.id, { phone });

      const createDto = {
        branchId: branch2.id,
        firstName: 'Jane',
        lastName: 'Doe',
        phone,
        membershipPlanId: 'plan-tenant2',
      };

      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token2}`)
        .send(createDto)
        .expect(201);
    });

    // NOTE: Test removed - membershipEndDate is now auto-calculated from plan.
    // Invalid date validation is no longer applicable since dates come from plan duration.

    it('should reject branch from another tenant', async () => {
      const createDto = {
        branchId: branch2.id, // Branch from tenant2
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-tenant2',
      };

      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`) // Using tenant1 token
        .send(createDto)
        .expect(404);
    });

    it('should set default values from plan when not provided', async () => {
      const createDto = {
        branchId: branch1.id,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-tenant1',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      expect(response.body.status).toBe(MemberStatus.ACTIVE);
      expect(response.body.membershipStartDate).toBeDefined();
      expect(response.body.membershipEndDate).toBeDefined();
      expect(response.body.membershipPlanId).toBe('plan-tenant1');
      // Verify price was captured from plan
      expect(Number(response.body.membershipPriceAtPurchase)).toBe(100);
    });
  });

  // =====================================================================
  // UPDATE MEMBER TESTS
  // =====================================================================

  describe('PATCH /api/v1/members/:id', () => {
    it('should update member successfully', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        firstName: 'John',
      });

      const updateDto = {
        firstName: 'Jane',
        lastName: 'Updated',
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.firstName).toBe('Jane');
      expect(response.body.lastName).toBe('Updated');
      expect(response.body).toHaveProperty('remainingDays');
    });

    it('should return 404 for member from another tenant', async () => {
      const member = await createTestMember(prisma, tenant2.id, branch2.id);

      await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ firstName: 'Updated' })
        .expect(404);
    });

    it('should reject duplicate phone', async () => {
      const phone1 = '+1234567890';
      const phone2 = '+9876543210';

      const member1 = await createTestMember(prisma, tenant1.id, branch1.id, {
        phone: phone1,
      });
      await createTestMember(prisma, tenant1.id, branch1.id, { phone: phone2 });

      const updateDto = {
        phone: phone2,
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/members/${member1.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send(updateDto)
        .expect(409);
    });

    it('should reject invalid membership dates', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id);

      const updateDto = {
        membershipStartDate: '2024-12-31',
        membershipEndDate: '2024-01-01',
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send(updateDto)
        .expect(400);
    });

    it('should reject changing to branch from another tenant', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id);

      const updateDto = {
        branchId: branch2.id, // Branch from tenant2
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send(updateDto)
        .expect(404);
    });
  });

  // =====================================================================
  // CHANGE STATUS TESTS
  // =====================================================================

  describe('POST /api/v1/members/:id/status', () => {
    it('should change status from ACTIVE to PAUSED', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ACTIVE,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(200);

      expect(response.body.status).toBe(MemberStatus.PAUSED);
      expect(response.body.pausedAt).toBeDefined();
      expect(response.body.resumedAt).toBeNull();
    });

    it('should change status from PAUSED to ACTIVE', async () => {
      const pausedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.PAUSED,
        pausedAt,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.ACTIVE })
        .expect(200);

      expect(response.body.status).toBe(MemberStatus.ACTIVE);
      expect(response.body.resumedAt).toBeDefined();
    });

    it('should reject invalid transition (INACTIVE to PAUSED)', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.INACTIVE,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(400);
    });

    it('should reject transitioning from ARCHIVED', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ARCHIVED,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.ACTIVE })
        .expect(400);
    });

    it('should reject setting ARCHIVED via changeStatus', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ACTIVE,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.ARCHIVED })
        .expect(400);
    });

    it('should return 404 for member from another tenant', async () => {
      const member = await createTestMember(prisma, tenant2.id, branch2.id);

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(404);
    });
  });

  // =====================================================================
  // ARCHIVE MEMBER TESTS
  // =====================================================================

  describe('POST /api/v1/members/:id/archive', () => {
    it('should archive a member', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ACTIVE,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.status).toBe(MemberStatus.ARCHIVED);
      expect(response.body.pausedAt).toBeNull();
      expect(response.body.resumedAt).toBeNull();
    });

    it('should return member as-is if already archived', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ARCHIVED,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.status).toBe(MemberStatus.ARCHIVED);
    });

    it('should clear pause timestamps when archiving', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.PAUSED,
        pausedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.status).toBe(MemberStatus.ARCHIVED);
      expect(response.body.pausedAt).toBeNull();
      expect(response.body.resumedAt).toBeNull();
    });

    it('should return 404 for member from another tenant', async () => {
      const member = await createTestMember(prisma, tenant2.id, branch2.id);

      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);
    });

    it('should prevent further status changes after archiving', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id, {
        status: MemberStatus.ACTIVE,
      });

      // Archive the member
      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Try to change status
      await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.ACTIVE })
        .expect(400);
    });
  });

  // =====================================================================
  // FREEZE/RESUME FLOW TESTS (T061)
  // =====================================================================

  describe('Members - Freeze/Resume Flow (E2E)', () => {
    it('should create member → pause → check pausedAt', async () => {
      // Create member
      const createDto = {
        branchId: branch1.id,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipPlanId: 'plan-tenant1',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      const memberId = createResponse.body.id;
      expect(createResponse.body.status).toBe(MemberStatus.ACTIVE);
      expect(createResponse.body.pausedAt).toBeNull();

      // Pause member
      const pauseResponse = await request(app.getHttpServer())
        .post(`/api/v1/members/${memberId}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(200);

      expect(pauseResponse.body.status).toBe(MemberStatus.PAUSED);
      expect(pauseResponse.body.pausedAt).toBeDefined();
      expect(pauseResponse.body.pausedAt).not.toBeNull();
      expect(pauseResponse.body.resumedAt).toBeNull();

      // Get member and verify pausedAt is set
      const getResponse = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(getResponse.body.status).toBe(MemberStatus.PAUSED);
      expect(getResponse.body.pausedAt).toBeDefined();
      expect(getResponse.body.pausedAt).not.toBeNull();
    });

    it('should extend membershipEndDate when resuming', async () => {
      // Create member with plan
      const createDto = {
        branchId: branch1.id,
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+9876543210',
        membershipPlanId: 'plan-tenant1',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      const memberId = createResponse.body.id;
      const originalEndDate = new Date(createResponse.body.membershipEndDate);

      // Pause member
      await request(app.getHttpServer())
        .post(`/api/v1/members/${memberId}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(200);

      // Wait a bit (simulate time passing)
      // In real scenario, time would pass naturally
      // For testing, we'll verify the extension happens

      // Get paused member to get pausedAt timestamp
      const pausedMember = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      const pausedAt = new Date(pausedMember.body.pausedAt);

      // Advance time slightly (simulate pause duration)
      // In a real test, you might use jest.useFakeTimers() or wait
      // For E2E, we'll just verify the extension logic works

      // Resume member
      const resumeResponse = await request(app.getHttpServer())
        .post(`/api/v1/members/${memberId}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.ACTIVE })
        .expect(200);

      const newEndDate = new Date(resumeResponse.body.membershipEndDate);
      const resumedAt = new Date(resumeResponse.body.resumedAt);

      // Verify membershipEndDate was extended
      expect(newEndDate.getTime()).toBeGreaterThan(originalEndDate.getTime());

      // Verify pause duration was added
      const pauseDurationMs = resumedAt.getTime() - pausedAt.getTime();
      const expectedNewEndDate = new Date(
        originalEndDate.getTime() + pauseDurationMs,
      );
      // Allow small tolerance for test execution time
      const diff = Math.abs(
        newEndDate.getTime() - expectedNewEndDate.getTime(),
      );
      expect(diff).toBeLessThan(5000); // Within 5 seconds

      // Verify timestamps
      expect(resumeResponse.body.resumedAt).toBeDefined();
      expect(resumeResponse.body.pausedAt).toBeNull();
    });

    it('should keep remaining days stable while paused', async () => {
      // Create member with plan
      const createDto = {
        branchId: branch1.id,
        firstName: 'Bob',
        lastName: 'Johnson',
        phone: '+1111111111',
        membershipPlanId: 'plan-tenant1',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      const memberId = createResponse.body.id;

      // Pause member
      await request(app.getHttpServer())
        .post(`/api/v1/members/${memberId}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(200);

      // Get remaining days immediately after pause
      const response1 = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      const remainingDays1 = response1.body.remainingDays;

      // Wait a bit (simulate time passing)
      // In real scenario, time would pass naturally
      // For E2E test, we'll check that remaining days don't decrease
      // by checking again after a short delay

      // Get remaining days again (simulating later check)
      const response2 = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      const remainingDays2 = response2.body.remainingDays;

      // Remaining days should be approximately the same (allowing for small test execution time differences)
      const diff = Math.abs(remainingDays1 - remainingDays2);
      expect(diff).toBeLessThanOrEqual(1); // Should be same or differ by at most 1 day due to test execution time
    });

    it('should return error when resuming without pausedAt', async () => {
      // Create member
      const createDto = {
        branchId: branch1.id,
        firstName: 'Alice',
        lastName: 'Williams',
        phone: '+2222222222',
        membershipPlanId: 'plan-tenant1',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      const memberId = createResponse.body.id;

      // Force member to PAUSED but with pausedAt = null (direct Prisma manipulation)
      await prisma.member.update({
        where: { id: memberId },
        data: {
          status: MemberStatus.PAUSED,
          pausedAt: null, // Invalid state
        },
      });

      // Try to resume - should fail with Turkish error message
      const response = await request(app.getHttpServer())
        .post(`/api/v1/members/${memberId}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.ACTIVE })
        .expect(400);

      expect(response.body.message).toContain('pausedAt');
      expect(response.body.message).toContain('bulunamadı');
    });

    it('should complete full pause-resume cycle end-to-end', async () => {
      // Create member with plan
      const createDto = {
        branchId: branch1.id,
        firstName: 'Charlie',
        lastName: 'Brown',
        phone: '+3333333333',
        membershipPlanId: 'plan-tenant1',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      const memberId = createResponse.body.id;
      const originalEndDate = new Date(createResponse.body.membershipEndDate);

      // Step 1: Pause member
      const pauseResponse = await request(app.getHttpServer())
        .post(`/api/v1/members/${memberId}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(200);

      expect(pauseResponse.body.status).toBe(MemberStatus.PAUSED);
      expect(pauseResponse.body.pausedAt).toBeDefined();
      expect(pauseResponse.body.resumedAt).toBeNull();
      expect(pauseResponse.body.membershipEndDate).toBe(
        originalEndDate.toISOString(),
      );

      const pausedAt = new Date(pauseResponse.body.pausedAt);

      // Step 2: Verify member is paused
      const getPausedResponse = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(getPausedResponse.body.status).toBe(MemberStatus.PAUSED);
      expect(getPausedResponse.body.pausedAt).toBeDefined();

      // Step 3: Resume member
      const resumeResponse = await request(app.getHttpServer())
        .post(`/api/v1/members/${memberId}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.ACTIVE })
        .expect(200);

      expect(resumeResponse.body.status).toBe(MemberStatus.ACTIVE);
      expect(resumeResponse.body.resumedAt).toBeDefined();
      expect(resumeResponse.body.pausedAt).toBeNull();

      const resumedAt = new Date(resumeResponse.body.resumedAt);
      const newEndDate = new Date(resumeResponse.body.membershipEndDate);

      // Verify membershipEndDate was extended
      expect(newEndDate.getTime()).toBeGreaterThan(originalEndDate.getTime());

      // Verify pause duration was added
      const pauseDurationMs = resumedAt.getTime() - pausedAt.getTime();
      const expectedNewEndDate = new Date(
        originalEndDate.getTime() + pauseDurationMs,
      );
      const diff = Math.abs(
        newEndDate.getTime() - expectedNewEndDate.getTime(),
      );
      expect(diff).toBeLessThan(5000); // Within 5 seconds

      // Step 4: Verify final state
      const finalResponse = await request(app.getHttpServer())
        .get(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(finalResponse.body.status).toBe(MemberStatus.ACTIVE);
      expect(finalResponse.body.pausedAt).toBeNull();
      expect(finalResponse.body.resumedAt).toBeDefined();
      expect(finalResponse.body.membershipEndDate).toBe(
        newEndDate.toISOString(),
      );
      expect(finalResponse.body.remainingDays).toBeDefined();
    });
  });

  // =====================================================================
  // RESPONSE SHAPE VALIDATION
  // =====================================================================

  describe('Response Shape Validation', () => {
    it('list endpoint should return correct pagination structure', async () => {
      await createTestMember(prisma, tenant1.id, branch1.id);

      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('all responses should include remainingDays', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id);

      // GET one
      const getOne = await request(app.getHttpServer())
        .get(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      expect(getOne.body).toHaveProperty('remainingDays');

      // POST create
      const create = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          branchId: branch1.id,
          firstName: 'New',
          lastName: 'Member',
          phone: '+9999999999',
          membershipPlanId: 'plan-tenant1',
        })
        .expect(201);
      expect(create.body).toHaveProperty('remainingDays');

      // PATCH update
      const update = await request(app.getHttpServer())
        .patch(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ firstName: 'Updated' })
        .expect(200);
      expect(update.body).toHaveProperty('remainingDays');

      // POST status
      const status = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ status: MemberStatus.PAUSED })
        .expect(200);
      expect(status.body).toHaveProperty('remainingDays');

      // POST archive
      const archive = await request(app.getHttpServer())
        .post(`/api/v1/members/${member.id}/archive`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      expect(archive.body).toHaveProperty('remainingDays');
    });
  });

  // =====================================================================
  // T134-T136: MEMBER CREATION WITH MEMBERSHIP PLAN
  // =====================================================================

  describe('Member Creation with Membership Plan', () => {
    let activePlan: any;
    let archivedPlan: any;
    const testPlanIds: string[] = [];

    beforeEach(async () => {
      // Create test plans with unique names
      const timestamp = Date.now();
      activePlan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: `Active Test Plan ${timestamp}`,
          durationType: 'MONTHS',
          durationValue: 3,
          price: 300,
          currency: 'USD',
          status: 'ACTIVE',
        },
      });
      testPlanIds.push(activePlan.id);

      archivedPlan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant1.id,
          name: `Archived Test Plan ${timestamp}`,
          durationType: 'MONTHS',
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: 'ARCHIVED',
        },
      });
      testPlanIds.push(archivedPlan.id);
    });

    afterEach(async () => {
      // Clean up members first (they reference plans via FK)
      await prisma.member.deleteMany({
        where: { membershipPlanId: { in: testPlanIds } },
      });
      // Then clean up plans created in this test block
      await prisma.membershipPlan.deleteMany({
        where: { id: { in: testPlanIds } },
      });
      testPlanIds.length = 0; // Clear the array
    });

    // T134: Create member with valid membershipPlanId
    describe('T134 - Create member with valid plan', () => {
      it('should create member with valid membershipPlanId and calculate end date correctly', async () => {
        const startDate = new Date('2025-01-15');
        const createDto = {
          branchId: branch1.id,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+905551234567',
          membershipPlanId: activePlan.id,
          membershipStartDate: startDate.toISOString(),
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('membershipPlanId', activePlan.id);
        expect(response.body).toHaveProperty('membershipStartDate');
        expect(response.body).toHaveProperty('membershipEndDate');
        expect(Number(response.body.membershipPriceAtPurchase)).toBe(300);

        // Verify end date calculation (3 months from start)
        const memberEndDate = new Date(response.body.membershipEndDate);

        // Expected end date: 2025-04-15 (3 months from 2025-01-15)
        expect(memberEndDate.getFullYear()).toBe(2025);
        expect(memberEndDate.getMonth()).toBe(3); // April (0-indexed)
        expect(memberEndDate.getDate()).toBe(15);
      });

      it('should default to today if membershipStartDate not provided', async () => {
        const createDto = {
          branchId: branch1.id,
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+905551234568',
          membershipPlanId: activePlan.id,
        };

        const beforeRequest = new Date();

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        const memberStartDate = new Date(response.body.membershipStartDate);
        const afterRequest = new Date();

        // Start date should be between before and after request
        expect(memberStartDate.getTime()).toBeGreaterThanOrEqual(
          beforeRequest.getTime() - 1000,
        );
        expect(memberStartDate.getTime()).toBeLessThanOrEqual(
          afterRequest.getTime() + 1000,
        );
      });

      it('should use plan price when membershipPriceAtPurchase not provided', async () => {
        const createDto = {
          branchId: branch1.id,
          firstName: 'Price',
          lastName: 'Default',
          phone: '+905551234569',
          membershipPlanId: activePlan.id,
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        expect(Number(response.body.membershipPriceAtPurchase)).toBe(300);
      });

      it('should allow custom membershipPriceAtPurchase', async () => {
        const createDto = {
          branchId: branch1.id,
          firstName: 'Custom',
          lastName: 'Price',
          phone: '+905551234570',
          membershipPlanId: activePlan.id,
          membershipPriceAtPurchase: 250, // Discounted price
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        expect(Number(response.body.membershipPriceAtPurchase)).toBe(250);
      });

      it('should calculate end date correctly for DAYS duration', async () => {
        // Create plan with DAYS duration
        const daysPlan = await prisma.membershipPlan.create({
          data: {
            tenantId: tenant1.id,
            name: '30 Days Plan',
            durationType: 'DAYS',
            durationValue: 30,
            price: 100,
            currency: 'USD',
            status: 'ACTIVE',
          },
        });

        const startDate = new Date('2025-01-15');
        const createDto = {
          branchId: branch1.id,
          firstName: 'Days',
          lastName: 'Test',
          phone: '+905551234571',
          membershipPlanId: daysPlan.id,
          membershipStartDate: startDate.toISOString(),
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        const memberEndDate = new Date(response.body.membershipEndDate);

        // Expected: 30 days from 2025-01-15 = 2025-02-14
        expect(memberEndDate.getFullYear()).toBe(2025);
        expect(memberEndDate.getMonth()).toBe(1); // February (0-indexed)
        expect(memberEndDate.getDate()).toBe(14);
      });

      it('should handle month-end clamping correctly (Jan 31 + 1 month)', async () => {
        // Create 1-month plan
        const monthPlan = await prisma.membershipPlan.create({
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

        const startDate = new Date('2025-01-31');
        const createDto = {
          branchId: branch1.id,
          firstName: 'MonthEnd',
          lastName: 'Test',
          phone: '+905551234572',
          membershipPlanId: monthPlan.id,
          membershipStartDate: startDate.toISOString(),
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        const memberEndDate = new Date(response.body.membershipEndDate);

        // Expected: Feb 28, 2025 (clamped to last day of month)
        expect(memberEndDate.getFullYear()).toBe(2025);
        expect(memberEndDate.getMonth()).toBe(1); // February
        expect(memberEndDate.getDate()).toBe(28); // Clamped to last day
      });
    });

    // T135: Invalid plan (other tenant, non-existent)
    describe('T135 - Invalid plan rejection', () => {
      it('should reject non-existent plan ID', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const createDto = {
          branchId: branch1.id,
          firstName: 'Invalid',
          lastName: 'Plan',
          phone: '+905551234573',
          membershipPlanId: fakeId,
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect((res) => {
            expect([400, 403, 404]).toContain(res.status);
          });

        expect(response.body).toHaveProperty('message');
      });

      it('should reject plan from another tenant', async () => {
        // Create plan for tenant2
        const tenant2Plan = await prisma.membershipPlan.create({
          data: {
            tenantId: tenant2.id,
            name: 'Tenant2 Plan',
            durationType: 'MONTHS',
            durationValue: 1,
            price: 100,
            currency: 'USD',
            status: 'ACTIVE',
          },
        });

        // Try to create member in tenant1 with tenant2's plan
        const createDto = {
          branchId: branch1.id,
          firstName: 'CrossTenant',
          lastName: 'Test',
          phone: '+905551234574',
          membershipPlanId: tenant2Plan.id,
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect((res) => {
            expect([400, 403, 404]).toContain(res.status);
          });

        expect(response.body).toHaveProperty('message');
      });
    });

    // T136: Archived plan rejection
    describe('T136 - Archived plan rejection', () => {
      it('should reject member creation with archived plan', async () => {
        const createDto = {
          branchId: branch1.id,
          firstName: 'Archived',
          lastName: 'Plan',
          phone: '+905551234575',
          membershipPlanId: archivedPlan.id,
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(400);

        expect(response.body).toHaveProperty('message');
      });

      it('should successfully create member after plan is restored', async () => {
        // Restore the archived plan
        await prisma.membershipPlan.update({
          where: { id: archivedPlan.id },
          data: { status: 'ACTIVE' },
        });

        // Now attempt should succeed
        const createDto = {
          branchId: branch1.id,
          firstName: 'After',
          lastName: 'Restore',
          phone: '+905551234577',
          membershipPlanId: archivedPlan.id,
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${token1}`)
          .send(createDto)
          .expect(201);

        expect(response.body).toHaveProperty(
          'membershipPlanId',
          archivedPlan.id,
        );
      });
    });
  });
});
