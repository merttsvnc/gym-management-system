/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, closeTestApp } from '../utils/test-app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

describe('Auth: Password Reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const resetSecret = process.env.JWT_RESET_SECRET || 'test_reset_secret';
  const accessSecret = process.env.JWT_ACCESS_SECRET || 'test_access_secret';

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
    await prisma.passwordResetOtp.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  /**
   * Helper to create a reset token for testing
   */
  function createResetToken(userId: string): string {
    const payload = {
      sub: userId,
      type: 'password_reset',
    };
    return jwt.sign(payload, resetSecret, { expiresIn: '15m' });
  }

  /**
   * Helper to create an access token for testing
   */
  function createAccessToken(userId: string, tenantId: string, email: string): string {
    const payload = {
      sub: userId,
      email,
      tenantId,
      role: 'ADMIN',
    };
    return jwt.sign(payload, accessSecret, { expiresIn: '15m' });
  }

  /**
   * Helper to create a user
   */
  async function createUser(email: string, password: string) {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Gym',
        slug: `test-gym-${Date.now()}`,
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
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        tenantId: tenant.id,
      },
    });

    return { user, tenant };
  }

  describe('POST /auth/password-reset/start', () => {
    it('should return ok:true for existing email (anti-enumeration)', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      await createUser(email, password);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/start')
        .send({ email });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        ok: true,
        message: 'Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi.',
      });
    });

    it('should return ok:true for non-existing email (anti-enumeration)', async () => {
      // Arrange
      const email = 'nonexistent@example.com';

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/start')
        .send({ email });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        ok: true,
        message: 'Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi.',
      });
    });

    it('should validate email format', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/start')
        .send({ email: 'invalid-email' });

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/password-reset/verify-otp', () => {
    it('should return resetToken when OTP is correct', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const { user } = await createUser(email, password);

      // Create OTP record manually (simulating what start endpoint does)
      const otpHash = await bcrypt.hash('123456', 10);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      await prisma.passwordResetOtp.create({
        data: {
          userId: user.id,
          otpHash,
          expiresAt,
          attemptCount: 0,
          lastSentAt: new Date(),
          dailySentCount: 1,
          dailySentAt: new Date(),
        },
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/verify-otp')
        .send({
          email,
          code: '123456',
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('resetToken');
      expect(response.body).toHaveProperty('expiresIn', 900);

      // Verify token can be decoded
      const decoded = jwt.verify(response.body.resetToken, resetSecret) as any;
      expect(decoded.sub).toBe(user.id);
      expect(decoded.type).toBe('password_reset');
    });

    it('should return generic error for wrong OTP (anti-enumeration)', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const { user } = await createUser(email, password);

      // Create OTP record
      const otpHash = await bcrypt.hash('123456', 10);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      await prisma.passwordResetOtp.create({
        data: {
          userId: user.id,
          otpHash,
          expiresAt,
          attemptCount: 0,
          lastSentAt: new Date(),
          dailySentCount: 1,
          dailySentAt: new Date(),
        },
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/verify-otp')
        .send({
          email,
          code: '000000', // Wrong code
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'INVALID_OTP');
      expect(response.body.message).toBe('Kod hatalı veya süresi dolmuş');
    });

    it('should return generic error for non-existing email (anti-enumeration)', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/verify-otp')
        .send({
          email: 'nonexistent@example.com',
          code: '123456',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'INVALID_OTP');
      expect(response.body.message).toBe('Kod hatalı veya süresi dolmuş');
    });

    it('should validate code format', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/verify-otp')
        .send({
          email: 'test@example.com',
          code: '12345', // Too short
        });

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/password-reset/complete', () => {
    it('should update passwordHash when resetToken is valid', async () => {
      // Arrange
      const email = 'test@example.com';
      const oldPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';
      const { user } = await createUser(email, oldPassword);
      const resetToken = createResetToken(user.id);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/complete')
        .set('Authorization', `Bearer ${resetToken}`)
        .send({
          newPassword,
          newPasswordConfirm: newPassword,
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ ok: true });

      // Verify password was updated
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser).toBeDefined();
      const isNewPasswordValid = await bcrypt.compare(newPassword, updatedUser!.passwordHash);
      expect(isNewPasswordValid).toBe(true);

      // Verify old password no longer works
      const isOldPasswordValid = await bcrypt.compare(oldPassword, updatedUser!.passwordHash);
      expect(isOldPasswordValid).toBe(false);
    });

    it('should clear password reset OTPs after completion', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const { user } = await createUser(email, password);
      const resetToken = createResetToken(user.id);

      // Create some OTP records
      await prisma.passwordResetOtp.createMany({
        data: [
          {
            userId: user.id,
            otpHash: 'hash1',
            expiresAt: new Date(Date.now() + 600000),
            attemptCount: 0,
            lastSentAt: new Date(),
            dailySentCount: 1,
            dailySentAt: new Date(),
          },
          {
            userId: user.id,
            otpHash: 'hash2',
            expiresAt: new Date(Date.now() + 600000),
            attemptCount: 0,
            lastSentAt: new Date(),
            dailySentCount: 1,
            dailySentAt: new Date(),
          },
        ],
      });

      // Act
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/complete')
        .set('Authorization', `Bearer ${resetToken}`)
        .send({
          newPassword: 'NewPassword456!',
          newPasswordConfirm: 'NewPassword456!',
        });

      // Assert
      const remainingOtps = await prisma.passwordResetOtp.findMany({
        where: { userId: user.id },
      });
      expect(remainingOtps).toHaveLength(0);
    });

    it('should return 401 without Authorization header', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/complete')
        .send({
          newPassword: 'NewPassword456!',
          newPasswordConfirm: 'NewPassword456!',
        });

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return 401 with accessToken instead of resetToken', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const { user, tenant } = await createUser(email, password);
      const accessToken = createAccessToken(user.id, tenant.id, email);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/complete')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          newPassword: 'NewPassword456!',
          newPasswordConfirm: 'NewPassword456!',
        });

      // Assert
      expect(response.status).toBe(401);
    });

    it('should validate password requirements', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const { user } = await createUser(email, password);
      const resetToken = createResetToken(user.id);

      // Act - password too short
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/complete')
        .set('Authorization', `Bearer ${resetToken}`)
        .send({
          newPassword: 'Short1!',
          newPasswordConfirm: 'Short1!',
        });

      // Assert
      expect(response1.status).toBe(400);

      // Act - password doesn't match
      const response2 = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/complete')
        .set('Authorization', `Bearer ${resetToken}`)
        .send({
          newPassword: 'NewPassword456!',
          newPasswordConfirm: 'DifferentPassword789!',
        });

      // Assert
      expect(response2.status).toBe(400);
    });
  });
});
