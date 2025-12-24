import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { BranchesModule } from './branches/branches.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlanModule } from './plan/plan.module';
import { MembersModule } from './members/members.module';
import { MembershipPlansModule } from './membership-plans/membership-plans.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PaymentsModule } from './payments/payments.module';
import { BillingStatusGuard } from './auth/guards/billing-status.guard';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 900000, // 15 minutes in milliseconds
        limit: 5, // 5 requests per 15 minutes (for login endpoint)
        // Per-user tracking: keyGenerator extracts user ID from request.user (set by JwtAuthGuard)
        // Falls back to IP address for unauthenticated requests
        keyGenerator: (context) => {
          const request = context.switchToHttp().getRequest();
          const user = request.user;
          // If user is authenticated (set by JwtAuthGuard), use user ID for tracking
          if (user && user.sub) {
            return `user:${user.sub}`;
          }
          // Fallback to IP address for unauthenticated requests
          const ip = request.ip || request.connection?.remoteAddress || 'unknown';
          return `ip:${ip}`;
        },
      },
    ]),
    PrismaModule,
    TenantsModule,
    BranchesModule,
    UsersModule,
    AuthModule,
    PlanModule,
    MembersModule,
    MembershipPlansModule,
    DashboardModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register BillingStatusGuard globally
    // The guard runs after JwtAuthGuard and TenantGuard
    // Auth routes are excluded using @SkipBillingStatusCheck() decorator
    {
      provide: APP_GUARD,
      useClass: BillingStatusGuard,
    },
  ],
})
export class AppModule {}
