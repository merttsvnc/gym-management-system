import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * Query DTO for daily revenue breakdown endpoint
 * GET /reports/revenue/daily?branchId=...&month=YYYY-MM
 */
export class DailyBreakdownQueryDto {
  /**
   * Branch ID for filtering revenue data
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
}
