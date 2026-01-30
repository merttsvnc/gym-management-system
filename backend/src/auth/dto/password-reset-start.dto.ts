import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class PasswordResetStartDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email: string;
}
