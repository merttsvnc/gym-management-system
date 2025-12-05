/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createMockToken,
  createTestTenantAndUser,
  createTestBranch,
  cleanupTestData,
} from './test-helpers';

describe('Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tenant A data
  let tenantAId: string;
  let userAId: string;
  let tokenA: string;
  let branchAId: string;

  // Tenant B data
  let tenantBId: string;
  let userBId: string;
  let tokenB: string;
  let branchBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    // Create Tenant A with user and branch
    const { tenant: tenantA, user: userA } = await createTestTenantAndUser(
      prisma,
      {
        tenantName: 'Tenant A Gym',
        tenantSlug: `tenant-a-${Date.now()}`,
        userEmail: `user-a-${Date.now()}@example.com`,
      },
    );
    tenantAId = tenantA.id;
    userAId = userA.id;
    tokenA = createMockToken({
      userId: userAId,
      tenantId: tenantAId,
      email: userA.email,
      role: userA.role,
    });

    const branchA = await createTestBranch(prisma, tenantAId, {
      name: 'Tenant A Branch',
      address: '123 Tenant A St',
      isDefault: true,
    });
    branchAId = branchA.id;

    // Create Tenant B with user and branch
    const { tenant: tenantB, user: userB } = await createTestTenantAndUser(
      prisma,
      {
        tenantName: 'Tenant B Gym',
        tenantSlug: `tenant-b-${Date.now()}`,
        userEmail: `user-b-${Date.now()}@example.com`,
      },
    );
    tenantBId = tenantB.id;
    userBId = userB.id;
    tokenB = createMockToken({
      userId: userBId,
      tenantId: tenantBId,
      email: userB.email,
      role: userB.role,
    });

    const branchB = await createTestBranch(prisma, tenantBId, {
      name: 'Tenant B Branch',
      address: '456 Tenant B St',
      isDefault: true,
    });
    branchBId = branchB.id;
  });

  afterAll(async () => {
    await cleanupTestData(prisma, [tenantAId, tenantBId]);
    await app.close();
  });

  describe('GET /api/v1/branches - Tenant Isolation', () => {
    it('should return only Tenant A branches for Tenant A user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((branch: any) => {
        expect(branch.tenantId).toBe(tenantAId);
        expect(branch.tenantId).not.toBe(tenantBId);
      });
    });

    it('should return only Tenant B branches for Tenant B user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((branch: any) => {
        expect(branch.tenantId).toBe(tenantBId);
        expect(branch.tenantId).not.toBe(tenantAId);
      });
    });
  });

  describe('GET /api/v1/branches/:id - Cross-Tenant Access Prevention', () => {
    it('should return 404 when Tenant A user tries to access Tenant B branch', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/branches/${branchBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should return 404 when Tenant B user tries to access Tenant A branch', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/branches/${branchAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('should allow Tenant A user to access their own branch', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/branches/${branchAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(branchAId);
          expect(res.body.tenantId).toBe(tenantAId);
        });
    });
  });

  describe('PATCH /api/v1/branches/:id - Cross-Tenant Update Prevention', () => {
    it('should return 404 when Tenant A user tries to update Tenant B branch', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/branches/${branchBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hacked Name' })
        .expect(404);
    });

    it('should allow Tenant A user to update their own branch', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/branches/${branchAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Updated Tenant A Branch' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Updated Tenant A Branch');
          expect(res.body.tenantId).toBe(tenantAId);
        });
    });
  });

  describe('POST /api/v1/branches/:id/archive - Cross-Tenant Archive Prevention', () => {
    let tenantABranchId: string;
    let tenantBBranchId: string;

    beforeEach(async () => {
      // Create additional branches for each tenant
      const branchA = await createTestBranch(prisma, tenantAId, {
        name: `Tenant A Archive Test ${Date.now()}`,
        address: '123 Archive A St',
      });
      tenantABranchId = branchA.id;

      const branchB = await createTestBranch(prisma, tenantBId, {
        name: `Tenant B Archive Test ${Date.now()}`,
        address: '456 Archive B St',
      });
      tenantBBranchId = branchB.id;
    });

    it('should return 404 when Tenant A user tries to archive Tenant B branch', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${tenantBBranchId}/archive`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should allow Tenant A user to archive their own branch', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${tenantABranchId}/archive`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isActive).toBe(false);
          expect(res.body.tenantId).toBe(tenantAId);
        });
    });
  });

  describe('POST /api/v1/branches/:id/restore - Cross-Tenant Restore Prevention', () => {
    let tenantAArchivedBranchId: string;
    let tenantBArchivedBranchId: string;

    beforeEach(async () => {
      // Create archived branches for each tenant
      const branchA = await createTestBranch(prisma, tenantAId, {
        name: `Tenant A Restore Test ${Date.now()}`,
        address: '123 Restore A St',
        isActive: false,
      });
      tenantAArchivedBranchId = branchA.id;

      const branchB = await createTestBranch(prisma, tenantBId, {
        name: `Tenant B Restore Test ${Date.now()}`,
        address: '456 Restore B St',
        isActive: false,
      });
      tenantBArchivedBranchId = branchB.id;
    });

    it('should return 404 when Tenant A user tries to restore Tenant B branch', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${tenantBArchivedBranchId}/restore`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should allow Tenant A user to restore their own branch', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${tenantAArchivedBranchId}/restore`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isActive).toBe(true);
          expect(res.body.tenantId).toBe(tenantAId);
        });
    });
  });

  describe('POST /api/v1/branches/:id/set-default - Cross-Tenant Default Prevention', () => {
    let tenantABranchId: string;
    let tenantBBranchId: string;

    beforeEach(async () => {
      const branchA = await createTestBranch(prisma, tenantAId, {
        name: `Tenant A Default Test ${Date.now()}`,
        address: '123 Default A St',
      });
      tenantABranchId = branchA.id;

      const branchB = await createTestBranch(prisma, tenantBId, {
        name: `Tenant B Default Test ${Date.now()}`,
        address: '456 Default B St',
      });
      tenantBBranchId = branchB.id;
    });

    it('should return 404 when Tenant A user tries to set Tenant B branch as default', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${tenantBBranchId}/set-default`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should allow Tenant A user to set their own branch as default', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${tenantABranchId}/set-default`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isDefault).toBe(true);
          expect(res.body.tenantId).toBe(tenantAId);
        });
    });
  });

  describe('POST /api/v1/branches - Branch Creation Isolation', () => {
    it('should create branch for Tenant A when using Tenant A token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: `Tenant A New Branch ${Date.now()}`,
          address: '789 New A St',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.tenantId).toBe(tenantAId);
          expect(res.body.tenantId).not.toBe(tenantBId);
        });
    });

    it('should create branch for Tenant B when using Tenant B token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: `Tenant B New Branch ${Date.now()}`,
          address: '999 New B St',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.tenantId).toBe(tenantBId);
          expect(res.body.tenantId).not.toBe(tenantAId);
        });
    });

    it('should allow same branch name across different tenants', async () => {
      const branchName = `Shared Name ${Date.now()}`;

      // Create branch for Tenant A
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: branchName,
          address: '123 Shared St',
        })
        .expect(201);

      // Should be able to create same name for Tenant B
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: branchName,
          address: '456 Shared St',
        })
        .expect(201);
    });
  });

  describe('GET /api/v1/tenants/current - Tenant Data Isolation', () => {
    it('should return Tenant A data for Tenant A user', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(tenantAId);
          expect(res.body.id).not.toBe(tenantBId);
        });
    });

    it('should return Tenant B data for Tenant B user', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(tenantBId);
          expect(res.body.id).not.toBe(tenantAId);
        });
    });
  });

  describe('PATCH /api/v1/tenants/current - Tenant Update Isolation', () => {
    it('should update Tenant A when using Tenant A token', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Updated Tenant A Name' })
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(tenantAId);
          expect(res.body.name).toBe('Updated Tenant A Name');
        });
    });

    it('should not affect Tenant B when updating Tenant A', async () => {
      // Update Tenant A
      await request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Tenant A Updated' })
        .expect(200);

      // Verify Tenant B is unchanged
      const response = await request(app.getHttpServer())
        .get('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(response.body.name).not.toBe('Tenant A Updated');
    });
  });
});
