/**
 * Response DTO for revenue aggregation report endpoint
 * Returns monthly revenue breakdown for membership + product sales
 */
export class RevenueReportResponseDto {
  /**
   * Month key in YYYY-MM format
   */
  month: string;

  /**
   * Total membership revenue for the month (from Payment records)
   * Formatted as Decimal string with 2 decimal places
   */
  membershipRevenue: string;

  /**
   * Total product sales revenue for the month (from ProductSale records)
   * Formatted as Decimal string with 2 decimal places
   */
  productRevenue: string;

  /**
   * Total revenue (membership + product)
   * Formatted as Decimal string with 2 decimal places
   */
  totalRevenue: string;

  /**
   * Currency code (currently always "TRY")
   */
  currency: string;

  /**
   * Whether the month is locked for financial reporting
   */
  locked: boolean;
}
