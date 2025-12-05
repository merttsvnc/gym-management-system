import { IsOptional, IsString, MinLength, MaxLength, IsIn } from 'class-validator';

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
}

