import 'dotenv/config';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateEnv } from './config/env';

async function bootstrap() {
  // Fail-fast: validate required env vars before any NestJS bootstrap
  validateEnv();

  const app = await NestFactory.create(AppModule);

  // Security headers (before CORS so headers are set correctly)
  app.use(
    helmet({
      hidePoweredBy: true,
      noSniff: true,
      frameguard: { action: 'deny' },
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
    }),
  );

  // Enable CORS for frontend development
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Enable global validation pipe for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Set global API prefix for all routes except:
  // - Root health check endpoint
  // - Health endpoint (GET /health)
  // - Mobile endpoints (already prefixed with 'api/mobile')
  app.setGlobalPrefix('api/v1', {
    exclude: ['', 'health', 'api/mobile/*'],
  });

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
}
void bootstrap();
