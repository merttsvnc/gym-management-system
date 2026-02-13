/**
 * Response DTO for revenue trend endpoint
 * Returns an array of monthly revenue data
 */

export class MonthlyRevenueData {
  /**
   * Month key in YYYY-MM format
   */
  month: string;

  /**
   * Total membership revenue for the month
   * Formatted as string with 2 decimal places
   */
  membershipRevenue: string;

  /**
   * Total product sales revenue for the month
   * Formatted as string with 2 decimal places
   */
  productRevenue: string;

  /**
   * Total revenue (membership + product)
   * Formatted as string with 2 decimal places
   */
  totalRevenue: string;

  /**
   * Whether the month is locked for financial reporting
   */
  locked: boolean;
}

export class RevenueTrendResponseDto {
  /**
   * Currency code (currently always "TRY")
   */
  currency: string;

  /**
   * Array of monthly revenue data, ordered ASC by month
   */
  months: MonthlyRevenueData[];
}
