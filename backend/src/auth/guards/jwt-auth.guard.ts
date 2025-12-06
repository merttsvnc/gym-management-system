import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Auth Guard - Validates JWT tokens using Passport JWT strategy
 *
 * This guard uses the JwtStrategy to validate JWT tokens from the Authorization header.
 * The token payload is validated and attached to the request object as request.user.
 *
 * Expected token payload structure (from JwtStrategy):
 * {
 *   sub: string;      // user id
 *   email: string;
 *   tenantId: string;
 *   role: string;
 * }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
