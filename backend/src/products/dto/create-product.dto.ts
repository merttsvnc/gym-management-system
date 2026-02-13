import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Prisma } from '@prisma/client';

/**
 * DTO for creating a new product
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  @MinLength(2, { message: 'Product name must be at least 2 characters' })
  @MaxLength(100, { message: 'Product name must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsNotEmpty({ message: 'Default price is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Default price must be a valid number' })
  @Min(0, { message: 'Default price must be 0 or greater' })
  defaultPrice: number | string | Prisma.Decimal;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Category must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  category?: string;
}
