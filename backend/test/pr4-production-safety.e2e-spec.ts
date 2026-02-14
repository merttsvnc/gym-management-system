/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/**
 * PR-4 Production Safety E2E tests
 * - Rate limiting on auth endpoints
 * - /health excluded from throttling
 * - Security headers (Helmet)
 */
import helmet from 'helmet';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Create app WITH throttling and helmet (same as production) for PR-4 tests
 */
async function createAppWithThrottling(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.use(
    helmet({
      hidePoweredBy: true,
      noSniff: true,
      frameguard: { action: 'deny' },
      hsts: false,
    }),
  );

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
  return app;
}

describe('PR-4 Production Safety (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createAppWithThrottling();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Helmet security headers', () => {
    it('GET /health should include X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('GET /health should include X-Frame-Options: DENY', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('GET /api/v1/health or root should have security headers', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('Rate limiting', () => {
    it('POST /api/v1/auth/login should return 429 after exceeding limit (10/min)', async () => {
      const loginPayload = {
        email: 'rate-limit-test@example.com',
        password: 'wrongpassword',
      };

      // Make 11 requests - 10 should succeed (or return 401), 11th should be 429
      let lastStatus = 0;
      for (let i = 0; i < 12; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginPayload);
        lastStatus = res.status;
        if (res.status === 429) {
          break;
        }
      }

      expect(lastStatus).toBe(429);
    });

    it('GET /health should NOT be rate limited', async () => {
      // Hit health endpoint many times - all should return 200
      for (let i = 0; i < 15; i++) {
        const res = await request(app.getHttpServer()).get('/health');
        expect(res.status).toBe(200);
      }
    });
  });
});
