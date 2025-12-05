import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsIn,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
  'INR',
  'BRL',
  'MXN',
  'ZAR',
  'TRY',
  'SGD',
  'HKD',
  'NZD',
] as const;

function AtLeastOneProperty() {
  return function (object: Object, propertyName: string) {
    // Custom validation will be done in controller
  };
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  defaultCurrency?: string;

  /**
   * Validates that at least one property is provided
   */
  static hasAtLeastOneProperty(dto: UpdateTenantDto): boolean {
    return dto.name !== undefined || dto.defaultCurrency !== undefined;
  }
}
