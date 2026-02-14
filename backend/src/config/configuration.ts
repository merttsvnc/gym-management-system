import { validateEnv } from './env';

/**
 * NestJS ConfigModule factory. Uses validated env from validateEnv().
 * Call validateEnv() in main.ts before bootstrap to fail fast.
 */
export function configuration() {
  // ConfigModule reads from process.env - validation already ran in main.ts
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    databaseUrl: process.env.DATABASE_URL,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    appVersion: process.env.APP_VERSION,
    corsOrigins: process.env.CORS_ORIGINS,
    cronEnabled: process.env.CRON_ENABLED !== 'false',
  };
}

export { validateEnv } from './env';
export type { Env } from './env';
