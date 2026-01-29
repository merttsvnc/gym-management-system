/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MaritalStatus, BloodType } from '@prisma/client';
import {
  createTestTenantAndUser,
  cleanupTestData,
  createMockToken,
} from '../test-helpers';

/**
 * Production bug verification test
 * Verifies that all 9 extended fields are accepted by POST /api/v1/members
 * with ValidationPipe forbidNonWhitelisted: true (production config)
 */
describe('Members Extended Fields - Production Bug Fix Verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let tenantId: string;
  let branchId: string;
  let membershipPlanId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Use PRODUCTION config: whitelist + forbidNonWhitelisted
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true, // PRODUCTION SETTING
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create test user and tenant
    const { tenant, user } = await createTestTenantAndUser(prisma);
    tenantId = tenant.id;
    authToken = createMockToken({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
    });

    // Create test branch
    const branch = await prisma.branch.create({
      data: {
        tenantId,
        name: 'Test Branch',
        address: '123 Test St',
        isDefault: true,
        isActive: true,
      },
    });
    branchId = branch.id;

    // Create test membership plan
    const plan = await prisma.membershipPlan.create({
      data: {
        tenantId,
        name: 'Test Plan',
        durationType: 'MONTHS',
        durationValue: 1,
        price: 100,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });
    membershipPlanId = plan.id;
  });

  afterAll(async () => {
    await cleanupTestData(prisma, [tenantId]);
    await app.close();
  });

  describe('POST /api/v1/members - All 9 Extended Fields Acceptance', () => {
    it('should accept all 9 extended fields without "should not exist" error', async () => {
      const payload = {
        branchId,
        firstName: 'Test',
        lastName: 'User',
        phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        membershipPlanId,
        // All 9 extended fields that were being rejected
        maritalStatus: MaritalStatus.SINGLE,
        bloodType: BloodType.A_POS,
        address: '123 Main Street, Apt 4B',
        district: 'Downtown',
        nationalId: '12345678901',
        occupation: 'Software Engineer',
        industry: 'Technology',
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+15551234567',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201); // Should succeed, not 400

      // Verify all fields are present in response
      expect(response.body).toMatchObject({
        maritalStatus: MaritalStatus.SINGLE,
        bloodType: BloodType.A_POS,
        address: '123 Main Street, Apt 4B',
        district: 'Downtown',
        nationalId: '12345678901',
        occupation: 'Software Engineer',
        industry: 'Technology',
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+15551234567',
      });

      // Verify no "should not exist" errors (message should be undefined on success)
      if (response.body.message) {
        expect(response.body.message).not.toContain('should not exist');
      }
    });

    it('should reject unknown fields with "should not exist" error', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          unknownField: 'should be rejected', // This should trigger "should not exist"
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message.toLowerCase()).toContain('should not exist');
    });
  });
});
