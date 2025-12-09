/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import { createTenant, createAdminUser } from '../test-helpers';

describe('Auth: /auth/login (e2e)', () => {
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
    // Clean up data after each test
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      const password = 'SecurePass123!';
      await createAdminUser(prisma, tenant.id, email, password);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toMatchObject({
        email: email,
        role: 'ADMIN',
        tenantId: tenant.id,
      });
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(0);
    });

    it('should reject login with invalid password', async () => {
      // Arrange
      const tenant = await createTenant(prisma, 'Test Gym');
      const email = 'admin@testgym.com';
      await createAdminUser(prisma, tenant.id, email, 'CorrectPass123!');

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'WrongPassword',
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject login with non-existent user', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject login with missing email', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          password: 'SomePassword123!',
        });

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject login with missing password', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@testgym.com',
        });

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject login with invalid email format', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: 'SomePassword123!',
        });

      // Assert
      expect(response.status).toBe(400);
    });

    it('should return user information with correct tenant isolation', async () => {
      // Arrange
      const tenant1 = await createTenant(prisma, 'Gym One');
      const tenant2 = await createTenant(prisma, 'Gym Two');

      const user1Email = 'admin1@gym1.com';
      const user2Email = 'admin2@gym2.com';
      const password = 'Pass123!';

      await createAdminUser(prisma, tenant1.id, user1Email, password);
      await createAdminUser(prisma, tenant2.id, user2Email, password);

      // Act - Login as user1
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user1Email, password });

      // Act - Login as user2
      const response2 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user2Email, password });

      // Assert - Each user gets their own tenant
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response1.body.user.tenantId).toBe(tenant1.id);
      expect(response2.body.user.tenantId).toBe(tenant2.id);
      expect(response1.body.user.tenantId).not.toBe(
        response2.body.user.tenantId,
      );
    });
  });
});
