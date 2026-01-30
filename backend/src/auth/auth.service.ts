import {
  Injectable,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
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
import { OtpService } from './services/otp.service';
import { SignupStartDto } from './dto/signup-start.dto';
import { SignupVerifyOtpDto } from './dto/signup-verify-otp.dto';
import { SignupCompleteDto } from './dto/signup-complete.dto';
import { SignupResendOtpDto } from './dto/signup-resend-otp.dto';
import { SignupTokenPayload } from './strategies/signup-token.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
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

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    return {
      accessToken,
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

      const accessToken = this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn,
      });

      // Return same format as login, plus branch info
      return {
        accessToken,
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

  /**
   * Start signup process: create user (if not exists) and send OTP
   * Anti-enumeration: always returns success message
   */
  async signupStart(dto: SignupStartDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check if email already exists (but don't reveal this)
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, tenantId: true },
    });

    if (!existingUser) {
      // Create user with unverified email
      // We need to create a temporary tenant structure since tenantId is required
      // This will be finalized in signupComplete
      const passwordHash = await bcrypt.hash(dto.password, 10);

      return this.prisma.$transaction(async (tx) => {
        // Create temporary tenant (will be updated in complete step)
        const tempTenant = await tx.tenant.create({
          data: {
            name: 'Temp', // Temporary, will be updated
            slug: `temp-${Date.now()}`, // Unique temporary slug
            planKey: PlanKey.SINGLE,
            billingStatus: BillingStatus.TRIAL,
            defaultCurrency: 'TRY',
          },
        });

        // Create user with temporary tenant
        // Use placeholder names that will be updated in complete step
        await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            firstName: 'Temp', // Placeholder, will be updated in complete step
            lastName: 'User', // Placeholder, will be updated in complete step
            role: 'ADMIN',
            isActive: true,
            emailVerifiedAt: null,
            tenantId: tempTenant.id,
          },
        });

        // Always send OTP (anti-enumeration)
        await this.otpService.createAndSendOtp(normalizedEmail);

        return {
          ok: true,
          message:
            'Eğer bu e-posta adresi uygunsa doğrulama kodu gönderildi.',
        };
      });
    }

    // User exists - do NOT update password (DoS prevention)
    // Only send OTP, maintain anti-enumeration behavior
    await this.otpService.createAndSendOtp(normalizedEmail);

    return {
      ok: true,
      message: 'Eğer bu e-posta adresi uygunsa doğrulama kodu gönderildi.',
    };
  }

  /**
   * Verify OTP and issue signup completion token
   */
  async signupVerifyOtp(dto: SignupVerifyOtpDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Verify OTP
    const isValid = await this.otpService.verifyOtpCode(
      normalizedEmail,
      dto.code,
    );

    if (!isValid) {
      // Generic error for anti-enumeration
      throw new BadRequestException({
        code: 'INVALID_OTP',
        message: 'Geçersiz veya süresi dolmuş doğrulama kodu',
      });
    }

    // Find user
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // In dev mode (email verification disabled), if user doesn't exist after successful OTP verification,
    // create a temporary user structure to allow testing without requiring signup/start first
    const isEmailVerificationEnabled =
      this.configService.get<string>('AUTH_EMAIL_VERIFICATION_ENABLED') === 'true';
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    
    if (!user && !isEmailVerificationEnabled && nodeEnv !== 'production') {
      // Create temporary user in dev mode for testing purposes
      const tempPassword = await bcrypt.hash(`temp-${Date.now()}`, 10);
      
      user = await this.prisma.$transaction(async (tx) => {
        // Create temporary tenant
        const tempTenant = await tx.tenant.create({
          data: {
            name: 'Dev Test Tenant',
            slug: `dev-test-${Date.now()}`,
            planKey: PlanKey.SINGLE,
            billingStatus: BillingStatus.TRIAL,
            defaultCurrency: 'TRY',
          },
        });

        // Create user with temporary tenant
        return await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash: tempPassword,
            firstName: 'Dev',
            lastName: 'User',
            role: 'ADMIN',
            isActive: true,
            emailVerifiedAt: new Date(),
            tenantId: tempTenant.id,
          },
        });
      });
    } else if (!user) {
      // Production mode or email verification enabled: user must exist
      throw new BadRequestException({
        code: 'INVALID_OTP',
        message: 'Geçersiz veya süresi dolmuş doğrulama kodu',
      });
    } else {
      // User exists, update emailVerifiedAt
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    // Generate short-lived signup completion token
    const signupTokenPayload: SignupTokenPayload = {
      sub: user.id,
      email: user.email,
    };

    const signupSecret = this.configService.get<string>('JWT_SIGNUP_SECRET');
    if (!signupSecret) {
      throw new Error(
        'JWT_SIGNUP_SECRET is required for signup token generation. Please set it in your environment variables.',
      );
    }

    const signupToken = this.jwtService.sign(signupTokenPayload, {
      secret: signupSecret,
      expiresIn: '900s', // 15 minutes
    });

    return {
      ok: true,
      signupToken,
      expiresIn: 900,
    };
  }

  /**
   * Complete signup: update tenant, create branch, and finalize user
   * Requires signup token
   */
  async signupComplete(
    signupTokenPayload: SignupTokenPayload,
    dto: SignupCompleteDto,
  ) {
    const userId = signupTokenPayload.sub;
    const email = signupTokenPayload.email;

    // Get user and verify email is verified
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || user.email !== email) {
      throw new UnauthorizedException('Invalid signup token');
    }

    if (!user.emailVerifiedAt) {
      throw new BadRequestException('Email not verified');
    }

    // Check if user already completed signup (tenant name is not 'Temp')
    if (user.tenant && user.tenant.name !== 'Temp') {
      // User already completed signup, return normal login response
      return this.login(user);
    }

    return this.prisma.$transaction(async (tx) => {
      // Generate unique slug
      const baseSlug = this.generateSlug(dto.gymName);
      const slug = await this.generateUniqueSlug(tx, baseSlug);

      // Calculate trial dates (7 days from now)
      const now = new Date();
      const trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      // Update existing tenant (created in signupStart)
      const tenant = await tx.tenant.update({
        where: { id: user.tenantId },
        data: {
          name: dto.gymName,
          slug,
          trialStartedAt: now,
          trialEndsAt,
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

      // Split ownerName into firstName and lastName
      const nameParts = dto.ownerName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Update user with name
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          firstName,
          lastName,
        },
      });

      // Query tenant again within transaction
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

      // Generate normal access token (no refresh token)
      const payload: JwtPayload = {
        sub: updatedUser.id,
        email: updatedUser.email,
        tenantId: updatedUser.tenantId,
        role: updatedUser.role,
      };

      const accessExpiresIn = (this.configService.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
      ) || '900s') as StringValue;

      const accessToken = this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn,
      });

      return {
        accessToken,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          tenantId: updatedUser.tenantId,
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

  /**
   * Resend OTP
   * Anti-enumeration: always returns success message
   */
  async signupResendOtp(dto: SignupResendOtpDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Always attempt to resend (anti-enumeration)
    await this.otpService.createAndSendOtp(normalizedEmail);

    return {
      ok: true,
      message: 'Eğer mümkünse yeni doğrulama kodu gönderildi.',
    };
  }
}
