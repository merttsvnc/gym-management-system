import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { TenantsModule } from './tenants/tenants.module';
import { BranchesModule } from './branches/branches.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlanModule } from './plan/plan.module';
import { MembersModule } from './members/members.module';
import { MembershipPlansModule } from './membership-plans/membership-plans.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadsModule } from './uploads/uploads.module';
import { ProductsModule } from './products/products.module';
import { ProductSalesModule } from './product-sales/product-sales.module';
import { RevenueReportModule } from './reports/revenue-report.module';
import { BillingStatusGuard } from './auth/guards/billing-status.guard';
import { ClientIpMiddleware } from './common/middleware/client-ip.middleware';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 900000, // 15 minutes in milliseconds
        limit: 5, // 5 requests per 15 minutes (for login endpoint)
      },
    ]),
    PrismaModule,
    CommonModule,
    TenantsModule,
    BranchesModule,
    UsersModule,
    AuthModule,
    PlanModule,
    MembersModule,
    MembershipPlansModule,
    DashboardModule,
    PaymentsModule,
    UploadsModule,
    ProductsModule,
    ProductSalesModule,
    RevenueReportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register BillingStatusGuard globally
    // IMPORTANT: Global guards run BEFORE controller-level guards (@UseGuards)
    // Execution order: BillingStatusGuard → JwtAuthGuard → TenantGuard → RolesGuard
    // BillingStatusGuard gracefully skips when req.user is undefined (before JWT validation)
    // This allows JwtAuthGuard to handle authentication first
    // Auth routes use @SkipBillingStatusCheck() decorator to fully bypass
    {
      provide: APP_GUARD,
      useClass: BillingStatusGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply ClientIpMiddleware globally to extract client IP for rate limiting
    consumer.apply(ClientIpMiddleware).forRoutes('*');
  }
}
