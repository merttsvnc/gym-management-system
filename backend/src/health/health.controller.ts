import {
  Controller,
  Get,
  ServiceUnavailableException,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const HEALTH_DB_TIMEOUT_MS = 2000;

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  timestamp: string;
  version?: string;
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();
    let version = process.env.APP_VERSION;
    if (!version) {
      try {
        version = require('../../package.json')?.version;
      } catch {
        // ignore
      }
    }

    const dbOk = await this.checkDb();

    const response: HealthResponse = {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'down',
      timestamp,
      ...(version && { version }),
    };

    if (!dbOk) {
      res.status(503);
    }

    return response;
  }

  private async checkDb(): Promise<boolean> {
    try {
      const result = await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('DB health check timeout')),
            HEALTH_DB_TIMEOUT_MS,
          ),
        ),
      ]);
      return Array.isArray(result) && result.length > 0;
    } catch {
      return false;
    }
  }
}
