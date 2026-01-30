import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export class SignupCompleteDto {
  // Primary field: tenantName (preferred)
  @ValidateIf((o) => !o.gymName)
  @IsString({ message: 'Salon adı gereklidir' })
  @MinLength(2, { message: 'Salon adı en az 2 karakter olmalıdır' })
  @MaxLength(100, { message: 'Salon adı en fazla 100 karakter olabilir' })
  tenantName?: string;

  // Alias field: gymName (for backward compatibility)
  @ValidateIf((o) => !o.tenantName)
  @IsString({ message: 'Salon adı gereklidir' })
  @MinLength(2, { message: 'Salon adı en az 2 karakter olmalıdır' })
  @MaxLength(100, { message: 'Salon adı en fazla 100 karakter olabilir' })
  gymName?: string;

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

  /**
   * Get the tenant name from either tenantName (primary) or gymName (alias)
   * This ensures backward compatibility while preferring the standard field name
   */
  getTenantName(): string {
    const name = this.tenantName || this.gymName || '';
    return name.trim();
  }
}
