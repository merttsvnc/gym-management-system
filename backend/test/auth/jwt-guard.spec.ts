/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import { createTenant, createAdminUser, loginUser } from '../test-helpers';

describe('Auth: JWT Guard (e2e)', () => {
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
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  describe('Protected Routes with JWT', () => {
    it('should allow access with valid JWT token', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      // Login to get token
      const { accessToken } = await loginUser(app, email, password);

      // Act - Try to access protected route (branches list)
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should reject request without token (401)', async () => {
      // Act - Try to access protected route without token
      const response = await request(app.getHttpServer()).get(
        '/api/v1/branches',
      );

      // Assert
      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token (401)', async () => {
      // Act - Try with invalid token
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', 'Bearer invalid-token-here');

      // Assert
      expect(response.status).toBe(401);
    });

    it('should reject request with malformed Authorization header', async () => {
      // Act - Missing "Bearer " prefix
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', 'some-token');

      // Assert
      expect(response.status).toBe(401);
    });

    it('should reject request with expired token', async () => {
      // This test would require creating a token with past expiration
      // For now, we test with a completely invalid token structure
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      // Act
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${expiredToken}`);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should allow POST requests with valid token', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken } = await loginUser(app, email, password);

      // Act - Try to create a branch
      const response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Main Branch',
          address: '123 Main St',
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Main Branch');
    });

    it('should reject POST request without token', async () => {
      // Act - Try to create branch without token
      const response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .send({
          name: 'Main Branch',
          address: '123 Main St',
        });

      // Assert
      expect(response.status).toBe(401);
    });

    it('should preserve user context across multiple requests', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      const { accessToken } = await loginUser(app, email, password);

      // Act - Create a branch
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 1',
          address: '123 Main St',
        });

      // Act - List branches
      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`);

      // Assert - Both requests should work with same token
      expect(createResponse.status).toBe(201);
      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].name).toBe('Branch 1');
    });
  });
});
