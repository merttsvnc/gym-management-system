import {
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsString,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for querying product sales
 */
export class ProductSaleQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'from must be a valid ISO date string' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to must be a valid ISO date string' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must not exceed 100' })
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset must be an integer' })
  @Min(0, { message: 'offset must be 0 or greater' })
  offset?: number = 0;

  @IsString()
  @IsNotEmpty({ message: 'branchId query parameter is required' })
  branchId: string;
}
