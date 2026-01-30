import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SignupTokenStrategy } from './strategies/signup-token.strategy';
import { RolesGuard } from './guards/roles.guard';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { OtpService } from './services/otp.service';

@Module({
  imports: [
    UsersModule,
    PrismaModule,
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const expiresIn = (configService.get<string>('JWT_ACCESS_EXPIRES_IN') ||
          '900s') as StringValue;
        return {
          secret:
            configService.get<string>('JWT_ACCESS_SECRET') ||
            'your_access_secret_here',
          signOptions: {
            expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    SignupTokenStrategy,
    RolesGuard,
    OtpService,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
