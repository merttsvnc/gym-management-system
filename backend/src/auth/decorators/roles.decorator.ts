import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used to store roles information for route handlers.
 * This key is read by RolesGuard to determine which roles are required
 * to access a particular route.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles are required to access a route.
 *
 * Usage:
 * @Get('admin-only')
 * @Roles('ADMIN')
 * adminOnlyRoute() { ... }
 *
 * Multiple roles (future support):
 * @Roles('ADMIN', 'OWNER')
 * adminOrOwnerRoute() { ... }
 *
 * Even though we currently only use 'ADMIN', this decorator accepts
 * multiple roles as a string array to support future roles like
 * 'OWNER', 'STAFF', 'MEMBER', etc.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
