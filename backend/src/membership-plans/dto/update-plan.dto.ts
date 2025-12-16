import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  MaxLength,
  Matches,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DurationType, PlanStatus, PlanScope } from '@prisma/client';

export class UpdatePlanDto {
  @IsOptional()
  @IsEnum(PlanScope, {
    message: 'Kapsam TENANT veya BRANCH olmalıdır',
  })
  scope?: PlanScope;

  @IsOptional()
  @IsString({ message: 'Şube kimliği metin olmalıdır' })
  branchId?: string;

  @IsOptional()
  @IsString({ message: 'Plan adı metin olmalıdır' })
  @MaxLength(100, { message: 'Plan adı en fazla 100 karakter olabilir' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Açıklama metin olmalıdır' })
  @MaxLength(1000, { message: 'Açıklama en fazla 1000 karakter olabilir' })
  description?: string;

  @IsOptional()
  @IsEnum(DurationType, {
    message: 'Süre tipi DAYS veya MONTHS olmalıdır',
  })
  durationType?: DurationType;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Süre değeri tam sayı olmalıdır' })
  @Min(1, { message: 'Süre değeri en az 1 olmalıdır' })
  durationValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Fiyat sayı olmalıdır' })
  @Min(0, { message: 'Fiyat negatif olamaz' })
  price?: number;

  @IsOptional()
  @IsString({ message: 'Para birimi metin olmalıdır' })
  @Matches(/^[A-Z]{3}$/, {
    message:
      'Para birimi 3 büyük harfli ISO 4217 formatında olmalıdır (örn: USD, EUR, TRY)',
  })
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Maksimum dondurma günü tam sayı olmalıdır' })
  @Min(0, { message: 'Maksimum dondurma günü negatif olamaz' })
  maxFreezeDays?: number | null;

  @IsOptional()
  @IsBoolean({ message: 'Otomatik yenileme boolean olmalıdır' })
  autoRenew?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sıralama değeri tam sayı olmalıdır' })
  sortOrder?: number | null;

  @IsOptional()
  @IsEnum(PlanStatus, {
    message: 'Durum ACTIVE veya ARCHIVED olmalıdır',
  })
  status?: PlanStatus;
}
