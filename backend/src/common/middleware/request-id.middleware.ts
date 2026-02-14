import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/** Max length for incoming X-Request-Id (prevent abuse) */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Extended Request with requestId
 */
export interface RequestWithRequestId extends Request {
  requestId?: string;
}

/**
 * Middleware to generate or propagate request ID for HTTP correlation.
 * - If X-Request-Id header is present and valid, reuse it (sanitized).
 * - Otherwise generate a new UUID.
 * - Attaches to req.requestId and sets X-Request-Id response header.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithRequestId, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    let requestId: string;

    if (typeof incoming === 'string' && incoming.trim().length > 0) {
      // Sanitize: trim and limit length to prevent abuse
      requestId = incoming.trim().slice(0, MAX_REQUEST_ID_LENGTH);
    } else if (Array.isArray(incoming) && incoming[0]?.trim?.()) {
      requestId = String(incoming[0]).trim().slice(0, MAX_REQUEST_ID_LENGTH);
    } else {
      try {
        requestId = randomUUID();
      } catch {
        // Fallback if crypto.randomUUID unavailable (older Node)
        requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      }
    }

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
