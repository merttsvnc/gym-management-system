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
    const signupSecret = configService.get<string>('JWT_SIGNUP_SECRET');

    if (!signupSecret) {
      throw new Error(
        'JWT_SIGNUP_SECRET is required for signup token verification. Please set it in your environment variables.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: signupSecret,
    });
  }

  validate(payload: SignupTokenPayload) {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid signup token payload');
    }
    return payload;
  }
}
