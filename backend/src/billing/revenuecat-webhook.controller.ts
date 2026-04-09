import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SkipBillingStatusCheck } from '../auth/decorators/skip-billing-status-check.decorator';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';

@SkipBillingStatusCheck()
@Controller('billing/revenuecat')
export class RevenueCatWebhookController {
  constructor(private readonly webhookService: RevenueCatWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('authorization') authorization?: string,
    @Body() payload?: unknown,
  ) {
    this.webhookService.verifyWebhookAuthorization(authorization);
    return this.webhookService.processWebhook(payload ?? {});
  }
}
