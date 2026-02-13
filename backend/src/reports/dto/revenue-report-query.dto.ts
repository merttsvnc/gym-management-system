import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * Query DTO for revenue aggregation report endpoint
 * GET /reports/revenue?month=YYYY-MM&branchId=...
 */
export class RevenueReportQueryDto {
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
   * Branch ID for filtering revenue data
   * Required parameter
   */
  @IsString()
  @IsNotEmpty({ message: 'Branch ID is required' })
  branchId: string;
}
