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
 * Query DTO for revenue trend endpoint
 * GET /reports/revenue/trend?branchId=...&months=6
 */
export class RevenueTrendQueryDto {
  /**
   * Branch ID for filtering revenue data
   * Required parameter
   */
  @IsString()
  @IsNotEmpty({ message: 'Branch ID is required' })
  branchId: string;

  /**
   * Number of months to return (default 6, max 24)
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Months must be an integer' })
  @Min(1, { message: 'Months must be at least 1' })
  @Max(24, { message: 'Months cannot exceed 24' })
  months?: number;
}
