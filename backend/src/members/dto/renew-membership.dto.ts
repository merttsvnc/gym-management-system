import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsDateString,
  MaxLength,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class RenewMembershipDto {
  /**
   * Yenileme için kullanılacak plan ID.
   * Verilmezse üyenin mevcut planı kullanılır.
   */
  @IsOptional()
  @IsString({ message: 'Üyelik planı ID metin olmalıdır' })
  membershipPlanId?: string;

  /**
   * Yenileme işlemi sırasında ödeme kaydı oluşturulsun mu?
   * Varsayılan: false
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'createPayment boolean olmalıdır' })
  createPayment?: boolean;

  /**
   * Ödeme tutarı. createPayment=true ise ve verilmezse plan fiyatı kullanılır.
   */
  @ValidateIf((o) => o.createPayment === true)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Ödeme tutarı sayı olmalıdır' })
  @Min(0.01, { message: 'Ödeme tutarı pozitif olmalıdır (minimum 0.01)' })
  @Max(999999.99, { message: 'Ödeme tutarı maksimum 999999.99 olabilir' })
  paymentAmount?: number;

  /**
   * Ödeme yöntemi. createPayment=true ise zorunludur.
   */
  @ValidateIf((o) => o.createPayment === true)
  @IsEnum(PaymentMethod, {
    message:
      'Ödeme yöntemi CASH, CREDIT_CARD, BANK_TRANSFER, CHECK veya OTHER olmalıdır',
  })
  paymentMethod?: PaymentMethod;

  /**
   * Ödeme tarihi (ISO 8601 date string). Verilmezse bugün kullanılır.
   */
  @ValidateIf((o) => o.createPayment === true)
  @IsOptional()
  @IsDateString(
    {},
    { message: 'Geçerli bir ödeme tarihi formatı giriniz (ISO 8601)' },
  )
  paidOn?: string;

  /**
   * Yenileme / ödeme notu.
   */
  @IsOptional()
  @IsString({ message: 'Not metin olmalıdır' })
  @MaxLength(500, { message: 'Not en fazla 500 karakter olabilir' })
  note?: string;
}
