import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsString,
  IsEnum,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MemberStatus } from '@prisma/client';

export class MemberListQueryDto {
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

  @IsOptional()
  @IsString({ message: 'Şube ID metin olmalıdır' })
  branchId?: string;

  @IsOptional()
  @IsEnum(MemberStatus, {
    message: 'Durum ACTIVE, PAUSED, INACTIVE veya ARCHIVED olmalıdır',
  })
  status?: MemberStatus;

  @IsOptional()
  @IsString({ message: 'Arama metni metin olmalıdır' })
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'includeArchived boolean olmalıdır' })
  includeArchived?: boolean = false;
}
