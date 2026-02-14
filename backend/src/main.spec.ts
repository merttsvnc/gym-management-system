/**
 * Test for PR-4 env validation (validateEnv) used in main.ts bootstrap
 */
import { validateEnv } from './config/env';

describe('main.ts env validation (PR-4)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
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

  it('should throw when NODE_ENV=production and AUTH_EMAIL_VERIFICATION_ENABLED=false', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED = 'false';

    expect(() => validateEnv()).toThrow(/AUTH_EMAIL_VERIFICATION_ENABLED/);
  });

  it('should not throw when env is valid', () => {
    const env = validateEnv();

    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.JWT_ACCESS_SECRET).toHaveLength(32);
  });
});
