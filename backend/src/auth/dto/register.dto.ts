import {
  IsString,
  IsEmail,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Password must contain at least 1 letter and 1 number',
  })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  branchName?: string;

  @IsOptional()
  @IsString()
  branchAddress?: string; // Can be empty string, defaults to empty if not provided
}
