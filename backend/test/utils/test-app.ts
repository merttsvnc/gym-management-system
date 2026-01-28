import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Create a fully initialized NestJS application for testing
 * Includes all guards, pipes, and middleware from the real app
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider('THROTTLER_OPTIONS')
    .useValue({ throttlers: [] }) // Disable throttler for tests
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true }) // Bypass throttler guard
    .compile();

  const app = moduleFixture.createNestApplication();

  // Apply global pipes (same as main.ts)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Apply global exception filter (same as main.ts)
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();
  return app;
}

/**
 * Close the test application
 */
export async function closeTestApp(app: INestApplication) {
  if (app) {
    await app.close();
  }
}
