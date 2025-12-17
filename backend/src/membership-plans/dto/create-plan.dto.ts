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
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DurationType, PlanScope } from '@prisma/client';

export class CreatePlanDto {
  @IsEnum(PlanScope, {
    message: 'Kapsam TENANT veya BRANCH olmalıdır',
  })
  scope: PlanScope;

  @ValidateIf((o: CreatePlanDto) => o.scope === PlanScope.BRANCH)
  @IsNotEmpty({ message: 'BRANCH kapsamı için şube ID gereklidir' })
  @IsString({ message: 'Şube ID metin olmalıdır' })
  branchId?: string;

  @IsString({ message: 'Plan adı gereklidir' })
  @MaxLength(100, { message: 'Plan adı en fazla 100 karakter olabilir' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Açıklama metin olmalıdır' })
  @MaxLength(1000, { message: 'Açıklama en fazla 1000 karakter olabilir' })
  description?: string;

  @IsEnum(DurationType, {
    message: 'Süre tipi DAYS veya MONTHS olmalıdır',
  })
  durationType: DurationType;

  @Type(() => Number)
  @IsInt({ message: 'Süre değeri tam sayı olmalıdır' })
  @Min(1, { message: 'Süre değeri en az 1 olmalıdır' })
  durationValue: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Fiyat sayı olmalıdır' })
  @Min(0, { message: 'Fiyat negatif olamaz' })
  price: number;

  @IsString({ message: 'Para birimi gereklidir' })
  @Matches(/^[A-Z]{3}$/, {
    message:
      'Para birimi 3 büyük harfli ISO 4217 formatında olmalıdır (örn: USD, EUR, TRY)',
  })
  currency: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Maksimum dondurma günü tam sayı olmalıdır' })
  @Min(0, { message: 'Maksimum dondurma günü negatif olamaz' })
  maxFreezeDays?: number;

  @IsOptional()
  @IsBoolean({ message: 'Otomatik yenileme boolean olmalıdır' })
  autoRenew?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sıralama değeri tam sayı olmalıdır' })
  sortOrder?: number;
}
