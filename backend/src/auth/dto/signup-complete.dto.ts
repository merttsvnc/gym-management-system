import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class SignupCompleteDto {
  @IsString()
  @MinLength(2, { message: 'Salon adı en az 2 karakter olmalıdır' })
  @MaxLength(100, { message: 'Salon adı en fazla 100 karakter olabilir' })
  gymName: string;

  @IsString()
  @MinLength(2, { message: 'İsim en az 2 karakter olmalıdır' })
  @MaxLength(50, { message: 'İsim en fazla 50 karakter olabilir' })
  ownerName: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  branchName?: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;
}
