import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import { createTenant, createAdminUser, loginUser } from '../test-helpers';

describe('Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await closeTestApp(app);
  });

  afterEach(async () => {
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  describe('Branch Isolation Between Tenants', () => {
    it('should allow each tenant to create their own branches', async () => {
      // Arrange - Create two separate tenants
      const tenant1 = await createTenant(prisma, 'Gym One');
      const tenant2 = await createTenant(prisma, 'Gym Two');

      const user1Email = 'admin@gym1.com';
      const user2Email = 'admin@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      const user1Login = await loginUser(app, user1Email, password);
      const user2Login = await loginUser(app, user2Email, password);

      // Act - Create branches for each tenant
      const branch1Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({
          name: 'Gym One Main Branch',
          address: '123 First St',
        });

      const branch2Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`)
        .send({
          name: 'Gym Two Main Branch',
          address: '456 Second Ave',
        });

      // Assert
      expect(branch1Response.status).toBe(201);
      expect(branch2Response.status).toBe(201);
      expect(branch1Response.body.tenantId).toBe(tenant1.id);
      expect(branch2Response.body.tenantId).toBe(tenant2.id);
    });

    it('should only show branches belonging to the authenticated user\'s tenant', async () => {
      // Arrange - Create two tenants with branches
      const tenant1 = await createTenant(prisma, 'Gym One');
      const tenant2 = await createTenant(prisma, 'Gym Two');

      const user1Email = 'admin@gym1.com';
      const user2Email = 'admin@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      const user1Login = await loginUser(app, user1Email, password);
      const user2Login = await loginUser(app, user2Email, password);

      // Create branches for tenant 1
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({
          name: 'Gym One Branch A',
          address: '123 First St',
        });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({
          name: 'Gym One Branch B',
          address: '789 Third Blvd',
        });

      // Create branch for tenant 2
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`)
        .send({
          name: 'Gym Two Branch A',
          address: '456 Second Ave',
        });

      // Act - List branches for each tenant
      const tenant1List = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`);

      const tenant2List = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`);

      // Assert - Each tenant sees only their own branches
      expect(tenant1List.status).toBe(200);
      expect(tenant2List.status).toBe(200);

      expect(tenant1List.body.data).toHaveLength(2);
      expect(tenant2List.body.data).toHaveLength(1);

      // Verify tenant 1 sees only their branches
      const tenant1BranchNames = tenant1List.body.data.map((b: any) => b.name);
      expect(tenant1BranchNames).toContain('Gym One Branch A');
      expect(tenant1BranchNames).toContain('Gym One Branch B');
      expect(tenant1BranchNames).not.toContain('Gym Two Branch A');

      // Verify tenant 2 sees only their branches
      const tenant2BranchNames = tenant2List.body.data.map((b: any) => b.name);
      expect(tenant2BranchNames).toContain('Gym Two Branch A');
      expect(tenant2BranchNames).not.toContain('Gym One Branch A');
      expect(tenant2BranchNames).not.toContain('Gym One Branch B');
    });

    it('should prevent tenant from accessing another tenant\'s branch by ID', async () => {
      // Arrange
      const tenant1 = await createTenant(prisma, 'Gym One');
      const tenant2 = await createTenant(prisma, 'Gym Two');

      const user1Email = 'admin@gym1.com';
      const user2Email = 'admin@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      const user1Login = await loginUser(app, user1Email, password);
      const user2Login = await loginUser(app, user2Email, password);

      // Tenant 1 creates a branch
      const branch1Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({
          name: 'Gym One Private Branch',
          address: '123 First St',
        });

      const branch1Id = branch1Response.body.id;

      // Act - Tenant 2 tries to access Tenant 1's branch
      const unauthorizedAccess = await request(app.getHttpServer())
        .get(`/branches/${branch1Id}`)
        .set('Authorization', `Bearer ${user2Login.accessToken}`);

      // Assert - Should get 404 (not found, to hide existence)
      expect(unauthorizedAccess.status).toBe(404);
    });

    it('should prevent tenant from updating another tenant\'s branch', async () => {
      // Arrange
      const tenant1 = await createTenant(prisma, 'Gym One');
      const tenant2 = await createTenant(prisma, 'Gym Two');

      const user1Email = 'admin@gym1.com';
      const user2Email = 'admin@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      const user1Login = await loginUser(app, user1Email, password);
      const user2Login = await loginUser(app, user2Email, password);

      // Tenant 1 creates a branch
      const branch1Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({
          name: 'Gym One Branch',
          address: '123 First St',
        });

      const branch1Id = branch1Response.body.id;

      // Act - Tenant 2 tries to update Tenant 1's branch
      const updateResponse = await request(app.getHttpServer())
        .patch(`/branches/${branch1Id}`)
        .set('Authorization', `Bearer ${user2Login.accessToken}`)
        .send({
          name: 'Hacked Name',
        });

      // Assert - Should be rejected
      expect(updateResponse.status).toBe(404);

      // Verify original branch is unchanged
      const verifyResponse = await request(app.getHttpServer())
        .get(`/branches/${branch1Id}`)
        .set('Authorization', `Bearer ${user1Login.accessToken}`);

      expect(verifyResponse.body.name).toBe('Gym One Branch');
    });

    it('should maintain tenant isolation across multiple operations', async () => {
      // Arrange
      const tenant1 = await createTenant(prisma, 'Gym One');
      const tenant2 = await createTenant(prisma, 'Gym Two');

      const user1Email = 'admin@gym1.com';
      const user2Email = 'admin@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      const user1Login = await loginUser(app, user1Email, password);
      const user2Login = await loginUser(app, user2Email, password);

      // Act - Perform multiple operations
      // Tenant 1: Create 2 branches
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'T1 Branch 1', address: '123 St' });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'T1 Branch 2', address: '456 St' });

      // Tenant 2: Create 1 branch
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`)
        .send({ name: 'T2 Branch 1', address: '789 Ave' });

      // Get final counts
      const tenant1Branches = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`);

      const tenant2Branches = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`);

      // Assert - Perfect isolation maintained
      expect(tenant1Branches.body.pagination.total).toBe(2);
      expect(tenant2Branches.body.pagination.total).toBe(1);

      // Verify all branches have correct tenant IDs
      tenant1Branches.body.data.forEach((branch: any) => {
        expect(branch.tenantId).toBe(tenant1.id);
      });

      tenant2Branches.body.data.forEach((branch: any) => {
        expect(branch.tenantId).toBe(tenant2.id);
      });
    });
  });
});
