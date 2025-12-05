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

describe('BranchesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let userId: string;
  let authToken: string;
  let defaultBranchId: string;

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

    // Create test tenant and user
    const { tenant, user } = await createTestTenantAndUser(prisma);
    tenantId = tenant.id;
    userId = user.id;
    authToken = createMockToken({
      userId,
      tenantId,
      email: user.email,
      role: user.role,
    });

    // Create default branch (first branch becomes default)
    // Don't provide name so it generates a unique one
    const defaultBranch = await createTestBranch(prisma, tenantId, {
      address: '123 Main St',
      isDefault: true,
    });
    defaultBranchId = defaultBranch.id;
  });

  afterAll(async () => {
    await cleanupTestData(prisma, [tenantId]);
    await app.close();
  });
  describe('GET /api/v1/branches', () => {
    it('should return branches for current tenant only', async () => {
      // Create another branch
      await createTestBranch(prisma, tenantId, {
        name: 'Second Branch',
        address: '456 Second St',
      });

      return request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.data.length).toBeGreaterThanOrEqual(2);
          // Verify all branches belong to the tenant
          res.body.data.forEach((branch: any) => {
            expect(branch.tenantId).toBe(tenantId);
          });
        });
    });

    it('should respect pagination parameters', async () => {
      return request(app.getHttpServer())
        .get('/api/v1/branches?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.pagination.page).toBe(1);
          expect(res.body.pagination.limit).toBe(1);
          expect(res.body.data.length).toBeLessThanOrEqual(1);
        });
    });

    it('should filter archived branches by default', async () => {
      // Create and archive a branch
      const archivedBranch = await createTestBranch(prisma, tenantId, {
        name: 'Archived Branch',
        address: '789 Archived St',
        isActive: false,
      });

      return request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          const archivedBranchInResults = res.body.data.find(
            (b: any) => b.id === archivedBranch.id,
          );
          expect(archivedBranchInResults).toBeUndefined();
        });
    });

    it('should include archived branches when requested', async () => {
      return request(app.getHttpServer())
        .get('/api/v1/branches?includeArchived=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          const hasArchived = res.body.data.some((b: any) => !b.isActive);
          expect(hasArchived).toBe(true);
        });
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer()).get('/api/v1/branches').expect(401);
    });
  });

  describe('GET /api/v1/branches/:id', () => {
    it('should return branch by ID', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/branches/${defaultBranchId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(defaultBranchId);
          expect(res.body.tenantId).toBe(tenantId);
        });
    });

    it('should return 404 for non-existent branch', () => {
      return request(app.getHttpServer())
        .get('/api/v1/branches/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/branches/${defaultBranchId}`)
        .expect(401);
    });
  });

  describe('POST /api/v1/branches', () => {
    it('should create branch successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Branch',
          address: '999 New St, City, State',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('New Branch');
          expect(res.body.tenantId).toBe(tenantId);
          expect(res.body.isActive).toBe(true);
        });
    });

    it('should set first branch as default', async () => {
      // Create a new tenant with no branches
      const { tenant: newTenant, user: newUser } =
        await createTestTenantAndUser(prisma, {
          tenantName: 'New Tenant',
          tenantSlug: `new-tenant-${Date.now()}`,
        });
      const newToken = createMockToken({
        userId: newUser.id,
        tenantId: newTenant.id,
        email: newUser.email,
        role: newUser.role,
      });

      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${newToken}`)
        .send({
          name: 'First Branch',
          address: '111 First St',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.isDefault).toBe(true);
        });
    });

    it('should return 409 for duplicate branch name within tenant', async () => {
      await createTestBranch(prisma, tenantId, {
        name: 'Duplicate Branch',
        address: '123 Duplicate St',
      });

      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Duplicate Branch',
          address: '456 Different St',
        })
        .expect(409);
    });

    it('should return 400 for invalid name pattern', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid@Branch#Name',
          address: '123 Test St',
        })
        .expect(400);
    });

    it('should return 400 for name too short', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'A',
          address: '123 Test St',
        })
        .expect(400);
    });

    it('should return 400 for address too short', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Valid Branch',
          address: '123',
        })
        .expect(400);
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches')
        .send({
          name: 'Test Branch',
          address: '123 Test St',
        })
        .expect(401);
    });
  });

  describe('PATCH /api/v1/branches/:id', () => {
    let branchId: string;

    beforeEach(async () => {
      // Don't provide name so it generates a unique one for each test
      const branch = await createTestBranch(prisma, tenantId, {
        address: '123 Update St',
      });
      branchId = branch.id;
    });

    it('should update branch successfully', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/branches/${branchId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Branch Name',
          address: '456 Updated St',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Updated Branch Name');
          expect(res.body.address).toBe('456 Updated St');
        });
    });

    it('should update only name', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/branches/${branchId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Only Name Updated',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Only Name Updated');
        });
    });

    it('should return 409 for duplicate name', async () => {
      await createTestBranch(prisma, tenantId, {
        name: 'Existing Branch',
        address: '123 Existing St',
      });

      return request(app.getHttpServer())
        .patch(`/api/v1/branches/${branchId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Existing Branch',
        })
        .expect(409);
    });

    it('should return 400 for archived branch', async () => {
      const archivedBranch = await createTestBranch(prisma, tenantId, {
        name: 'Archived Update Test',
        address: '123 Archived St',
        isActive: false,
      });

      return request(app.getHttpServer())
        .patch(`/api/v1/branches/${archivedBranch.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
        })
        .expect(400);
    });

    it('should return 404 for non-existent branch', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/branches/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
        })
        .expect(404);
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/branches/${branchId}`)
        .send({
          name: 'Updated Name',
        })
        .expect(401);
    });
  });

  describe('POST /api/v1/branches/:id/archive', () => {
    let branchId: string;

    beforeEach(async () => {
      const branch = await createTestBranch(prisma, tenantId, {
        name: `Archive Test Branch ${Date.now()}`,
        address: '123 Archive St',
      });
      branchId = branch.id;
    });

    it('should archive branch successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${branchId}/archive`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isActive).toBe(false);
          expect(res.body.archivedAt).not.toBeNull();
        });
    });

    it('should return 400 when trying to archive default branch', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${defaultBranchId}/archive`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should return 400 when trying to archive last active branch', async () => {
      // Create a tenant with only one branch
      const { tenant: singleBranchTenant, user: singleBranchUser } =
        await createTestTenantAndUser(prisma, {
          tenantName: 'Single Branch Tenant',
          tenantSlug: `single-${Date.now()}`,
        });
      const singleBranch = await createTestBranch(
        prisma,
        singleBranchTenant.id,
        {
          name: 'Only Branch',
          address: '123 Only St',
          isDefault: true,
        },
      );
      const singleToken = createMockToken({
        userId: singleBranchUser.id,
        tenantId: singleBranchTenant.id,
        email: singleBranchUser.email,
        role: singleBranchUser.role,
      });

      return request(app.getHttpServer())
        .post(`/api/v1/branches/${singleBranch.id}/archive`)
        .set('Authorization', `Bearer ${singleToken}`)
        .expect(400);
    });

    it('should return 400 when branch is already archived', async () => {
      const archivedBranch = await createTestBranch(prisma, tenantId, {
        name: `Already Archived ${Date.now()}`,
        address: '123 Archived St',
        isActive: false,
      });

      return request(app.getHttpServer())
        .post(`/api/v1/branches/${archivedBranch.id}/archive`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent branch', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches/non-existent-id/archive')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${branchId}/archive`)
        .expect(401);
    });
  });

  describe('POST /api/v1/branches/:id/restore', () => {
    let archivedBranchId: string;

    beforeEach(async () => {
      const branch = await createTestBranch(prisma, tenantId, {
        name: `Restore Test Branch ${Date.now()}`,
        address: '123 Restore St',
        isActive: false,
      });
      archivedBranchId = branch.id;
    });

    it('should restore archived branch successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${archivedBranchId}/restore`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isActive).toBe(true);
          expect(res.body.archivedAt).toBeNull();
        });
    });

    it('should return 400 when branch is not archived', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${defaultBranchId}/restore`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent branch', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches/non-existent-id/restore')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${archivedBranchId}/restore`)
        .expect(401);
    });
  });

  describe('POST /api/v1/branches/:id/set-default', () => {
    let branchId: string;

    beforeEach(async () => {
      const branch = await createTestBranch(prisma, tenantId, {
        name: `Set Default Test ${Date.now()}`,
        address: '123 Default St',
      });
      branchId = branch.id;
    });

    it('should set branch as default successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${branchId}/set-default`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.isDefault).toBe(true);
        });
    });

    it('should unset previous default branch', async () => {
      // Set new default
      await request(app.getHttpServer())
        .post(`/api/v1/branches/${branchId}/set-default`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify old default is unset
      const response = await request(app.getHttpServer())
        .get(`/api/v1/branches/${defaultBranchId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.isDefault).toBe(false);
    });

    it('should return 400 when trying to set archived branch as default', async () => {
      const archivedBranch = await createTestBranch(prisma, tenantId, {
        name: `Archived Default Test ${Date.now()}`,
        address: '123 Archived St',
        isActive: false,
      });

      return request(app.getHttpServer())
        .post(`/api/v1/branches/${archivedBranch.id}/set-default`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent branch', () => {
      return request(app.getHttpServer())
        .post('/api/v1/branches/non-existent-id/set-default')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/branches/${branchId}/set-default`)
        .expect(401);
    });
  });
});
