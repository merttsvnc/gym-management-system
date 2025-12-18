/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Global HTTP Exception Filter
 *
 * Normalizes all error responses to the ErrorResponse format defined in contracts.
 * Handles:
 * - Standard NestJS HttpException types
 * - Prisma errors (unique constraint, foreign key issues) mapped to appropriate HTTP status codes
 * - Validation errors from class-validator
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Sunucu hatası';
    let code: string | undefined;
    let errors: Array<{ field: string; message: string }> | undefined;

    // Handle NestJS HttpException
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || exception.message;
        code = responseObj.code; // Preserve error code if present

        // Handle validation errors from class-validator
        if (Array.isArray(responseObj.message)) {
          // Join all validation messages into a single readable message
          const validationMessages = responseObj.message as string[];
          message = validationMessages.join('. ');

          errors = validationMessages.map((msg: string) => {
            // Extract field name from validation message if possible
            const fieldMatch = msg.match(/^(\w+)/);
            return {
              field: fieldMatch ? fieldMatch[1] : 'unknown',
              message: msg,
            };
          });
        }
      }
    }
    // Handle Prisma errors
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = this.mapPrismaErrorToHttpStatus(exception);
      message = this.getPrismaErrorMessage(exception);
    }
    // Handle Prisma validation errors
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Geçersiz giriş verisi';
    }
    // Handle unknown errors
    else if (exception instanceof Error) {
      message = exception.message || 'Sunucu hatası';
    }

    const errorResponse = {
      statusCode: status,
      message,
      ...(code && { code }),
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
      path: (request as { url: string }).url,
    };

    response.status(status).json(errorResponse);
  }

  /**
   * Maps Prisma error codes to HTTP status codes
   */
  private mapPrismaErrorToHttpStatus(
    error: Prisma.PrismaClientKnownRequestError,
  ): number {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        return HttpStatus.CONFLICT;
      case 'P2003': // Foreign key constraint violation
        return HttpStatus.BAD_REQUEST;
      case 'P2025': // Record not found
        return HttpStatus.NOT_FOUND;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  /**
   * Gets user-friendly error message from Prisma error (Turkish)
   */
  private getPrismaErrorMessage(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    switch (error.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = error.meta?.target as string[] | undefined;
        if (target && target.length > 0) {
          const field = target[0];
          // Map common field names to Turkish
          const fieldMap: Record<string, string> = {
            phone: 'Telefon numarası',
            email: 'E-posta',
            tenantId: 'Kiracı ID',
            branchId: 'Şube ID',
          };
          const fieldName = fieldMap[field] || field;
          return `${fieldName} zaten kullanılıyor`;
        }
        return 'Bu değer zaten kullanılıyor';
      }
      case 'P2003':
        return 'İlişkili kayıt referansı geçersiz';
      case 'P2025':
        return 'Kayıt bulunamadı';
      default:
        return 'Veritabanı işlemi başarısız';
    }
  }
}
