import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Custom Request interface with clientIp field
 */
export interface RequestWithIp extends Request {
  clientIp?: string;
}

/**
 * Middleware to extract and attach client IP to request object.
 * Handles various proxy configurations and headers.
 */
@Injectable()
export class ClientIpMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ClientIpMiddleware.name);

  use(req: RequestWithIp, res: Response, next: NextFunction) {
    // Extract client IP from various sources (in order of preference)
    let clientIp: string | undefined;

    // 1. X-Forwarded-For (most common proxy header)
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
      // Take the first one (original client)
      clientIp = Array.isArray(xForwardedFor)
        ? xForwardedFor[0]
        : xForwardedFor.split(',')[0].trim();
    }

    // 2. X-Real-IP (used by some proxies like nginx)
    if (!clientIp) {
      const xRealIp = req.headers['x-real-ip'];
      if (xRealIp) {
        clientIp = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
      }
    }

    // 3. CF-Connecting-IP (Cloudflare)
    if (!clientIp) {
      const cfConnectingIp = req.headers['cf-connecting-ip'];
      if (cfConnectingIp) {
        clientIp = Array.isArray(cfConnectingIp)
          ? cfConnectingIp[0]
          : cfConnectingIp;
      }
    }

    // 4. Fallback to socket remote address
    if (!clientIp) {
      clientIp =
        req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
    }

    // Clean up IPv6-mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
    if (clientIp && clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7);
    }

    // Attach to request
    req.clientIp = clientIp;

    next();
  }
}
