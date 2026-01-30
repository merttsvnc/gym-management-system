import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface ResetTokenPayload {
  sub: string; // userId
  type: 'password_reset';
  iat?: number;
  exp?: number;
}

@Injectable()
export class ResetTokenStrategy extends PassportStrategy(
  Strategy,
  'reset-token',
) {
  constructor(private configService: ConfigService) {
    const resetSecret = configService.get<string>('JWT_RESET_SECRET');

    if (!resetSecret) {
      throw new Error(
        'JWT_RESET_SECRET is required for password reset token verification. Please set it in your environment variables.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resetSecret,
    });
  }

  validate(payload: ResetTokenPayload) {
    if (!payload.sub || payload.type !== 'password_reset') {
      throw new UnauthorizedException('Invalid reset token payload');
    }
    return payload;
  }
}
