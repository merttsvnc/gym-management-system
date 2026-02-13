import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createTestTenantAndUser,
  cleanupTestData,
  createMockToken,
} from '../test-helpers';
import { StorageService } from '../../src/storage/interfaces/storage-service.interface';

describe('Upload Member Photo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let tenantId: string;
  let branchId: string;
  let membershipPlanId: string;
  let memberId: string;
  let mockStorageService: jest.Mocked<StorageService>;

  beforeAll(async () => {
    // Create mock storage service
    mockStorageService = {
      upload: jest.fn().mockResolvedValue('https://example.com/photo.jpg'),
    } as jest.Mocked<StorageService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('StorageService')
      .useValue(mockStorageService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Apply same global prefix as main.ts
    app.setGlobalPrefix('api/v1', {
      exclude: ['', 'api/mobile/*'],
    });

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

    // Create test member
    const member = await prisma.member.create({
      data: {
        tenantId,
        branchId,
        firstName: 'Test',
        lastName: 'Member',
        phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        membershipPlanId,
        membershipStartDate: new Date(),
        membershipEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    memberId = member.id;
  });

  afterAll(async () => {
    await cleanupTestData(prisma, [tenantId]);
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/uploads/member-photo', () => {
    it('should upload photo successfully', async () => {
      const fileBuffer = Buffer.from('fake image content');
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'test.jpg')
        .expect(200);

      expect(response.body).toHaveProperty('url');
      expect(response.body.url).toBe('https://example.com/photo.jpg');
      expect(mockStorageService.upload).toHaveBeenCalledTimes(1);
    });

    it('should upload photo with memberId', async () => {
      const fileBuffer = Buffer.from('fake image content');
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .set('Authorization', `Bearer ${authToken}`)
        .field('memberId', memberId)
        .attach('file', fileBuffer, 'test.jpg')
        .expect(200);

      expect(response.body).toHaveProperty('url');
      expect(mockStorageService.upload).toHaveBeenCalledTimes(1);

      // Verify upload was called with correct key format
      const uploadCall = mockStorageService.upload.mock.calls[0];
      expect(uploadCall[1]).toMatch(/^tenants\/.+\/members\/.+\/.+\.jpg$/);
    });

    it('should reject invalid file type', async () => {
      const fileBuffer = Buffer.from('fake pdf content');
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'test.pdf')
        .expect(400);

      expect(response.body.message).toContain('Invalid file type');
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should reject file exceeding size limit', async () => {
      // Create a buffer larger than 2MB
      const fileBuffer = Buffer.alloc(3 * 1024 * 1024);
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'test.jpg')
        .expect(400);

      expect(response.body.message).toContain('File size exceeds');
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should reject request without file', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.message).toContain('File is required');
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should reject invalid memberId', async () => {
      const fileBuffer = Buffer.from('fake image content');
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .set('Authorization', `Bearer ${authToken}`)
        .field('memberId', 'invalid-uuid')
        .attach('file', fileBuffer, 'test.jpg')
        .expect(400);

      expect(response.body.message).toBeDefined();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should reject memberId that does not belong to tenant', async () => {
      // Create another tenant and member
      const { tenant: otherTenant } = await createTestTenantAndUser(prisma);
      const otherBranch = await prisma.branch.create({
        data: {
          tenantId: otherTenant.id,
          name: 'Other Branch',
          address: '456 Other St',
          isDefault: true,
          isActive: true,
        },
      });
      const otherPlan = await prisma.membershipPlan.create({
        data: {
          tenantId: otherTenant.id,
          name: 'Other Plan',
          durationType: 'MONTHS',
          durationValue: 1,
          price: 100,
          currency: 'USD',
          status: 'ACTIVE',
        },
      });
      const otherMember = await prisma.member.create({
        data: {
          tenantId: otherTenant.id,
          branchId: otherBranch.id,
          firstName: 'Other',
          lastName: 'Member',
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          membershipPlanId: otherPlan.id,
          membershipStartDate: new Date(),
          membershipEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const fileBuffer = Buffer.from('fake image content');
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .set('Authorization', `Bearer ${authToken}`)
        .field('memberId', otherMember.id)
        .attach('file', fileBuffer, 'test.jpg')
        .expect(400);

      expect(response.body.message).toContain('does not belong to your tenant');
      expect(mockStorageService.upload).not.toHaveBeenCalled();

      // Cleanup
      await cleanupTestData(prisma, [otherTenant.id]);
    });

    it('should require authentication', async () => {
      const fileBuffer = Buffer.from('fake image content');
      await request(app.getHttpServer())
        .post('/api/v1/uploads/member-photo')
        .attach('file', fileBuffer, 'test.jpg')
        .expect(401);
    });
  });
});
