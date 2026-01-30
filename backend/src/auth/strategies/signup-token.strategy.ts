import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface SignupTokenPayload {
  sub: string; // userId
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class SignupTokenStrategy extends PassportStrategy(
  Strategy,
  'signup-token',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SIGNUP_SECRET') ||
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'your_signup_secret_here',
    });
  }

  validate(payload: SignupTokenPayload) {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid signup token payload');
    }
    return payload;
  }
}
