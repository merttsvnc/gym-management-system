import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import { createTenant, createAdminUser, createUserWithRole, loginUser } from '../test-helpers';

describe('Auth: CurrentUser Decorator (e2e)', () => {
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

  describe('@CurrentUser() decorator', () => {
    it('should extract correct user.sub (user ID) from JWT', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      const user = await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken, userId } = await loginUser(app, email, password);

      // Act - Create a branch (uses @CurrentUser internally)
      const response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Main Branch',
          address: '123 Main St',
        });

      // Assert - Branch should be created with correct user context
      expect(response.status).toBe(201);
      expect(response.body.tenantId).toBe(tenant.id);
      
      // Verify the userId matches
      expect(userId).toBe(user.id);
    });

    it('should extract correct tenantId from JWT via @CurrentUser', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken, tenantId } = await loginUser(app, email, password);

      // Act - Create multiple branches
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 1',
          address: '123 First St',
        });

      const response2 = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 2',
          address: '456 Second Ave',
        });

      // Assert - Both branches should have correct tenantId
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response1.body.tenantId).toBe(tenant.id);
      expect(response2.body.tenantId).toBe(tenant.id);
      expect(tenantId).toBe(tenant.id);
    });

    it('should provide different user context for different authenticated users', async () => {
      // Arrange - Create two users in same tenant
      const tenant = await createTenant(prisma, 'Test Gym');
      
      const admin1Email = 'admin1@testgym.com';
      const admin2Email = 'admin2@testgym.com';
      const password = 'Pass123!';
      
      const user1 = await createAdminUser(prisma, tenant.id, admin1Email, password);
      const user2 = await createAdminUser(prisma, tenant.id, admin2Email, password);

      const user1Login = await loginUser(app, admin1Email, password);
      const user2Login = await loginUser(app, admin2Email, password);

      // Assert - Each login should return correct user ID
      expect(user1Login.userId).toBe(user1.id);
      expect(user2Login.userId).toBe(user2.id);
      expect(user1Login.userId).not.toBe(user2Login.userId);
      
      // Both users should have same tenantId
      expect(user1Login.tenantId).toBe(tenant.id);
      expect(user2Login.tenantId).toBe(tenant.id);
    });

    it('should extract role from JWT for authorization', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      
      const admin1Email = 'admin1@testgym.com';
      const admin2Email = 'admin2@testgym.com';
      const password = 'Pass123!';
      
      await createUserWithRole(prisma, tenant.id, admin1Email, 'ADMIN', password);
      await createUserWithRole(prisma, tenant.id, admin2Email, 'ADMIN', password);

      const admin1Login = await loginUser(app, admin1Email, password);
      const admin2Login = await loginUser(app, admin2Email, password);

      // Act - Both admins should be able to create branches
      const admin1Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${admin1Login.accessToken}`)
        .send({
          name: 'Admin 1 Branch',
          address: '123 Admin St',
        });

      const admin2Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${admin2Login.accessToken}`)
        .send({
          name: 'Admin 2 Branch',
          address: '456 Admin Ave',
        });

      // Assert - Role information is correctly used (both are ADMIN)
      expect(admin1Response.status).toBe(201);
      expect(admin2Response.status).toBe(201);
    });

    it('should maintain user context across multiple requests in same session', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken, tenantId } = await loginUser(app, email, password);

      // Act - Perform multiple operations with same token
      const createResponse1 = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 1', address: '123 St' });

      const createResponse2 = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 2', address: '456 Ave' });

      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`);

      const branch1Id = createResponse1.body.id;
      const getResponse = await request(app.getHttpServer())
        .get(`/branches/${branch1Id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      // Assert - All operations use consistent user context
      expect(createResponse1.body.tenantId).toBe(tenantId);
      expect(createResponse2.body.tenantId).toBe(tenantId);
      expect(listResponse.body.data).toHaveLength(2);
      expect(getResponse.body.tenantId).toBe(tenantId);
      
      // All branches belong to same tenant
      listResponse.body.data.forEach((branch: any) => {
        expect(branch.tenantId).toBe(tenantId);
      });
    });

    it('should handle user context correctly for different tenants', async () => {
      // Arrange - Create two separate tenants with users
      const tenant1 = await createTenant(prisma, 'Gym One');
      const tenant2 = await createTenant(prisma, 'Gym Two');

      const user1Email = 'admin@gym1.com';
      const user2Email = 'admin@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      const user1Login = await loginUser(app, user1Email, password);
      const user2Login = await loginUser(app, user2Email, password);

      // Act - Create branches for each user
      const branch1Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'Gym One Branch', address: '123 St' });

      const branch2Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`)
        .send({ name: 'Gym Two Branch', address: '456 Ave' });

      // Assert - Each branch has correct tenant context
      expect(branch1Response.status).toBe(201);
      expect(branch2Response.status).toBe(201);
      expect(branch1Response.body.tenantId).toBe(tenant1.id);
      expect(branch2Response.body.tenantId).toBe(tenant2.id);
      expect(branch1Response.body.tenantId).not.toBe(branch2Response.body.tenantId);
    });

    it('should not leak user context between different authenticated requests', async () => {
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

      // Act - Create branch with user1
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'User 1 Branch', address: '123 St' });

      // Act - User 2 lists branches (should not see user 1's branch)
      const user2List = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`);

      // Assert - User 2 sees no branches (perfect isolation)
      expect(user2List.status).toBe(200);
      expect(user2List.body.data).toHaveLength(0);
      expect(user2List.body.pagination.total).toBe(0);
    });
  });
});
