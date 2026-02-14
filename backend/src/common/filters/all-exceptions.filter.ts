import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { RequestWithRequestId } from '../middleware/request-id.middleware';

const isProduction = process.env.NODE_ENV === 'production';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
}

/**
 * Global exception filter for production observability.
 * - Normalizes all error responses to a consistent shape
 * - Maps Prisma errors (P2002 -> 409, P2025 -> 404, others -> 500)
 * - Prevents information leakage: no stack/SQL/raw Prisma messages to clients in production
 * - Logs stack traces server-side only for 5xx
 * - Never logs Authorization tokens
 * - Includes requestId in response for support traceability
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithRequestId>();
    const requestId = request.requestId ?? 'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? exception.message;
        error = (obj.error as string) ?? this.getDefaultErrorName(statusCode);
      } else {
        error = this.getDefaultErrorName(statusCode);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception);
      statusCode = mapped.statusCode;
      error = mapped.error;
      message = mapped.message;
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = isProduction ? 'Invalid request data' : 'Validation error';
    } else if (exception instanceof Error) {
      if (!isProduction) {
        message = exception.message;
      }
      // Log stack for 5xx (server-side only)
      this.logger.error(
        `[${requestId}] Unhandled error: ${exception.message}`,
        exception.stack,
      );
    }

    const body: ErrorResponse = {
      statusCode,
      error,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }

  private getDefaultErrorName(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
    };
    return map[status] ?? 'Error';
  }

  private mapPrismaError(
    error: Prisma.PrismaClientKnownRequestError,
  ): { statusCode: number; error: string; message: string } {
    switch (error.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'Conflict',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'Not found',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: 'Internal server error',
        };
    }
  }
}
