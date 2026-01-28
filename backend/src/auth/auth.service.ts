import {
  Injectable,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { UsersRepository } from '../users/users.repository';
import { PrismaService } from '../prisma/prisma.service';
import { User, BillingStatus, PlanKey } from '@prisma/client';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../common/constants/billing-messages';
import { RegisterDto } from './dto/register.dto';
import { PLAN_CONFIG } from '../plan/plan.config';

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
   * Get current user information including tenant billing status and default branch
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
        planKey: true,
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

    // Get default branch
    const defaultBranch = await this.prisma.branch.findFirst({
      where: {
        tenantId,
        isDefault: true,
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
      },
    });

    // Get plan limits from config
    const planConfig = PLAN_CONFIG[tenant.planKey as keyof typeof PLAN_CONFIG];

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
        planKey: tenant.planKey,
      },
      branch: defaultBranch || null,
      planLimits: planConfig,
    };
  }

  /**
   * Generate a URL-friendly slug from tenant name
   * Converts to lowercase, replaces spaces/special chars with hyphens
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Generate a unique slug by appending numeric suffix if needed
   */
  private async generateUniqueSlug(
    tx: Prisma.TransactionClient,
    baseSlug: string,
  ): Promise<string> {
    let slug = baseSlug;
    let suffix = 2;

    // Ensure slug is at least 3 characters
    if (slug.length < 3) {
      slug = slug + '-gym';
    }

    while (true) {
      const existing = await tx.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing) {
        return slug;
      }

      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }
  }

  /**
   * Register a new tenant with default branch and admin user
   * Creates Tenant + Branch + User in a single transaction
   */
  async register(dto: RegisterDto) {
    // Normalize email (lowercase, trim)
    const normalizedEmail = dto.email.toLowerCase().trim();

    return this.prisma.$transaction(async (tx) => {
      // Check if email already exists
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingUser) {
        throw new ConflictException('Email already registered');
      }

      // Generate unique slug
      const baseSlug = this.generateSlug(dto.tenantName);
      const slug = await this.generateUniqueSlug(tx, baseSlug);

      // Calculate trial dates (7 days from now)
      const now = new Date();
      const trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug,
          planKey: PlanKey.SINGLE,
          billingStatus: BillingStatus.TRIAL,
          trialStartedAt: now,
          trialEndsAt,
          defaultCurrency: 'TRY', // Turkish-focused product
        },
      });

      // Create default branch
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: dto.branchName || 'Ana Şube',
          address: dto.branchAddress || '',
          isDefault: true,
          isActive: true,
        },
      });

      // Hash password
      const passwordHash = await bcrypt.hash(dto.password, 10);

      // Create admin user
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: normalizedEmail,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'ADMIN',
          isActive: true,
        },
      });

      // Query tenant again within transaction to ensure we have latest data
      const tenantWithBilling = await tx.tenant.findUnique({
        where: { id: tenant.id },
        select: {
          id: true,
          name: true,
          billingStatus: true,
        },
      });

      if (!tenantWithBilling) {
        throw new ForbiddenException('Tenant not found');
      }

      // Generate tokens (same logic as login, but using data from transaction)
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

      // Return same format as login, plus branch info
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
          id: tenantWithBilling.id,
          name: tenantWithBilling.name,
          billingStatus: tenantWithBilling.billingStatus,
        },
        branch: {
          id: branch.id,
          name: branch.name,
          isDefault: branch.isDefault,
        },
      };
    });
  }
}
