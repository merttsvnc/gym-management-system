import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
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
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    // Rate limiting: per-instance only (no Redis). Auth routes use @Throttle() for custom limits.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 100, // Default: 100/min for non-auth routes
      },
    ]),
    PrismaModule,
    CommonModule,
    HealthModule,
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
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // RequestId first (for correlation), then ClientIp (for rate limiting)
    consumer
      .apply(RequestIdMiddleware, ClientIpMiddleware)
      .forRoutes('*');
  }
}
