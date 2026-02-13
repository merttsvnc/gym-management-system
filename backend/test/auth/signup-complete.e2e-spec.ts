/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

describe('Auth: /auth/signup/complete (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const signupSecret = process.env.JWT_SIGNUP_SECRET || 'test_signup_secret';

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
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  /**
   * Helper to create a signup token for testing
   */
  function createSignupToken(userId: string, email: string): string {
    const payload = {
      sub: userId,
      email: email,
    };
    return jwt.sign(payload, signupSecret, { expiresIn: '15m' });
  }

  /**
   * Helper to create a user with temporary tenant (as created in signupStart)
   */
  async function createTempUser(email: string, password: string) {
    const tempTenant = await prisma.tenant.create({
      data: {
        name: 'Temp',
        slug: `temp-${Date.now()}`,
        planKey: 'SINGLE',
        billingStatus: 'TRIAL',
        defaultCurrency: 'TRY',
      },
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: 'Temp',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        emailVerifiedAt: new Date(),
        tenantId: tempTenant.id,
      },
    });

    return { user, tenant: tempTenant };
  }

  describe('POST /auth/signup/complete', () => {
    describe('Field name compatibility', () => {
      it('should accept tenantName and create tenant with that name', async () => {
        // Arrange
        const email = 'test@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);
        const signupToken = createSignupToken(user.id, email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            tenantName: 'Gym A',
            ownerName: 'John Doe',
          });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.tenant.name).toBe('Gym A');
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('branch');
      });

      it('should accept gymName (alias) and create tenant with that name', async () => {
        // Arrange
        const email = 'test2@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);
        const signupToken = createSignupToken(user.id, email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            gymName: 'Gym B',
            ownerName: 'Jane Smith',
          });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.tenant.name).toBe('Gym B');
        expect(response.body).toHaveProperty('accessToken');
      });

      it('should prefer tenantName over gymName when both are provided', async () => {
        // Arrange
        const email = 'test3@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);
        const signupToken = createSignupToken(user.id, email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            tenantName: 'Preferred Name',
            gymName: 'Ignored Name',
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.tenant.name).toBe('Preferred Name');
      });

      it('should reject if neither tenantName nor gymName is provided', async () => {
        // Arrange
        const email = 'test4@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);
        const signupToken = createSignupToken(user.id, email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Salon adı');
      });
    });

    describe('Security: Authorization header validation', () => {
      it('should reject request without Authorization header', async () => {
        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .send({
            tenantName: 'Gym C',
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(401);
        expect(response.body.message).toContain('Authorization');
      });

      it('should reject request with invalid token format', async () => {
        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', 'InvalidFormat token123')
          .send({
            tenantName: 'Gym C',
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(401);
      });

      it('should reject request with regular access token (not signup token)', async () => {
        // Arrange
        const email = 'test5@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);

        // Create a regular access token (signed with JWT_ACCESS_SECRET, not JWT_SIGNUP_SECRET)
        const accessSecret =
          process.env.JWT_ACCESS_SECRET || 'test_access_secret';
        const accessToken = jwt.sign(
          {
            sub: user.id,
            email: user.email,
            tenantId: user.tenantId,
            role: 'ADMIN',
          },
          accessSecret,
          { expiresIn: '15m' },
        );

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            tenantName: 'Gym C',
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(401);
        expect(response.body.message).toContain('signup token');
      });

      it('should accept valid signup token', async () => {
        // Arrange
        const email = 'test6@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);
        const signupToken = createSignupToken(user.id, email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            tenantName: 'Gym D',
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.tenant.name).toBe('Gym D');
      });
    });

    describe('Dev tenant name handling', () => {
      it('should update tenant created with "Dev Test Tenant" name', async () => {
        // Arrange - Create a tenant with dev name (as created in dev mode)
        const devTenant = await prisma.tenant.create({
          data: {
            name: 'Dev Test Tenant',
            slug: `dev-test-${Date.now()}`,
            planKey: 'SINGLE',
            billingStatus: 'TRIAL',
            defaultCurrency: 'TRY',
          },
        });

        const passwordHash = await bcrypt.hash('password123', 10);
        const user = await prisma.user.create({
          data: {
            email: 'dev@example.com',
            passwordHash,
            firstName: 'Dev',
            lastName: 'User',
            role: 'ADMIN',
            isActive: true,
            emailVerifiedAt: new Date(),
            tenantId: devTenant.id,
          },
        });

        const signupToken = createSignupToken(user.id, user.email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            tenantName: 'Real Gym Name',
            ownerName: 'Real Owner',
          });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.tenant.name).toBe('Real Gym Name');

        // Verify in database
        const updatedTenant = await prisma.tenant.findUnique({
          where: { id: devTenant.id },
        });
        expect(updatedTenant?.name).toBe('Real Gym Name');
      });
    });

    describe('Validation', () => {
      it('should reject tenantName that is too short', async () => {
        // Arrange
        const email = 'test7@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);
        const signupToken = createSignupToken(user.id, email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            tenantName: 'A', // Too short
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(400);
      });

      it('should reject tenantName that is too long', async () => {
        // Arrange
        const email = 'test8@example.com';
        const password = 'SecurePass123!';
        const { user } = await createTempUser(email, password);
        const signupToken = createSignupToken(user.id, email);

        // Act
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/signup/complete')
          .set('Authorization', `Bearer ${signupToken}`)
          .send({
            tenantName: 'A'.repeat(101), // Too long
            ownerName: 'Test User',
          });

        // Assert
        expect(response.status).toBe(400);
      });
    });
  });
});
