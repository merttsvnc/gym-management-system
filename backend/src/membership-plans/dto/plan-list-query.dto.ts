import {
  IsOptional,
  IsEnum,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlanStatus } from '@prisma/client';

export class PlanListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sayfa numarası tam sayı olmalıdır' })
  @Min(1, { message: 'Sayfa numarası en az 1 olmalıdır' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit tam sayı olmalıdır' })
  @Min(1, { message: 'Limit en az 1 olmalıdır' })
  @Max(100, { message: 'Limit en fazla 100 olabilir' })
  limit?: number;

  @IsOptional()
  @IsEnum(PlanStatus, {
    message: 'Durum ACTIVE veya ARCHIVED olmalıdır',
  })
  status?: PlanStatus;

  @IsOptional()
  @IsString({ message: 'Arama metni metin olmalıdır' })
  search?: string;
}

