import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpLength = 6;
  private readonly otpTtlMinutes = 10;
  private readonly maxAttempts = 5;
  private readonly resendCooldownSeconds = 60;
  private readonly dailyCap = 10;
  private readonly isEmailEnabled: boolean;
  private readonly devFixedCode: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    this.isEmailEnabled =
      this.configService.get<string>('AUTH_EMAIL_VERIFICATION_ENABLED') ===
      'true';
    this.devFixedCode =
      this.configService.get<string>('AUTH_OTP_DEV_FIXED_CODE') || null;

    // Log environment configuration at startup (safely, without exposing secrets)
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    this.logger.log(
      `OTP Service initialized - NODE_ENV: ${nodeEnv}, AUTH_EMAIL_VERIFICATION_ENABLED: ${this.isEmailEnabled}, AUTH_OTP_DEV_FIXED_CODE: ${this.devFixedCode ? `set (length: ${this.devFixedCode.length})` : 'not set'}`,
    );
  }

  /**
   * Generate a 6-digit numeric OTP
   */
  private generateOtp(): string {
    const min = 100000;
    const max = 999999;
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  /**
   * Hash OTP using bcrypt
   */
  private async hashOtp(otp: string): Promise<string> {
    return bcrypt.hash(otp, 10);
  }

  /**
   * Verify OTP against hash
   */
  private async verifyOtp(otp: string, hash: string): Promise<boolean> {
    return bcrypt.compare(otp, hash);
  }

  /**
   * Create and send OTP for email verification
   * Invalidates any existing active OTP for the email
   */
  async createAndSendOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check daily cap
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const existingOtp = await this.prisma.emailOtp.findFirst({
      where: {
        email: normalizedEmail,
        createdAt: { gte: startOfDay },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingOtp) {
      // Check if we need to reset daily counter (new day)
      const lastDailyReset = existingOtp.dailySentAt
        ? new Date(existingOtp.dailySentAt)
        : null;

      if (!lastDailyReset || lastDailyReset < startOfDay) {
        // New day, reset counter
        await this.prisma.emailOtp.updateMany({
          where: { email: normalizedEmail },
          data: { dailySentCount: 0, dailySentAt: now },
        });
      } else if (existingOtp.dailySentCount >= this.dailyCap) {
        this.logger.warn(
          `Daily cap reached for ${normalizedEmail} (${this.dailyCap} sends)`,
        );
        // Still return success for anti-enumeration, but don't send
        return;
      }
    }

    // Check resend cooldown
    const lastSentOtp = await this.prisma.emailOtp.findFirst({
      where: { email: normalizedEmail },
      orderBy: { lastSentAt: 'desc' },
    });

    if (lastSentOtp) {
      const secondsSinceLastSend =
        (now.getTime() - lastSentOtp.lastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < this.resendCooldownSeconds) {
        const remainingSeconds = Math.ceil(
          this.resendCooldownSeconds - secondsSinceLastSend,
        );
        this.logger.warn(
          `Resend cooldown active for ${normalizedEmail} (${remainingSeconds}s remaining)`,
        );
        // Still return success for anti-enumeration
        return;
      }
    }

    // Generate OTP
    const otp = this.isEmailEnabled
      ? this.generateOtp()
      : this.devFixedCode || '000000';
    const otpHash = await this.hashOtp(otp);

    // Calculate expiry
    const expiresAt = new Date(now);
    expiresAt.setMinutes(expiresAt.getMinutes() + this.otpTtlMinutes);

    // Invalidate previous active OTPs (mark as consumed)
    await this.prisma.emailOtp.updateMany({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    // Get current daily count
    const currentDailyCount = existingOtp?.dailySentCount || 0;

    // Create new OTP record
    await this.prisma.emailOtp.create({
      data: {
        email: normalizedEmail,
        otpHash,
        expiresAt,
        attemptCount: 0,
        lastSentAt: now,
        dailySentCount: currentDailyCount + 1,
        dailySentAt: now,
      },
    });

    // Send email (only if enabled)
    if (this.isEmailEnabled) {
      await this.emailService.sendOtpEmail(normalizedEmail, otp);
    }

    this.logger.log(`OTP created for ${normalizedEmail}`);
  }

  /**
   * Verify OTP code
   * Returns true if valid, false otherwise
   * Increments attemptCount on failure
   * In dev mode (AUTH_EMAIL_VERIFICATION_ENABLED=false), accepts fixed code without DB lookup
   */
  async verifyOtpCode(email: string, code: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // Dev mode: accept fixed code directly without database lookup
    if (!this.isEmailEnabled) {
      const expectedCode = this.devFixedCode || '000000';
      // String comparison to handle leading zeros correctly
      const isValid = code === expectedCode;

      if (isValid) {
        this.logger.log(
          `OTP verified successfully for ${normalizedEmail} (dev mode, fixed code)`,
        );
        return true;
      } else {
        this.logger.warn(
          `OTP verification failed for ${normalizedEmail} (dev mode): code mismatch`,
        );
        return false;
      }
    }

    // Production mode: verify against database hash
    // Find active OTP
    const otpRecord = await this.prisma.emailOtp.findFirst({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Anti-enumeration: return false if no OTP found (don't reveal existence)
    if (!otpRecord) {
      this.logger.warn(
        `OTP verification failed for ${normalizedEmail}: no active OTP`,
      );
      return false;
    }

    // Check if locked (too many attempts)
    if (otpRecord.attemptCount >= this.maxAttempts) {
      this.logger.warn(
        `OTP verification failed for ${normalizedEmail}: max attempts exceeded`,
      );
      return false;
    }

    // Verify code
    const isValid = await this.verifyOtp(code, otpRecord.otpHash);

    if (isValid) {
      // Mark as consumed
      await this.prisma.emailOtp.update({
        where: { id: otpRecord.id },
        data: { consumedAt: now },
      });

      this.logger.log(`OTP verified successfully for ${normalizedEmail}`);
      return true;
    } else {
      // Increment attempt count
      await this.prisma.emailOtp.update({
        where: { id: otpRecord.id },
        data: { attemptCount: otpRecord.attemptCount + 1 },
      });

      this.logger.warn(
        `OTP verification failed for ${normalizedEmail}: invalid code (attempt ${otpRecord.attemptCount + 1}/${this.maxAttempts})`,
      );
      return false;
    }
  }

  /**
   * Check if email has a valid (unconsumed, unexpired) OTP
   */
  async hasActiveOtp(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    const otpRecord = await this.prisma.emailOtp.findFirst({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: this.maxAttempts },
      },
    });

    return !!otpRecord;
  }
}
