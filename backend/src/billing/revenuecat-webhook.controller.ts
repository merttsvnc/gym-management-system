import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipBillingStatusCheck } from '../auth/decorators/skip-billing-status-check.decorator';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { RevenueCatTenantNotFoundError } from './revenuecat-tenant-not-found.error';
import { RevenueCatWebhookAuthGuard } from './revenuecat-webhook-auth.guard';

/**
 * RevenueCat webhook ingestion controller.
 *
 * Auth is enforced at the controller level via {@link RevenueCatWebhookAuthGuard}
 * so any new endpoint added here is automatically protected.
 */
@SkipBillingStatusCheck()
@UseGuards(RevenueCatWebhookAuthGuard)
@Controller('billing/revenuecat')
export class RevenueCatWebhookController {
  private readonly logger = new Logger(RevenueCatWebhookController.name);

  constructor(private readonly webhookService: RevenueCatWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload?: unknown) {
    try {
      return await this.webhookService.processWebhook(payload ?? {});
    } catch (error) {
      if (error instanceof RevenueCatTenantNotFoundError) {
        this.logger.warn(
          `Tenant not found for eventId=${error.eventId}; responding 503 for RevenueCat retry`,
        );
        throw new HttpException(
          {
            error: 'tenant_not_found',
            message: 'Tenant not yet provisioned; retry later',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }
}
