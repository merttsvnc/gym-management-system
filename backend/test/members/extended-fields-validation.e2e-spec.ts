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
 * E2E tests for extended member field validation
 * Tests DTO validation for new optional fields
 */
describe('Members Extended Fields Validation (e2e)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
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

  describe('POST /api/v1/members - Extended field validation', () => {
    it('should accept valid marital status enum values', async () => {
      const validStatuses = [
        MaritalStatus.SINGLE,
        MaritalStatus.MARRIED,
        MaritalStatus.DIVORCED,
        MaritalStatus.WIDOWED,
        MaritalStatus.OTHER,
      ];

      for (const status of validStatuses) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            branchId,
            firstName: 'Test',
            lastName: 'User',
            phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            membershipPlanId,
            maritalStatus: status,
          })
          .expect(201);

        expect(response.body.maritalStatus).toBe(status);
      }
    });

    it('should reject invalid marital status', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          maritalStatus: 'INVALID_STATUS',
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('Medeni durum');
    });

    it('should accept valid blood type enum values', async () => {
      const validTypes = [
        BloodType.A_POS,
        BloodType.A_NEG,
        BloodType.B_POS,
        BloodType.B_NEG,
        BloodType.AB_POS,
        BloodType.AB_NEG,
        BloodType.O_POS,
        BloodType.O_NEG,
        BloodType.UNKNOWN,
      ];

      for (const bloodType of validTypes) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            branchId,
            firstName: 'Test',
            lastName: 'User',
            phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            membershipPlanId,
            bloodType,
          })
          .expect(201);

        expect(response.body.bloodType).toBe(bloodType);
      }
    });

    it('should reject invalid blood type', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          bloodType: 'INVALID_TYPE',
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('Kan grubu');
    });

    it('should reject address longer than 500 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          address: 'x'.repeat(501),
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('Adres');
      expect(message).toContain('500');
    });

    it('should reject district longer than 100 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          district: 'x'.repeat(101),
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('İlçe');
      expect(message).toContain('100');
    });

    it('should reject nationalId longer than 20 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          nationalId: 'x'.repeat(21),
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('TC Kimlik No');
      expect(message).toContain('20');
    });

    it('should reject occupation longer than 100 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          occupation: 'x'.repeat(101),
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('Meslek');
      expect(message).toContain('100');
    });

    it('should reject industry longer than 100 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          industry: 'x'.repeat(101),
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('Sektör');
      expect(message).toContain('100');
    });

    it('should reject emergencyContactName longer than 100 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          emergencyContactName: 'x'.repeat(101),
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('Acil durum kişi adı');
      expect(message).toContain('100');
    });

    it('should reject invalid emergencyContactPhone format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Test',
          lastName: 'User',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          emergencyContactPhone: 'invalid-phone',
        })
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message.toLowerCase()).toContain('acil durum telefon');
    });

    it('should accept valid emergencyContactPhone (E.164 format)', async () => {
      const validPhones = ['+1234567890', '+905551234567', '+441234567890'];

      for (const emergencyPhone of validPhones) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            branchId,
            firstName: 'Test',
            lastName: 'User',
            phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            membershipPlanId,
            emergencyContactPhone: emergencyPhone,
          })
          .expect(201);

        expect(response.body.emergencyContactPhone).toBe(emergencyPhone);
      }
    });

    it('should create member with all extended fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'Complete',
          lastName: 'Profile',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          address: '123 Main Street, Apt 4B',
          district: 'Downtown',
          nationalId: '12345678901',
          maritalStatus: MaritalStatus.MARRIED,
          occupation: 'Software Engineer',
          industry: 'Technology',
          bloodType: BloodType.A_POS,
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '+15551234567',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        firstName: 'Complete',
        lastName: 'Profile',
        address: '123 Main Street, Apt 4B',
        district: 'Downtown',
        nationalId: '12345678901',
        maritalStatus: MaritalStatus.MARRIED,
        occupation: 'Software Engineer',
        industry: 'Technology',
        bloodType: BloodType.A_POS,
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+15551234567',
      });
    });
  });

  describe('PATCH /api/v1/members/:id - Extended field updates', () => {
    let memberId: string;

    beforeEach(async () => {
      // Create a member first
      const member = await prisma.member.create({
        data: {
          tenantId,
          branchId,
          firstName: 'Update',
          lastName: 'Test',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          membershipStartDate: new Date(),
          membershipEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });
      memberId = member.id;
    });

    it('should update extended fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: 'Updated Address',
          district: 'Updated District',
          maritalStatus: MaritalStatus.SINGLE,
          bloodType: BloodType.B_NEG,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        address: 'Updated Address',
        district: 'Updated District',
        maritalStatus: MaritalStatus.SINGLE,
        bloodType: BloodType.B_NEG,
      });
    });

    it('should reject invalid extended field values on update', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          maritalStatus: 'INVALID',
        })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          bloodType: 'INVALID',
        })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: 'x'.repeat(501),
        })
        .expect(400);
    });

    it('should clear optional extended fields when set to empty string', async () => {
      // First set some values
      await request(app.getHttpServer())
        .patch(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: 'Some Address',
          district: 'Some District',
          occupation: 'Engineer',
        })
        .expect(200);

      // Now clear them with empty strings
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/members/${memberId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: '',
          district: '',
          occupation: '',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        address: null,
        district: null,
        occupation: null,
      });
    });
  });

  describe('POST /api/v1/members - Empty string normalization', () => {
    it('should convert empty string optional fields to null on create', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId,
          firstName: 'EmptyString',
          lastName: 'Test',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId,
          // Note: email is not included since empty email fails validation
          // Only include optional non-validated string fields
          address: '',
          district: '',
          occupation: '',
          notes: '',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        firstName: 'EmptyString',
        lastName: 'Test',
        address: null,
        district: null,
        occupation: null,
        notes: null,
      });
    });
  });
});
