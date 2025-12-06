/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import { createTenant, createAdminUser, loginUser } from '../test-helpers';

describe('Plan Limits (e2e)', () => {
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

  describe('Branch Limit Enforcement', () => {
    it('should allow creating branches up to plan limit (SINGLE plan: 3 branches)', async () => {
      // Arrange - Create tenant with SINGLE plan (maxBranches: 3)
      const tenant = await createTenant(prisma, 'Test Gym', 'SINGLE');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken } = await loginUser(app, email, password);

      // Act - Create 3 branches (should all succeed)
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

      const response3 = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 3',
          address: '789 Third Blvd',
        });

      // Assert - All 3 should be created successfully
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response3.status).toBe(201);

      // Verify all branches exist
      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(listResponse.body.pagination.total).toBe(3);
    });

    it('should reject creating branch when plan limit is reached', async () => {
      // Arrange - Create tenant with SINGLE plan (maxBranches: 3)
      const tenant = await createTenant(prisma, 'Test Gym', 'SINGLE');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken } = await loginUser(app, email, password);

      // Create 3 branches (reaching the limit)
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 1', address: '123 St' });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 2', address: '456 Ave' });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 3', address: '789 Blvd' });

      // Act - Try to create 4th branch (should fail)
      const response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 4',
          address: '999 Fourth Dr',
        });

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Plan limit reached');
      expect(response.body.message).toContain('max 3 branches');

      // Verify only 3 branches exist
      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(listResponse.body.pagination.total).toBe(3);
    });

    it('should enforce plan limit per tenant independently', async () => {
      // Arrange - Create two tenants with SINGLE plan
      const tenant1 = await createTenant(prisma, 'Gym One', 'SINGLE');
      const tenant2 = await createTenant(prisma, 'Gym Two', 'SINGLE');

      const user1Email = 'admin@gym1.com';
      const user2Email = 'admin@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      const user1Login = await loginUser(app, user1Email, password);
      const user2Login = await loginUser(app, user2Email, password);

      // Tenant 1: Create 3 branches (reaching limit)
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'T1 Branch 1', address: '123 St' });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'T1 Branch 2', address: '456 Ave' });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'T1 Branch 3', address: '789 Blvd' });

      // Act - Tenant 1: Try to create 4th branch (should fail)
      const tenant1Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`)
        .send({ name: 'T1 Branch 4', address: '999 Dr' });

      // Act - Tenant 2: Create first branch (should succeed)
      const tenant2Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`)
        .send({ name: 'T2 Branch 1', address: '111 Rd' });

      // Assert - Tenant 1 is blocked, Tenant 2 is not
      expect(tenant1Response.status).toBe(403);
      expect(tenant1Response.body.message).toContain('Plan limit reached');

      expect(tenant2Response.status).toBe(201);
      expect(tenant2Response.body.name).toBe('T2 Branch 1');

      // Verify counts
      const tenant1List = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${user1Login.accessToken}`);

      const tenant2List = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${user2Login.accessToken}`);

      expect(tenant1List.body.pagination.total).toBe(3);
      expect(tenant2List.body.pagination.total).toBe(1);
    });

    it('should allow creating branch after deleting one (within limit)', async () => {
      // Arrange - Create tenant with SINGLE plan
      const tenant = await createTenant(prisma, 'Test Gym', 'SINGLE');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken } = await loginUser(app, email, password);

      // Create 3 branches (reaching limit)
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 1', address: '123 St' });

      const branch2Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 2', address: '456 Ave' });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 3', address: '789 Blvd' });

      const branch2Id = branch2Response.body.id;

      // Act - Delete one branch
      await request(app.getHttpServer())
        .delete(`/branches/${branch2Id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      // Act - Try to create a new branch (should succeed now)
      const newBranchResponse = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 4',
          address: '999 New St',
        });

      // Assert
      expect(newBranchResponse.status).toBe(201);
      expect(newBranchResponse.body.name).toBe('Branch 4');

      // Verify count is back to 3
      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(listResponse.body.pagination.total).toBe(3);
    });

    it('should consistently enforce limit across concurrent requests', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym', 'SINGLE');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken } = await loginUser(app, email, password);

      // Create 2 branches first
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 1', address: '123 St' });

      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Branch 2', address: '456 Ave' });

      // Act - Try to create 2 more branches (only 1 should succeed)
      const promises = [
        request(app.getHttpServer())
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Branch 3', address: '789 Blvd' }),
        request(app.getHttpServer())
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Branch 4', address: '999 Dr' }),
      ];

      const results = await Promise.all(promises);

      // Assert - One succeeds (201), one fails (403)
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 403]);

      // Verify final count is exactly 3
      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(listResponse.body.pagination.total).toBe(3);
    });
  });
});
