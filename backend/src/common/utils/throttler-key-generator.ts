import { ExecutionContext } from '@nestjs/common';

/**
 * Custom key generator for ThrottlerGuard that tracks by user ID instead of IP address
 *
 * This enables per-user rate limiting for authenticated endpoints.
 * Falls back to IP address if user is not authenticated (for public endpoints).
 *
 * Note: In @nestjs/throttler v6+, keyGenerator is no longer supported in module configuration.
 * Custom rate limiting logic should be implemented in a custom guard extending ThrottlerGuard.
 */
export class UserThrottlerKeyGenerator {
  generateKey(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If user is authenticated (set by JwtAuthGuard), use user ID for tracking
    if (user && user.sub) {
      return `user:${user.sub}`;
    }

    // Fallback to IP address for unauthenticated requests
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  generateTracker(context: ExecutionContext): string {
    // Use the same key for tracking
    return this.generateKey(context);
  }
}
