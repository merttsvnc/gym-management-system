import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // Production safety check: fail startup if email verification is disabled in production
  const nodeEnv = process.env.NODE_ENV;
  const emailVerificationEnabled =
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED === 'true';

  if (nodeEnv === 'production' && !emailVerificationEnabled) {
    throw new Error(
      'FATAL: AUTH_EMAIL_VERIFICATION_ENABLED must be true in production. Email verification cannot be disabled in production environments.',
    );
  }

  const app = await NestFactory.create(AppModule);

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
  app.useGlobalFilters(new HttpExceptionFilter());

  // Set global API prefix for all routes except:
  // - Root health check endpoint
  // - Mobile endpoints (already prefixed with 'api/mobile')
  app.setGlobalPrefix('api/v1', {
    exclude: ['', 'api/mobile/*'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
