import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * AuthUser represents the authenticated user from JWT token.
 * This type is used by guards, decorators, and controllers to access
 * the current authenticated user's information.
 *
 * The user object is attached to the request by JwtAuthGuard after
 * successful JWT validation.
 */
export type AuthUser = JwtPayload;

