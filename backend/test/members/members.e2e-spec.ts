import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
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
  });

  afterAll(async () => {
    await cleanupTestMembers(prisma, [tenant1.id, tenant2.id]);
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
    it('should return a single member with remainingDays', async () => {
      const member = await createTestMember(prisma, tenant1.id, branch1.id);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/members/${member.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', member.id);
      expect(response.body).toHaveProperty('remainingDays');
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
      };

      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token2}`)
        .send(createDto)
        .expect(201);
    });

    it('should reject invalid membership dates', async () => {
      const createDto = {
        branchId: branch1.id,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: '2024-12-31',
        membershipEndAt: '2024-01-01',
      };

      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(400);
    });

    it('should reject branch from another tenant', async () => {
      const createDto = {
        branchId: branch2.id, // Branch from tenant2
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`) // Using tenant1 token
        .send(createDto)
        .expect(404);
    });

    it('should set default values when not provided', async () => {
      const createDto = {
        branchId: branch1.id,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${token1}`)
        .send(createDto)
        .expect(201);

      expect(response.body.membershipType).toBe('Basic');
      expect(response.body.status).toBe(MemberStatus.ACTIVE);
      expect(response.body.membershipStartAt).toBeDefined();
      expect(response.body.membershipEndAt).toBeDefined();
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
        membershipStartAt: '2024-12-31',
        membershipEndAt: '2024-01-01',
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
});
