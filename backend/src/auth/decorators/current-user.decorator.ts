/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

/**
 * Decorator to extract the current user from the request object.
 *
 * The user is attached to the request by JwtAuthGuard after successful JWT validation.
 *
 * Usage examples:
 *
 * Get the full user object:
 * @Get('me')
 * getProfile(@CurrentUser() user: AuthUser) {
 *   return { id: user.sub, email: user.email, tenantId: user.tenantId, role: user.role };
 * }
 *
 * Or to extract a specific property:
 * @Get()
 * getData(@CurrentUser('tenantId') tenantId: string) {
 *   // tenantId is a string
 * }
 */
export const CurrentUser = createParamDecorator(
  (
    data: string | undefined,
    ctx: ExecutionContext,
  ): AuthUser | string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;

    if (!user) {
      return undefined;
    }

    return data ? user[data as keyof AuthUser] : user;
  },
);
