import {
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNumber,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { IsNotFutureDate } from './validators/is-not-future-date.validator';

export class CreatePaymentDto {
  @IsString({ message: 'Üye ID gereklidir' })
  memberId: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Ödeme tutarı sayı olmalıdır' })
  @Min(0.01, { message: 'Ödeme tutarı pozitif olmalıdır (minimum 0.01)' })
  @Max(999999.99, { message: 'Ödeme tutarı maksimum 999999.99 olabilir' })
  amount: number;

  @IsDateString(
    {},
    { message: 'Geçerli bir ödeme tarihi formatı giriniz (ISO 8601)' },
  )
  @IsNotFutureDate({ message: 'Ödeme tarihi gelecekte olamaz' })
  paidOn: string;

  @IsEnum(PaymentMethod, {
    message:
      'Ödeme yöntemi CASH, CREDIT_CARD, BANK_TRANSFER, CHECK veya OTHER olmalıdır',
  })
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString({ message: 'Not metin olmalıdır' })
  @MaxLength(500, { message: 'Not en fazla 500 karakter olabilir' })
  note?: string;
}
