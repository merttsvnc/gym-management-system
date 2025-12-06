import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user.type';

/**
 * RolesGuard enforces role-based authorization on routes.
 *
 * This guard should be used together with JwtAuthGuard to ensure:
 * 1. The user is authenticated (JwtAuthGuard)
 * 2. The user has the required role (RolesGuard)
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('ADMIN')
 * someHandler() { ... }
 *
 * If no @Roles() decorator is present, the guard allows access (no role required).
 * If @Roles() is present, the user's role must match one of the specified roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read required roles from metadata (set by @Roles() decorator)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get the authenticated user from the request
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    // If no user is present, deny access
    // (This should not happen if JwtAuthGuard is used first, but we check anyway)
    if (!user || !user.role) {
      throw new ForbiddenException('User role not found');
    }

    // Check if user's role matches any of the required roles
    const hasRequiredRole = requiredRoles.includes(user.role);

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
