/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * TenantGuard ensures that a valid tenantId is present in the request context.
 *
 * This guard assumes that an authentication mechanism (e.g., JwtAuthGuard) has already
 * attached user information to the request object, including tenantId and role.
 *
 * The guard:
 * - Validates that tenantId exists in request.user
 * - Attaches tenantId to request.tenantId for easy access in controllers/services
 * - Throws ForbiddenException if tenant context is missing
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Tenant context not found');
    }

    // Attach tenantId to request for easy access
    request.tenantId = user.tenantId;

    return true;
  }
}
