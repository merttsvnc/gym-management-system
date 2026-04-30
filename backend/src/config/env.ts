import { z } from 'zod';

const envSchema = z.object({
  // Required
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_SIGNUP_SECRET: z
    .string()
    .min(32, 'JWT_SIGNUP_SECRET must be at least 32 characters'),
  JWT_RESET_SECRET: z
    .string()
    .min(32, 'JWT_RESET_SECRET must be at least 32 characters'),
  REVENUECAT_WEBHOOK_SECRET: z
    .string()
    .min(16, 'REVENUECAT_WEBHOOK_SECRET must be at least 16 characters'),
  REVENUECAT_PREMIUM_ENTITLEMENT_ID: z
    .string()
    .min(1, 'REVENUECAT_PREMIUM_ENTITLEMENT_ID is required'),

  // Optional
  APP_VERSION: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  BILLING_LEGACY_FALLBACK_ENABLED: z.string().optional(),
  REVENUECAT_REPLAY_WINDOW_HOURS: z.coerce.number().int().min(1).optional(),
  /** RevenueCat V1 Secret Key for direct REST API calls (e.g. purchase-sync). Optional. */
  REVENUECAT_V1_API_KEY: z.string().optional(),
  CRON_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  // Auth - conditional validation for production
  AUTH_EMAIL_VERIFICATION_ENABLED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Default when REVENUECAT_REPLAY_WINDOW_HOURS is unset (must match prior process.env fallback). */
export const DEFAULT_REVENUECAT_REPLAY_WINDOW_HOURS = 72;

/**
 * Replay protection window for RevenueCat webhooks (milliseconds).
 * Uses validated env only — do not read process.env directly at call sites.
 */
export function getRevenueCatReplayWindowMs(env: Env): number {
  const hours =
    env.REVENUECAT_REPLAY_WINDOW_HOURS ??
    DEFAULT_REVENUECAT_REPLAY_WINDOW_HOURS;
  return Math.max(1, hours) * 60 * 60 * 1000;
}

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
