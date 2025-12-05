import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Ensure DATABASE_URL is set (fallback for test environments)
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        'postgresql://postgres:postgres@localhost:5432/gym_management_test';
    }

    // PrismaClient reads DATABASE_URL from environment variables automatically
    // The generated Prisma client requires a non-empty options object
    // Use type assertion to satisfy TypeScript - Prisma will read DATABASE_URL from process.env
    super({
      // Empty object satisfies the constructor requirement
      // Prisma will automatically use DATABASE_URL from environment variables
    } as any);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

