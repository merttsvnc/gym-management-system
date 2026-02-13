/**
 * Response DTO for daily revenue breakdown endpoint
 * Returns day-by-day revenue data for a given month
 */

export class DailyRevenueData {
  /**
   * Date in YYYY-MM-DD format
   */
  date: string;

  /**
   * Total membership revenue for the day
   * Formatted as string with 2 decimal places
   */
  membershipRevenue: string;

  /**
   * Total product sales revenue for the day
   * Formatted as string with 2 decimal places
   */
  productRevenue: string;

  /**
   * Total revenue (membership + product)
   * Formatted as string with 2 decimal places
   */
  totalRevenue: string;
}

export class DailyBreakdownResponseDto {
  /**
   * Month key in YYYY-MM format
   */
  month: string;

  /**
   * Currency code (currently always "TRY")
   */
  currency: string;

  /**
   * Array of daily revenue data, includes all days in month
   */
  days: DailyRevenueData[];
}
