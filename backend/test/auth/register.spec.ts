/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';

describe('Auth: /auth/register (e2e)', () => {
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
    await prisma.branch.deleteMany();
    await prisma.tenant.deleteMany();
  });

  describe('POST /auth/register', () => {
    it('should register successfully with valid data', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
        branchName: 'Main Branch',
        branchAddress: '123 Main St',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toMatchObject({
        email: registerData.email.toLowerCase().trim(),
        role: 'ADMIN',
      });
      expect(response.body.tenant).toMatchObject({
        name: registerData.tenantName,
        billingStatus: 'TRIAL',
      });
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(0);

      // Verify tenant was created with trial dates
      const tenant = await prisma.tenant.findUnique({
        where: { id: response.body.user.tenantId },
        select: {
          trialStartedAt: true,
          trialEndsAt: true,
          planKey: true,
          billingStatus: true,
        },
      });
      expect(tenant).toBeTruthy();
      expect(tenant?.planKey).toBe('SINGLE');
      expect(tenant?.billingStatus).toBe('TRIAL');
      expect(tenant?.trialStartedAt).toBeTruthy();
      expect(tenant?.trialEndsAt).toBeTruthy();

      // Verify branch was created
      const branch = await prisma.branch.findFirst({
        where: { tenantId: response.body.user.tenantId },
      });
      expect(branch).toBeTruthy();
      expect(branch?.name).toBe(registerData.branchName);
      expect(branch?.isDefault).toBe(true);
      expect(branch?.isActive).toBe(true);

      // Verify user was created
      const user = await prisma.user.findUnique({
        where: { email: registerData.email.toLowerCase().trim() },
      });
      expect(user).toBeTruthy();
      expect(user?.firstName).toBe(registerData.firstName);
      expect(user?.lastName).toBe(registerData.lastName);
      expect(user?.role).toBe('ADMIN');
    });

    it('should use default branch name if not provided', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(201);

      // Verify branch was created with default name
      const branch = await prisma.branch.findFirst({
        where: { tenantId: response.body.user.tenantId },
      });
      expect(branch?.name).toBe('Ana Şube');
    });

    it('should allow empty branch address', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
        branchName: 'Main Branch',
        branchAddress: '',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(201);

      // Verify branch was created with empty address
      const branch = await prisma.branch.findFirst({
        where: { tenantId: response.body.user.tenantId },
      });
      expect(branch?.address).toBe('');
    });

    it('should reject registration with duplicate email', async () => {
      // Arrange - Create existing user
      const email = 'existing@testgym.com';
      const tenant = await prisma.tenant.create({
        data: {
          name: 'Existing Gym',
          slug: `existing-gym-${Date.now()}`,
          defaultCurrency: 'USD',
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash: 'hashed',
          firstName: 'Existing',
          lastName: 'User',
        },
      });

      const registerData = {
        tenantName: 'New Gym',
        email,
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Email already registered');
    });

    it('should reject registration with invalid email format', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'invalid-email',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject registration with password too short', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: 'Short1', // Less than 10 characters
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject registration with password without numbers', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: 'NoNumbersHere', // No numbers
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject registration with password without letters', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: '1234567890', // No letters
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should normalize email to lowercase and trim', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: '  ADMIN@TESTGYM.COM  ',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('admin@testgym.com');

      // Verify user was created with normalized email
      const user = await prisma.user.findUnique({
        where: { email: 'admin@testgym.com' },
      });
      expect(user).toBeTruthy();
    });

    it('should generate unique slug for tenant', async () => {
      // Arrange - Create tenant with same name
      await prisma.tenant.create({
        data: {
          name: 'Test Gym',
          slug: 'test-gym',
          defaultCurrency: 'USD',
        },
      });

      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(201);

      // Verify new tenant has unique slug
      const tenant = await prisma.tenant.findUnique({
        where: { id: response.body.user.tenantId },
        select: { slug: true },
      });
      expect(tenant?.slug).not.toBe('test-gym');
      expect(tenant?.slug).toMatch(/^test-gym-\d+$/);
    });

    it('should set trial period to 7 days', async () => {
      // Arrange
      const registerData = {
        tenantName: 'Test Gym',
        email: 'admin@testgym.com',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const beforeRegister = new Date();

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerData);

      // Assert
      expect(response.status).toBe(201);

      const afterRegister = new Date();
      const tenant = await prisma.tenant.findUnique({
        where: { id: response.body.user.tenantId },
        select: {
          trialStartedAt: true,
          trialEndsAt: true,
        },
      });

      expect(tenant?.trialStartedAt).toBeTruthy();
      expect(tenant?.trialEndsAt).toBeTruthy();

      // Verify trial started at is recent
      const trialStartedAt = new Date(tenant!.trialStartedAt!);
      expect(trialStartedAt.getTime()).toBeGreaterThanOrEqual(
        beforeRegister.getTime(),
      );
      expect(trialStartedAt.getTime()).toBeLessThanOrEqual(
        afterRegister.getTime(),
      );

      // Verify trial ends 7 days after start
      const trialEndsAt = new Date(tenant!.trialEndsAt!);
      const daysDiff =
        (trialEndsAt.getTime() - trialStartedAt.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(7, 0); // Within 1 day tolerance
    });
  });
});
