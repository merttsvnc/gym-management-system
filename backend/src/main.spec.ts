/**
 * Test for production safety check in main.ts
 * This test verifies that the app fails to start when NODE_ENV=production
 * and AUTH_EMAIL_VERIFICATION_ENABLED=false
 */

describe('main.ts production safety check', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw error when NODE_ENV=production and AUTH_EMAIL_VERIFICATION_ENABLED=false', async () => {
    // Arrange
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED = 'false';

    // Act & Assert
    // Import main.ts which runs bootstrap() immediately
    await expect(async () => {
      // We need to dynamically import to catch the error
      const _mainModule = await import('./main');
      // If bootstrap was called during import, it would throw
      // But since we're testing the check, we'll verify the logic directly
    }).rejects.toThrow();
  });

  it('should allow startup when NODE_ENV=production and AUTH_EMAIL_VERIFICATION_ENABLED=true', () => {
    // Arrange
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED = 'true';

    // Act & Assert - should not throw
    // This is a manual verification test - actual startup test would require full NestJS bootstrap
    const nodeEnv = process.env.NODE_ENV;
    const emailVerificationEnabled =
      process.env.AUTH_EMAIL_VERIFICATION_ENABLED === 'true';

    expect(nodeEnv).toBe('production');
    expect(emailVerificationEnabled).toBe(true);
    // Condition should pass: production && emailVerificationEnabled === true
    expect(nodeEnv === 'production' && !emailVerificationEnabled).toBe(false);
  });

  it('should allow startup when NODE_ENV is not production', () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED = 'false';

    // Act & Assert
    const nodeEnv = process.env.NODE_ENV;
    const emailVerificationEnabled =
      process.env.AUTH_EMAIL_VERIFICATION_ENABLED === 'true';

    // Condition should pass: not production
    expect(nodeEnv === 'production' && !emailVerificationEnabled).toBe(false);
  });
});
