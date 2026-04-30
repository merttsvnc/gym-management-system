import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is required');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload) {
    this.logger.debug(
      `[JwtStrategy.validate] sub=${payload?.sub ?? 'MISSING'} tenantId=${payload?.tenantId ?? 'MISSING'} email=${payload?.email ?? 'MISSING'}`,
    );
    if (!payload.sub || !payload.tenantId) {
      this.logger.warn(
        `[JwtStrategy.validate] rejected — missing sub or tenantId: sub=${payload?.sub} tenantId=${payload?.tenantId}`,
      );
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
