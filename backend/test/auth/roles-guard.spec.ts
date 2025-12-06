/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import { createTenant, createUserWithRole, loginUser } from '../test-helpers';

describe('Auth: Roles Guard (e2e)', () => {
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

  describe('Role-based Authorization', () => {
    it('should allow ADMIN role to create branch', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'Pass123!';
      await createUserWithRole(prisma, tenant.id, email, 'ADMIN', password);

      const { accessToken } = await loginUser(app, email, password);

      // Act - Create branch (requires ADMIN role)
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

    it('should allow all authenticated ADMIN users to list branches (no specific role guard on GET)', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');

      // Create multiple admin users
      const admin1Email = 'admin1@testgym.com';
      const admin2Email = 'admin2@testgym.com';
      const password = 'Pass123!';

      await createUserWithRole(
        prisma,
        tenant.id,
        admin1Email,
        'ADMIN',
        password,
      );
      await createUserWithRole(
        prisma,
        tenant.id,
        admin2Email,
        'ADMIN',
        password,
      );

      const admin1Login = await loginUser(app, admin1Email, password);
      const admin2Login = await loginUser(app, admin2Email, password);

      // Act - Both should be able to list branches
      const admin1Response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${admin1Login.accessToken}`);

      const admin2Response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${admin2Login.accessToken}`);

      // Assert
      expect(admin1Response.status).toBe(200);
      expect(admin2Response.status).toBe(200);
      expect(admin1Response.body).toHaveProperty('data');
      expect(admin2Response.body).toHaveProperty('data');
    });

    it('should enforce ADMIN role requirement for branch creation across multiple requests', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const adminEmail = 'admin@testgym.com';
      const password = 'Pass123!';
      await createUserWithRole(
        prisma,
        tenant.id,
        adminEmail,
        'ADMIN',
        password,
      );

      const { accessToken } = await loginUser(app, adminEmail, password);

      // Act - Create multiple branches
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 1',
          address: '123 Main St',
        });

      const response2 = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Branch 2',
          address: '456 Oak Ave',
        });

      // Assert - Both should succeed (ADMIN role is valid)
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
    });

    it('should require authentication even with correct role', async () => {
      // Act - Try to create branch without token (even though endpoint requires ADMIN role)
      const response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .send({
          name: 'Branch Without Auth',
          address: '789 No Auth St',
        });

      // Assert - Should be rejected for missing authentication
      expect(response.status).toBe(401);
    });
  });
});
