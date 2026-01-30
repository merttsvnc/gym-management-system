import {
  IsString,
  MinLength,
  Matches,
  Validate,
} from 'class-validator';
import { MatchConstraint } from '../validators/match-constraint.validator';

export class PasswordResetCompleteDto {
  @IsString()
  @MinLength(10, { message: 'Şifre en az 10 karakter olmalıdır' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Şifre en az 1 harf ve 1 rakam içermelidir',
  })
  newPassword: string;

  @IsString()
  @Validate(MatchConstraint, ['newPassword'], {
    message: 'Şifreler eşleşmiyor',
  })
  newPasswordConfirm: string;
}
