import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Prisma } from '@prisma/client';

/**
 * DTO for updating an existing product
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Product name must be at least 2 characters' })
  @MaxLength(100, { message: 'Product name must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Default price must be a valid number' })
  @Min(0, { message: 'Default price must be 0 or greater' })
  defaultPrice?: number | string | Prisma.Decimal;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Category must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  category?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
