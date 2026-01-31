import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { MobileDashboardController } from './mobile-dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController, MobileDashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
