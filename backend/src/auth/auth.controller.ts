import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
  UseFilters,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  Throttle,
  ThrottlerException,
  ThrottlerGuard,
} from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SignupStartDto } from './dto/signup-start.dto';
import { SignupVerifyOtpDto } from './dto/signup-verify-otp.dto';
import { SignupCompleteDto } from './dto/signup-complete.dto';
import { SignupResendOtpDto } from './dto/signup-resend-otp.dto';
import { PasswordResetStartDto } from './dto/password-reset-start.dto';
import { PasswordResetVerifyOtpDto } from './dto/password-reset-verify-otp.dto';
import { PasswordResetCompleteDto } from './dto/password-reset-complete.dto';
import { SkipBillingStatusCheck } from './decorators/skip-billing-status-check.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './types/auth-user.type';
import { Logger } from '@nestjs/common';
import { ThrottlerExceptionFilter } from '../common/filters/throttler-exception.filter';
import { SignupTokenGuard } from './guards/signup-token.guard';
import { SignupTokenPayload } from './strategies/signup-token.strategy';
import { ResetTokenGuard } from './guards/reset-token.guard';
import { ResetTokenPayload } from './strategies/reset-token.strategy';
import { RequestWithIp } from '../common/middleware/client-ip.middleware';

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
  @UseGuards(ThrottlerGuard)
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

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 attempts per hour (3600000ms)
  @UseFilters(ThrottlerExceptionFilter)
  async register(@Body() registerDto: RegisterDto) {
    try {
      return await this.authService.register(registerDto);
    } catch (error) {
      // Log rate limit hits (handled by throttler guard)
      if (error instanceof ThrottlerException) {
        this.logger.warn(
          `Rate limit exceeded for registration attempt: ${registerDto.email}`,
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

  @Post('signup/start')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @UseFilters(ThrottlerExceptionFilter)
  async signupStart(@Body() dto: SignupStartDto) {
    try {
      return await this.authService.signupStart(dto);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        this.logger.warn(`Rate limit exceeded for signup start: ${dto.email}`);
      }
      throw error;
    }
  }

  @Post('signup/verify-otp')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900000 } }) // 10 attempts per 15 minutes
  @UseFilters(ThrottlerExceptionFilter)
  async signupVerifyOtp(@Body() dto: SignupVerifyOtpDto) {
    try {
      return await this.authService.signupVerifyOtp(dto);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        this.logger.warn(
          `Rate limit exceeded for OTP verification: ${dto.email}`,
        );
      }
      throw error;
    }
  }

  @Post('signup/complete')
  @UseGuards(SignupTokenGuard)
  async signupComplete(
    @CurrentUser() signupTokenPayload: SignupTokenPayload,
    @Body() dto: SignupCompleteDto,
  ) {
    return await this.authService.signupComplete(signupTokenPayload, dto);
  }

  @Post('signup/resend-otp')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 attempts per hour
  @UseFilters(ThrottlerExceptionFilter)
  async signupResendOtp(@Body() dto: SignupResendOtpDto) {
    try {
      return await this.authService.signupResendOtp(dto);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        this.logger.warn(`Rate limit exceeded for OTP resend: ${dto.email}`);
      }
      throw error;
    }
  }

  @Post('password-reset/start')
  // NOTE: No @Throttle decorator here - rate limiting is handled at service level
  // to prevent email enumeration through 429 vs 201 status code differences
  async passwordResetStart(
    @Body() dto: PasswordResetStartDto,
    @Req() req: RequestWithIp,
  ) {
    const clientIp = req.clientIp || 'unknown';
    return await this.authService.passwordResetStart(dto, clientIp);
  }

  @Post('password-reset/verify-otp')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900000 } }) // 10 attempts per 15 minutes
  @UseFilters(ThrottlerExceptionFilter)
  async passwordResetVerifyOtp(@Body() dto: PasswordResetVerifyOtpDto) {
    try {
      return await this.authService.passwordResetVerifyOtp(dto);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        this.logger.warn(
          `Rate limit exceeded for password reset OTP verification: ${dto.email}`,
        );
      }
      throw error;
    }
  }

  @Post('password-reset/complete')
  @UseGuards(ResetTokenGuard)
  async passwordResetComplete(
    @CurrentUser() resetTokenPayload: ResetTokenPayload,
    @Body() dto: PasswordResetCompleteDto,
  ) {
    return await this.authService.passwordResetComplete(resetTokenPayload, dto);
  }
}
