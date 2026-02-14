import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * PostgreSQL advisory lock service for cron multi-instance hardening.
 * Uses pg_try_advisory_lock(hashtext(lockName)) for non-blocking acquisition.
 * No Redis required.
 */
@Injectable()
export class PgAdvisoryLockService {
  private readonly logger = new Logger(PgAdvisoryLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a correlation ID for job run tracing.
   */
  generateCorrelationId(jobName: string): string {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
    const random = Math.random().toString(36).substring(2, 8);
    return `${jobName}-${timestamp}-${random}`;
  }

  /**
   * Attempt to acquire a PostgreSQL advisory lock (non-blocking).
   *
   * @param lockName Human-readable lock name (e.g., "cron:plan-change:member-abc123")
   * @param correlationId Unique ID for this job run (for tracing)
   * @returns true if lock was acquired, false otherwise
   */
  async tryAcquire(lockName: string, correlationId: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<
        [{ acquired: boolean }]
      >(Prisma.sql`SELECT pg_try_advisory_lock(hashtext(${lockName})) as acquired`);

      const acquired = result[0]?.acquired ?? false;

      if (acquired) {
        this.logger.log(`[${correlationId}] Lock acquired: ${lockName}`);
      } else {
        this.logger.debug(
          `[${correlationId}] Lock skipped (held by another instance): ${lockName}`,
        );
      }

      return acquired;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[${correlationId}] Error acquiring lock: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Release a previously acquired advisory lock.
   * Best-effort; logs errors but does not throw.
   */
  async release(lockName: string, correlationId: string): Promise<void> {
    try {
      const result = await this.prisma.$queryRaw<
        [{ pg_advisory_unlock: boolean }]
      >(Prisma.sql`SELECT pg_advisory_unlock(hashtext(${lockName})) as "pg_advisory_unlock"`);

      const released = result[0]?.pg_advisory_unlock ?? false;

      if (released) {
        this.logger.debug(`[${correlationId}] Lock released: ${lockName}`);
      } else {
        this.logger.debug(
          `[${correlationId}] Lock release: ${lockName} (was not held by this session)`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `[${correlationId}] Error releasing lock ${lockName}: ${err.message}`,
      );
    }
  }
}
