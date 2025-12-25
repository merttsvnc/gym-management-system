import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsIn,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export type RevenueGroupBy = 'day' | 'week' | 'month';

export class RevenueReportQueryDto {
  @IsDateString(
    {},
    { message: 'Geçerli bir başlangıç tarihi formatı giriniz (ISO 8601)' },
  )
  startDate: string;

  @IsDateString(
    {},
    { message: 'Geçerli bir bitiş tarihi formatı giriniz (ISO 8601)' },
  )
  endDate: string;

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
  @IsIn(['day', 'week', 'month'], {
    message: 'Grup by değeri day, week veya month olmalıdır',
  })
  groupBy?: RevenueGroupBy = 'day';
}
