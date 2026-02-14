import { validateEnv } from './env';

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set minimum required for valid env
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw when JWT_ACCESS_SECRET is missing', () => {
    delete process.env.JWT_ACCESS_SECRET;

    expect(() => validateEnv()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('should throw when JWT_ACCESS_SECRET is too short', () => {
    process.env.JWT_ACCESS_SECRET = 'short';

    expect(() => validateEnv()).toThrow(/at least 32 characters/);
  });

  it('should throw when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it('should throw when NODE_ENV is invalid', () => {
    process.env.NODE_ENV = 'invalid';

    expect(() => validateEnv()).toThrow(/NODE_ENV/);
  });

  it('should return valid env when all required vars are set', () => {
    const env = validateEnv();

    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe('postgresql://localhost:5432/test');
    expect(env.JWT_ACCESS_SECRET).toHaveLength(32);
    expect(env.CRON_ENABLED).toBe(true);
  });

  it('should set CRON_ENABLED to false when CRON_ENABLED=false', () => {
    process.env.CRON_ENABLED = 'false';

    const env = validateEnv();

    expect(env.CRON_ENABLED).toBe(false);
  });

  it('should throw when NODE_ENV=production and AUTH_EMAIL_VERIFICATION_ENABLED is not true', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED = 'false';

    expect(() => validateEnv()).toThrow(/AUTH_EMAIL_VERIFICATION_ENABLED/);
  });

  it('should pass when NODE_ENV=production and AUTH_EMAIL_VERIFICATION_ENABLED=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED = 'true';

    const env = validateEnv();

    expect(env.NODE_ENV).toBe('production');
  });
});
