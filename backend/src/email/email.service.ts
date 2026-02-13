import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly isEmailEnabled: boolean;
  private readonly devFixedCode: string | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const emailVerificationEnabled =
      this.configService.get<string>('AUTH_EMAIL_VERIFICATION_ENABLED') ===
      'true';
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    // Security: Prevent disabling email verification in production
    if (nodeEnv === 'production' && !emailVerificationEnabled) {
      throw new Error(
        'AUTH_EMAIL_VERIFICATION_ENABLED must be true in production',
      );
    }

    this.isEmailEnabled = emailVerificationEnabled;
    this.devFixedCode =
      this.configService.get<string>('AUTH_OTP_DEV_FIXED_CODE') || null;

    if (this.isEmailEnabled && apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.resend = null;
      if (nodeEnv !== 'production') {
        this.logger.warn(
          'Email verification disabled or RESEND_API_KEY not set. OTP emails will not be sent.',
        );
      }
    }
  }

  /**
   * Send OTP email via Resend
   * In dev/QA mode with email disabled, this is a no-op (OTP bypass handled elsewhere)
   */
  async sendOtpEmail(email: string, otp: string): Promise<void> {
    if (!this.isEmailEnabled || !this.resend) {
      // In dev mode, skip sending email
      this.logger.debug(`Skipping email send for ${email} (email disabled)`);
      return;
    }

    try {
      await this.resend.emails.send({
        from:
          this.configService.get<string>('RESEND_FROM_EMAIL') ||
          'noreply@example.com',
        to: email,
        subject: 'Doğrulama Kodu - Gym Management',
        html: this.getOtpEmailTemplate(otp),
      });

      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}`, error);
      // Don't throw - we want to avoid leaking email existence
      // Logging is sufficient for monitoring
    }
  }

  /**
   * Send password reset OTP email via Resend
   * In dev/QA mode with email disabled, this is a no-op (OTP bypass handled elsewhere)
   */
  async sendPasswordResetOtpEmail(email: string, otp: string): Promise<void> {
    if (!this.isEmailEnabled || !this.resend) {
      // In dev mode, skip sending email
      this.logger.debug(
        `Skipping password reset email send for ${email} (email disabled)`,
      );
      return;
    }

    try {
      await this.resend.emails.send({
        from:
          this.configService.get<string>('RESEND_FROM_EMAIL') ||
          'noreply@example.com',
        to: email,
        subject: 'Şifre Sıfırlama Doğrulama Kodu - Gym Management',
        html: this.getPasswordResetOtpEmailTemplate(otp),
      });

      this.logger.log(`Password reset OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset OTP email to ${email}`,
        error,
      );
      // Don't throw - we want to avoid leaking email existence
      // Logging is sufficient for monitoring
    }
  }

  /**
   * Get OTP email template in Turkish
   */
  private getOtpEmailTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Doğrulama Kodu</h2>
          <p>Merhaba,</p>
          <p>Gym Management sistemine kayıt olmak için doğrulama kodunuz:</p>
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <h1 style="font-size: 32px; letter-spacing: 8px; color: #2563eb; margin: 0;">${otp}</h1>
          </div>
          <p>Bu kod 10 dakika geçerlidir.</p>
          <p>Eğer bu işlemi siz yapmadıysanız, lütfen bu e-postayı görmezden gelin.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280;">Bu otomatik bir e-postadır, lütfen yanıtlamayın.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get password reset OTP email template in Turkish
   */
  private getPasswordResetOtpEmailTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Şifre Sıfırlama Doğrulama Kodu</h2>
          <p>Merhaba,</p>
          <p>Gym Management hesabınızın şifresini sıfırlamak için doğrulama kodunuz:</p>
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <h1 style="font-size: 32px; letter-spacing: 8px; color: #2563eb; margin: 0;">${otp}</h1>
          </div>
          <p>Bu kod 10 dakika geçerlidir.</p>
          <p>Eğer bu işlemi siz yapmadıysanız, lütfen bu e-postayı görmezden gelin ve hesabınızın güvenliği için şifrenizi değiştirmenizi öneririz.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280;">Bu otomatik bir e-postadır, lütfen yanıtlamayın.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Check if email sending is enabled
   */
  isEnabled(): boolean {
    return this.isEmailEnabled;
  }

  /**
   * Get dev fixed OTP code (for testing)
   */
  getDevFixedCode(): string | null {
    return this.devFixedCode;
  }
}
