import { Module } from '@nestjs/common';
import { RevenueMonthLockController } from './revenue-month-lock.controller';
import { RevenueMonthLockService } from './revenue-month-lock.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RevenueMonthLockController],
  providers: [RevenueMonthLockService],
  exports: [RevenueMonthLockService],
})
export class RevenueMonthLockModule {}
