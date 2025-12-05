/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createMockToken,
  createTestTenantAndUser,
  cleanupTestData,
} from './test-helpers';

describe('TenantsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let userId: string;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Apply same global pipes and filters as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    // Create test tenant and user
    const { tenant, user } = await createTestTenantAndUser(prisma);
    tenantId = tenant.id;
    userId = user.id;
    authToken = createMockToken({
      userId,
      tenantId,
      email: user.email,
      role: user.role,
    });
  });

  afterAll(async () => {
    await cleanupTestData(prisma, [tenantId]);
    await app.close();
  });

  describe('GET /api/v1/tenants/current', () => {
    it('should return current tenant for authenticated user', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', tenantId);
          expect(res.body).toHaveProperty('name');
          expect(res.body).toHaveProperty('slug');
          expect(res.body).toHaveProperty('defaultCurrency');
        });
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tenants/current')
        .expect(401);
    });

    it('should return 401 with invalid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tenants/current')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('PATCH /api/v1/tenants/current', () => {
    it('should update tenant name successfully', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Gym Name' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Updated Gym Name');
        });
    });

    it('should update default currency successfully', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ defaultCurrency: 'EUR' })
        .expect(200)
        .expect((res) => {
          expect(res.body.defaultCurrency).toBe('EUR');
        });
    });

    it('should update both name and currency', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Final Gym Name', defaultCurrency: 'GBP' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Final Gym Name');
          expect(res.body.defaultCurrency).toBe('GBP');
        });
    });

    it('should return 400 for invalid currency code', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ defaultCurrency: 'INVALID' })
        .expect(400);
    });

    it('should return 400 for name too short', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'AB' })
        .expect(400);
    });

    it('should return 400 for name too long', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'A'.repeat(101) })
        .expect(400);
    });

    it('should return 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .send({ name: 'Test' })
        .expect(401);
    });

    it('should return 400 when no fields provided', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });
  });
});
