import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for top selling products endpoint
 * GET /reports/products/top?branchId=...&month=YYYY-MM&limit=10
 */
export class TopProductsQueryDto {
  /**
   * Branch ID for filtering product sales data
   * Required parameter
   */
  @IsString()
  @IsNotEmpty({ message: 'Branch ID is required' })
  branchId: string;

  /**
   * Month in YYYY-MM format (e.g., "2026-02")
   * Required parameter
   */
  @IsString()
  @IsNotEmpty({ message: 'Month parameter is required' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Month must be in YYYY-MM format (e.g., 2026-02)',
  })
  month: string;

  /**
   * Maximum number of products to return (default 10)
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number;
}
