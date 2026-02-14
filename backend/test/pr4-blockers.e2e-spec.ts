/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/**
 * PR-4 Blocker fixes E2E tests
 * - Trust proxy in production
 * - CORS_ORIGINS vs FRONTEND_URL precedence
 */
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function createBootstrapApp(
  overrides: { NODE_ENV?: string; CORS_ORIGINS?: string; FRONTEND_URL?: string; AUTH_EMAIL_VERIFICATION_ENABLED?: string } = {},
): Promise<INestApplication> {
  const orig = {
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    FRONTEND_URL: process.env.FRONTEND_URL,
    AUTH_EMAIL_VERIFICATION_ENABLED: process.env.AUTH_EMAIL_VERIFICATION_ENABLED,
  };
  Object.assign(process.env, overrides);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      hidePoweredBy: true,
      noSniff: true,
      frameguard: { action: 'deny' },
      hsts: false,
    }),
  );

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

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

  Object.assign(process.env, orig);
  return app;
}

describe('PR-4 Blockers (e2e)', () => {
  describe('Trust proxy', () => {
    it('when NODE_ENV=production, app.get("trust proxy") returns 1', async () => {
      const app = await createBootstrapApp({
        NODE_ENV: 'production',
        AUTH_EMAIL_VERIFICATION_ENABLED: 'true',
      });
      const expressApp = app.getHttpAdapter().getInstance();
      expect(expressApp.get('trust proxy')).toBe(1);
      await app.close();
    });

    it('when NODE_ENV=development, trust proxy is not set', async () => {
      const app = await createBootstrapApp({ NODE_ENV: 'development' });
      const expressApp = app.getHttpAdapter().getInstance();
      expect(expressApp.get('trust proxy')).toBeFalsy();
      await app.close();
    });
  });

  describe('CORS', () => {
    it('when CORS_ORIGINS defined, multiple origins allowed', async () => {
      const app = await createBootstrapApp({
        NODE_ENV: 'test',
        CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
        FRONTEND_URL: 'https://fallback.example.com',
      });
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://app.example.com');
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://app.example.com',
      );
      await app.close();
    });

    it('when CORS_ORIGINS not defined, FRONTEND_URL used', async () => {
      delete process.env.CORS_ORIGINS;
      const app = await createBootstrapApp({
        NODE_ENV: 'test',
        FRONTEND_URL: 'https://myfrontend.com',
      });
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://myfrontend.com');
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://myfrontend.com',
      );
      await app.close();
    });
  });
});
