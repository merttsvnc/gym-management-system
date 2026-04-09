import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { APP_VALIDATED_ENV } from '../config/app-env.token';
import {
  type Env,
  getRevenueCatReplayWindowMs,
  validateEnv,
} from '../config/env';
import { BillingEntitlementService } from './billing-entitlement.service';
import { RevenueCatWebhookController } from './revenuecat-webhook.controller';
import {
  REVENUECAT_REPLAY_WINDOW_MS,
  RevenueCatWebhookService,
} from './revenuecat-webhook.service';
import { MeEntitlementsController } from './me-entitlements.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RevenueCatWebhookController, MeEntitlementsController],
  providers: [
    {
      provide: APP_VALIDATED_ENV,
      useFactory: () => validateEnv(),
    },
    BillingEntitlementService,
    {
      provide: REVENUECAT_REPLAY_WINDOW_MS,
      useFactory: (env: Env) => getRevenueCatReplayWindowMs(env),
      inject: [APP_VALIDATED_ENV],
    },
    RevenueCatWebhookService,
  ],
  exports: [BillingEntitlementService],
})
export class BillingModule {}
