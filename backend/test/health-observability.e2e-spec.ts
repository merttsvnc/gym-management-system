/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PR-3 Observability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('THROTTLER_OPTIONS')
      .useValue({ throttlers: [] })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix('api/v1', {
      exclude: ['', 'health', 'api/mobile/*'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 with db:ok when Prisma check resolves', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(res.body).toMatchObject({
        status: 'ok',
        db: 'ok',
      });
      expect(res.body).toHaveProperty('timestamp');
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('should return 503 with db:down when Prisma check fails', async () => {
      // Create a separate app with mocked Prisma that rejects
      const failingPrisma = {
        $queryRaw: () => Promise.reject(new Error('DB unavailable')),
      };
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue(failingPrisma)
        .overrideProvider('THROTTLER_OPTIONS')
        .useValue({ throttlers: [] })
        .compile();

      const failingApp = moduleFixture.createNestApplication();
      failingApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      failingApp.useGlobalFilters(new AllExceptionsFilter());
      failingApp.setGlobalPrefix('api/v1', {
        exclude: ['', 'health', 'api/mobile/*'],
      });
      await failingApp.init();

      const res = await request(failingApp.getHttpServer())
        .get('/health')
        .expect(503);

      expect(res.body).toMatchObject({
        status: 'degraded',
        db: 'down',
      });
      expect(res.body).toHaveProperty('timestamp');

      await failingApp.close();
    });
  });

  describe('X-Request-Id header', () => {
    it('should include X-Request-Id in response headers', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });

    it('should reuse incoming X-Request-Id when provided', async () => {
      const incomingId = 'test-request-id-12345';
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('X-Request-Id', incomingId);

      expect(res.headers['x-request-id']).toBe(incomingId);
    });
  });

  describe('Exception filter requestId', () => {
    it('should include requestId in error response payload for 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/nonexistent-route-xyz')
        .expect(404);

      expect(res.body).toHaveProperty('requestId');
      expect(typeof res.body.requestId).toBe('string');
      expect(res.body.requestId.length).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
    });
  });
});
