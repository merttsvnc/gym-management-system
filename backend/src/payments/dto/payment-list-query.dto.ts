import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class PaymentListQueryDto {
  @IsOptional()
  @IsString({ message: 'Üye ID metin olmalıdır' })
  memberId?: string;

  @IsOptional()
  @IsString({ message: 'Şube ID metin olmalıdır' })
  branchId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod, {
    message:
      'Ödeme yöntemi CASH, CREDIT_CARD, BANK_TRANSFER, CHECK veya OTHER olmalıdır',
  })
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'Geçerli bir başlangıç tarihi formatı giriniz (ISO 8601)' },
  )
  startDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'Geçerli bir bitiş tarihi formatı giriniz (ISO 8601)' },
  )
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'includeCorrections boolean olmalıdır' })
  includeCorrections?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sayfa numarası tam sayı olmalıdır' })
  @Min(1, { message: 'Sayfa numarası en az 1 olmalıdır' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit tam sayı olmalıdır' })
  @Min(1, { message: 'Limit en az 1 olmalıdır' })
  @Max(100, { message: 'Limit en fazla 100 olabilir' })
  limit?: number = 20;
}

