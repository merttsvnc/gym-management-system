import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordResetOtpService {
  private readonly logger = new Logger(PasswordResetOtpService.name);
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

    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    this.logger.log(
      `Password Reset OTP Service initialized - NODE_ENV: ${nodeEnv}, AUTH_EMAIL_VERIFICATION_ENABLED: ${this.isEmailEnabled}, AUTH_OTP_DEV_FIXED_CODE: ${this.devFixedCode ? `set (length: ${this.devFixedCode.length})` : 'not set'}`,
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
   * Create and send password reset OTP for a user
   * Invalidates any existing active OTP for the user
   */
  async createAndSendOtp(userId: string, email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // Check daily cap
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const existingOtp = await this.prisma.passwordResetOtp.findFirst({
      where: {
        userId,
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
        await this.prisma.passwordResetOtp.updateMany({
          where: { userId },
          data: { dailySentCount: 0, dailySentAt: now },
        });
      } else if (existingOtp.dailySentCount >= this.dailyCap) {
        this.logger.warn(
          `Daily cap reached for password reset ${normalizedEmail} (${this.dailyCap} sends)`,
        );
        // Still return success for anti-enumeration, but don't send
        return;
      }
    }

    // Check resend cooldown
    const lastSentOtp = await this.prisma.passwordResetOtp.findFirst({
      where: { userId },
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
          `Resend cooldown active for password reset ${normalizedEmail} (${remainingSeconds}s remaining)`,
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

    // Invalidate previous active OTPs (delete them)
    await this.prisma.passwordResetOtp.deleteMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
    });

    // Get current daily count
    const currentDailyCount = existingOtp?.dailySentCount || 0;

    // Create new OTP record
    await this.prisma.passwordResetOtp.create({
      data: {
        userId,
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
      await this.emailService.sendPasswordResetOtpEmail(normalizedEmail, otp);
    }

    this.logger.log(`Password reset OTP created for ${normalizedEmail}`);
  }

  /**
   * Verify password reset OTP code
   * Returns true if valid, false otherwise
   * Increments attemptCount on failure
   * In dev mode (AUTH_EMAIL_VERIFICATION_ENABLED=false), accepts fixed code without DB lookup
   */
  async verifyOtpCode(userId: string, code: string): Promise<boolean> {
    const now = new Date();

    // Dev mode: accept fixed code directly without database lookup
    if (!this.isEmailEnabled) {
      const expectedCode = this.devFixedCode || '000000';
      // String comparison to handle leading zeros correctly
      const isValid = code === expectedCode;

      if (isValid) {
        this.logger.log(
          `Password reset OTP verified successfully for userId ${userId} (dev mode, fixed code)`,
        );
        return true;
      } else {
        this.logger.warn(
          `Password reset OTP verification failed for userId ${userId} (dev mode): code mismatch`,
        );
        return false;
      }
    }

    // Production mode: verify against database hash
    // Find active OTP
    const otpRecord = await this.prisma.passwordResetOtp.findFirst({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Anti-enumeration: return false if no OTP found (don't reveal existence)
    if (!otpRecord) {
      this.logger.warn(
        `Password reset OTP verification failed for userId ${userId}: no active OTP`,
      );
      return false;
    }

    // Check if locked (too many attempts)
    if (otpRecord.attemptCount >= this.maxAttempts) {
      this.logger.warn(
        `Password reset OTP verification failed for userId ${userId}: max attempts exceeded`,
      );
      return false;
    }

    // Verify code
    const isValid = await this.verifyOtp(code, otpRecord.otpHash);

    if (isValid) {
      // Delete OTP record after successful verification
      await this.prisma.passwordResetOtp.delete({
        where: { id: otpRecord.id },
      });

      this.logger.log(`Password reset OTP verified successfully for userId ${userId}`);
      return true;
    } else {
      // Increment attempt count
      await this.prisma.passwordResetOtp.update({
        where: { id: otpRecord.id },
        data: { attemptCount: otpRecord.attemptCount + 1 },
      });

      this.logger.warn(
        `Password reset OTP verification failed for userId ${userId}: invalid code (attempt ${otpRecord.attemptCount + 1}/${this.maxAttempts})`,
      );
      return false;
    }
  }

  /**
   * Clear all password reset OTPs for a user (after successful password reset)
   */
  async clearOtpsForUser(userId: string): Promise<void> {
    await this.prisma.passwordResetOtp.deleteMany({
      where: { userId },
    });
    this.logger.log(`Cleared all password reset OTPs for userId ${userId}`);
  }
}
