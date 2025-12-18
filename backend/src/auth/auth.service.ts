import { Injectable, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../users/users.repository';
import { PrismaService } from '../prisma/prisma.service';
import { User, BillingStatus } from '@prisma/client';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../common/constants/billing-messages';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersRepository.findByEmail(email);

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(user: User) {
    // Query tenant billing status
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        billingStatus: true,
      },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    // Reject SUSPENDED tenant login
    if (tenant.billingStatus === BillingStatus.SUSPENDED) {
      throw new ForbiddenException({
        code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        message: BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN,
      });
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessExpiresIn = (this.configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) || '900s') as StringValue;
    const refreshExpiresIn = (this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) || '30d') as StringValue;

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        billingStatus: tenant.billingStatus,
      },
    };
  }

  /**
   * Get current user information including tenant billing status
   */
  async getCurrentUser(userId: string, tenantId: string) {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      return null;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        billingStatus: true,
        billingStatusUpdatedAt: true,
      },
    });

    if (!tenant) {
      return null;
    }

    // Check if tenant is SUSPENDED
    if (tenant.billingStatus === BillingStatus.SUSPENDED) {
      throw new ForbiddenException({
        code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
        message: BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        billingStatus: tenant.billingStatus,
        billingStatusUpdatedAt: tenant.billingStatusUpdatedAt,
      },
    };
  }
}
