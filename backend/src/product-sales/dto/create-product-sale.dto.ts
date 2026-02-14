import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsInt,
  IsNumber,
  ValidateNested,
  ArrayMinSize,
  Min,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsProductIdOrUuid } from '../../common/validators/is-product-id.validator';
import { Type } from 'class-transformer';
import { PaymentMethod, Prisma } from '@prisma/client';

/**
 * DTO for a single sale item
 * Enforces XOR rule: exactly one of productId or customName must be provided
 */
export class SaleItemDto {
  @IsOptional()
  @IsString()
  @IsProductIdOrUuid({ message: 'productId must be either CUID or UUID format' })
  @ValidateIf((o) => !o.customName)
  productId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Custom name must be at least 2 characters' })
  @MaxLength(200, { message: 'Custom name must not exceed 200 characters' })
  @ValidateIf((o) => !o.productId)
  customName?: string;

  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Unit price must be a valid number' })
  @Min(0, { message: 'Unit price must be 0 or greater' })
  unitPrice?: number | string | Prisma.Decimal;
}

/**
 * DTO for creating a new product sale
 */
export class CreateProductSaleDto {
  @IsOptional()
  @IsDateString({}, { message: 'soldAt must be a valid ISO date string' })
  soldAt?: string;

  @IsEnum(PaymentMethod, {
    message: `Payment method must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Note must not exceed 500 characters' })
  note?: string;

  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'At least one item is required' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
