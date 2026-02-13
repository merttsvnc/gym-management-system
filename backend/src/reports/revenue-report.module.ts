import { Module } from '@nestjs/common';
import { RevenueReportController } from './revenue-report.controller';
import { RevenueReportService } from './revenue-report.service';
import { ProductReportController } from './product-report.controller';
import { ProductReportService } from './product-report.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * RevenueReportModule
 *
 * Provides aggregated revenue reporting functionality.
 * Phase 2.5: Combines membership revenue and product sales revenue.
 * Phase 3: Advanced analytics endpoints (trend, daily, payment methods, top products).
 */
@Module({
  imports: [PrismaModule],
  controllers: [RevenueReportController, ProductReportController],
  providers: [RevenueReportService, ProductReportService],
  exports: [RevenueReportService, ProductReportService],
})
export class RevenueReportModule {}
