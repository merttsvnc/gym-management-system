import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { RequestWithRequestId } from '../middleware/request-id.middleware';

/** UUID v4 pattern - safe to log as opaque identifier */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Masks email for safe logging (e.g. "u***@***.com")
 */
function maskEmail(value: string): string {
  if (!value || typeof value !== 'string') return '[redacted]';
  const at = value.indexOf('@');
  if (at <= 0) return '[redacted]';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const maskedLocal =
    local.length > 1 ? `${local[0]}***` : '***';
  const maskedDomain =
    domain.length > 2 ? `***.${domain.slice(domain.lastIndexOf('.'))}` : '***';
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Masks phone for safe logging
 */
function maskPhone(value: string): string {
  if (!value || typeof value !== 'string') return '[redacted]';
  if (value.length <= 4) return '****';
  return `***${value.slice(-4)}`;
}

/**
 * Returns a safe representation of userId for logging.
 * - UUID: log as-is (opaque)
 * - Email-like: masked
 * - Phone-like: masked
 */
function safeUserId(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value);
  if (UUID_REGEX.test(s)) return s;
  if (s.includes('@')) return maskEmail(s);
  if (/^\d[\d\s\-+()]{6,}$/.test(s)) return maskPhone(s);
  return '[opaque]';
}

interface LogPayload {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  tenantId?: string;
  userId?: string;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request & RequestWithRequestId>();
    const res = ctx.getResponse();
    const start = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;
      const requestId = req.requestId ?? 'unknown';
      const method = req.method;
      const path = req.originalUrl ?? req.url ?? '';

      const payload: LogPayload = {
        requestId,
        method,
        path,
        statusCode,
        durationMs,
      };

      // Add tenantId and userId when available (from JWT)
      const user = (req as unknown as { user?: { sub?: string; tenantId?: string } })
        .user;
      if (user?.tenantId) {
        payload.tenantId = user.tenantId;
      }
      if (user?.sub) {
        payload.userId = safeUserId(user.sub);
      }

      const level = this.getLogLevel(statusCode);
      const logLine = JSON.stringify(payload);

      if (level === 'error') {
        this.logger.error(logLine);
      } else if (level === 'warn') {
        this.logger.warn(logLine);
      } else {
        this.logger.log(logLine);
      }
    });

    return next.handle();
  }

  private getLogLevel(statusCode: number): 'log' | 'warn' | 'error' {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) {
      // 404 as info (log) to avoid spam unless auth-related
      if (statusCode === 404) return 'log';
      return 'warn';
    }
    return 'log';
  }
}
