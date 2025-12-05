import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Extended Request interface with user property
 */
interface RequestWithUser extends Request {
  user?: {
    userId: string;
    tenantId: string;
    email: string;
    role: string;
  };
}

/**
 * JWT Auth Guard - Validates JWT tokens and extracts user information
 *
 * For testing purposes, this guard accepts a simple JSON payload in the Authorization header
 * in the format: "Bearer {base64-encoded-json}"
 *
 * In production, this should be replaced with proper JWT validation using @nestjs/jwt
 *
 * Expected token payload structure:
 * {
 *   userId: string;
 *   tenantId: string;
 *   email: string;
 *   role: string;
 * }
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // For testing: decode base64 JSON payload
      // In production, use proper JWT verification
      const decoded = JSON.parse(
        Buffer.from(token, 'base64').toString('utf-8'),
      ) as {
        userId?: string;
        tenantId?: string;
        email?: string;
        role?: string;
      };

      if (!decoded.userId || !decoded.tenantId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Attach user to request object
      request.user = {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        email: decoded.email || '',
        role: decoded.role || 'ADMIN',
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
