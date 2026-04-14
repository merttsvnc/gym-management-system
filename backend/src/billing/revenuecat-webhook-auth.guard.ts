import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { Inject } from '@nestjs/common';
import { APP_VALIDATED_ENV } from '../config/app-env.token';
import type { Env } from '../config/env';

/**
 * Guard that validates the RevenueCat webhook shared-secret authorization header.
 *
 * Applied at the controller level so every endpoint under the webhook controller
 * is automatically protected — new endpoints cannot accidentally skip auth.
 */
@Injectable()
export class RevenueCatWebhookAuthGuard implements CanActivate {
  constructor(@Inject(APP_VALIDATED_ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authorizationHeader = request.headers['authorization'];
    const secret = this.env.REVENUECAT_WEBHOOK_SECRET;

    if (!authorizationHeader || !secret) {
      throw new UnauthorizedException(
        'Missing RevenueCat webhook authorization',
      );
    }

    const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
    const expected = Buffer.from(secret, 'utf8');
    const actual = Buffer.from(token, 'utf8');

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException(
        'Invalid RevenueCat webhook authorization',
      );
    }

    return true;
  }
}
