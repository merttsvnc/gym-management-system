import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * ResetTokenGuard - Validates password reset tokens (not regular access tokens)
 *
 * This guard ensures that:
 * - Authorization header is present
 * - Token is a valid reset token (signed with JWT_RESET_SECRET)
 * - Token has type="password_reset"
 * - Token is not expired
 *
 * Rejects:
 * - Requests without Authorization header (401)
 * - Regular access tokens (401 - wrong secret)
 * - Signup tokens (401 - wrong secret)
 * - Expired tokens (401)
 */
@Injectable()
export class ResetTokenGuard extends AuthGuard('reset-token') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    // Explicitly check for Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Authorization header with Bearer token is required',
      );
    }

    // Call parent AuthGuard which validates the token
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, _info: any) {
    // If token is missing or invalid, throw UnauthorizedException
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or missing reset token');
    }
    return user;
  }
}
