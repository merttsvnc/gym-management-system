import {
  IsEmail,
  IsString,
  MinLength,
  Matches,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MatchConstraint } from '../validators/match-constraint.validator';

export class SignupStartDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email: string;

  @IsString()
  @MinLength(10, { message: 'Şifre en az 10 karakter olmalıdır' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Şifre en az 1 harf ve 1 rakam içermelidir',
  })
  password: string;

  @IsString()
  @Validate(MatchConstraint, ['password'], {
    message: 'Şifreler eşleşmiyor',
  })
  passwordConfirm: string;
}
