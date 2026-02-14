import { z } from 'zod';

const envSchema = z.object({
  // Required
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),

  // Optional
  APP_VERSION: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  CRON_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  // Auth - conditional validation for production
  AUTH_EMAIL_VERIFICATION_ENABLED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env on boot. Throws with clear error messages on failure.
 * Never logs secrets.
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${issues}`);
  }

  const env = result.data;

  // Production-only: AUTH_EMAIL_VERIFICATION_ENABLED must be true
  if (env.NODE_ENV === 'production') {
    if (env.AUTH_EMAIL_VERIFICATION_ENABLED !== 'true') {
      throw new Error(
        'FATAL: AUTH_EMAIL_VERIFICATION_ENABLED must be true in production.',
      );
    }
  }

  return env;
}
