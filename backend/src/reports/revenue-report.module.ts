import { Module } from '@nestjs/common';
import { RevenueReportController } from './revenue-report.controller';
import { RevenueReportService } from './revenue-report.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * RevenueReportModule
 *
 * Provides aggregated revenue reporting functionality.
 * Phase 2.5: Combines membership revenue and product sales revenue.
 */
@Module({
  imports: [PrismaModule],
  controllers: [RevenueReportController],
  providers: [RevenueReportService],
  exports: [RevenueReportService],
})
export class RevenueReportModule {}
