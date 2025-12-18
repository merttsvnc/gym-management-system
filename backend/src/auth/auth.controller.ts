import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SkipBillingStatusCheck } from './decorators/skip-billing-status-check.decorator';

/**
 * Auth controller - all routes excluded from billing status check
 * Auth routes (login, register, refresh token, /auth/me) should bypass billing restrictions
 * to allow authentication and billing status checks
 */
@SkipBillingStatusCheck()
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.authService.login(user);
  }
}
