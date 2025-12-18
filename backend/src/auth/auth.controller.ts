import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
  UseFilters,
} from '@nestjs/common';
import { Throttle, ThrottlerException } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SkipBillingStatusCheck } from './decorators/skip-billing-status-check.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './types/auth-user.type';
import { Logger } from '@nestjs/common';
import { ThrottlerExceptionFilter } from '../common/filters/throttler-exception.filter';

/**
 * Auth controller - all routes excluded from billing status check
 * Auth routes (login, register, refresh token, /auth/me) should bypass billing restrictions
 * to allow authentication and billing status checks
 */
@SkipBillingStatusCheck()
@Controller('api/v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes (900000ms)
  @UseFilters(ThrottlerExceptionFilter)
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    try {
      return await this.authService.login(user);
    } catch (error) {
      // Log rate limit hits (handled by throttler guard)
      if (error instanceof ThrottlerException) {
        this.logger.warn(
          `Rate limit exceeded for login attempt: ${loginDto.email}`,
        );
      }
      throw error;
    }
  }

  @Get('me')
  async getCurrentUser(@CurrentUser() user: AuthUser) {
    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.authService.getCurrentUser(user.sub, user.tenantId);
  }
}
