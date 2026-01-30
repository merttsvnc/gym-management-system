import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class PasswordResetVerifyOtpDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Doğrulama kodu 6 haneli olmalıdır' })
  @Matches(/^\d{6}$/, { message: 'Doğrulama kodu sadece rakamlardan oluşmalıdır' })
  code: string;
}
