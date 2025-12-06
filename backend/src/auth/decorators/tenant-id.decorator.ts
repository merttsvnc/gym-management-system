import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

/**
 * Decorator to extract the tenantId from the current authenticated user.
 *
 * This is a convenience decorator that extracts tenantId directly,
 * avoiding the need to destructure it from the full user object.
 *
 * Usage:
 * @Get('branches')
 * listBranches(@TenantId() tenantId: string) {
 *   return this.branchesService.listBranches(tenantId);
 * }
 *
 * This is equivalent to:
 * @Get('branches')
 * listBranches(@CurrentUser('tenantId') tenantId: string) {
 *   return this.branchesService.listBranches(tenantId);
 * }
 */
export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    return user?.tenantId;
  },
);
