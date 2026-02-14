import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { BILLING_ERROR_MESSAGES } from '../constants/billing-messages';

/**
 * Exception filter for ThrottlerException on payment endpoints
 * Customizes rate limit error response with generic rate limit message
 */
@Catch(ThrottlerException)
export class PaymentThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ requestId?: string }>();

    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: BILLING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED_GENERIC,
      requestId: request.requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
}
