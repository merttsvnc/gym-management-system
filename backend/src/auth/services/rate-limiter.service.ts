import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Service-level rate limiter for password reset operations.
 * Uses in-memory Map storage (can be extended to Redis for production).
 *
 * SECURITY: This rate limiter NEVER reveals user existence:
 * - When limit is exceeded, it returns isLimited: true
 * - The caller MUST handle this by returning the same success response
 * - No exceptions are thrown, no different status codes
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly store = new Map<string, RateLimitEntry>();

  // Rate limits (configurable via environment)
  private readonly ipLimitCount: number;
  private readonly ipLimitWindowMs: number;
  private readonly emailLimitCount: number;
  private readonly emailLimitWindowMs: number;

  // Cleanup interval to prevent memory leaks
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    // IP-based limits: default 20 requests per 15 minutes
    this.ipLimitCount = this.configService.get<number>(
      'RESET_START_IP_LIMIT',
      20,
    );
    this.ipLimitWindowMs = this.configService.get<number>(
      'RESET_START_IP_WINDOW_MS',
      15 * 60 * 1000,
    );

    // Email-based limits: default 5 requests per 15 minutes
    this.emailLimitCount = this.configService.get<number>(
      'RESET_START_EMAIL_LIMIT',
      5,
    );
    this.emailLimitWindowMs = this.configService.get<number>(
      'RESET_START_EMAIL_WINDOW_MS',
      15 * 60 * 1000,
    );

    this.logger.log(
      `Rate limiter initialized - IP: ${this.ipLimitCount}/${this.ipLimitWindowMs}ms, Email: ${this.emailLimitCount}/${this.emailLimitWindowMs}ms`,
    );

    // Clean up expired entries every 5 minutes
    // NOTE (multi-instance): Rate limits are per-instance only. In multi-instance deployments,
    // the same IP/email can hit different instances and bypass limits. Consider Redis for shared limits.
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    );
  }

  /**
   * Check if a password reset request should be rate limited.
   * Returns an object indicating if the request is limited.
   *
   * IMPORTANT: When isLimited is true, the caller MUST:
   * 1. NOT throw an exception
   * 2. Return the same success response as when not limited
   * 3. Skip sending the actual email/OTP
   * 4. Optionally add a small constant delay to reduce timing attacks
   */
  checkPasswordResetLimit(
    clientIp: string,
    email: string,
  ): {
    isLimited: boolean;
    reason?: 'ip' | 'email';
  } {
    const now = Date.now();

    // Check IP-based limit first (broader protection)
    const ipKey = `pwd-reset:ip:${clientIp}`;
    const ipLimited = this.checkAndIncrement(
      ipKey,
      this.ipLimitCount,
      this.ipLimitWindowMs,
      now,
    );

    if (ipLimited) {
      this.logger.warn(
        `Password reset rate limit exceeded for IP: ${this.obfuscateIp(clientIp)}`,
      );
      return { isLimited: true, reason: 'ip' };
    }

    // Check email-based limit (per-email protection)
    // Hash email to avoid storing PII in logs
    const emailHash = this.hashEmail(email);
    const emailKey = `pwd-reset:email:${emailHash}`;
    const emailLimited = this.checkAndIncrement(
      emailKey,
      this.emailLimitCount,
      this.emailLimitWindowMs,
      now,
    );

    if (emailLimited) {
      this.logger.warn(
        `Password reset rate limit exceeded for email hash: ${emailHash.substring(0, 8)}...`,
      );
      return { isLimited: true, reason: 'email' };
    }

    return { isLimited: false };
  }

  /**
   * Check if limit is exceeded and increment counter
   */
  private checkAndIncrement(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): boolean {
    const existing = this.store.get(key);

    if (existing) {
      // Check if window has expired
      if (existing.resetAt <= now) {
        // Window expired, reset counter
        this.store.set(key, { count: 1, resetAt: now + windowMs });
        return false;
      }

      // Window still active, check limit
      if (existing.count >= limit) {
        // Limit exceeded, don't increment (already at limit)
        return true;
      }

      // Increment counter
      existing.count++;
      return false;
    } else {
      // First request, create entry
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
  }

  /**
   * Hash email for rate limiting key (avoid storing plaintext emails)
   */
  private hashEmail(email: string): string {
    return crypto
      .createHash('sha256')
      .update(email.toLowerCase().trim())
      .digest('hex');
  }

  /**
   * Obfuscate IP for logging (privacy)
   */
  private obfuscateIp(ip: string): string {
    if (ip.includes(':')) {
      // IPv6: show first 2 segments
      const parts = ip.split(':');
      return `${parts[0]}:${parts[1]}:****`;
    } else {
      // IPv4: show first 2 octets
      const parts = ip.split('.');
      return `${parts[0]}.${parts[1]}.*.*`;
    }
  }

  /**
   * Clean up expired entries from the store
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  /**
   * Clear all rate limits (for testing)
   */
  clearAll(): void {
    this.store.clear();
    this.logger.debug('Cleared all rate limit entries');
  }

  /**
   * Cleanup on service destroy
   */
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
