import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
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
import { UploadsModule } from './uploads/uploads.module';
import { BillingStatusGuard } from './auth/guards/billing-status.guard';
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
