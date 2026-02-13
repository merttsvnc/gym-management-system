/**
 * Response DTO for top selling products endpoint
 * Returns product sales aggregated by productId or customName
 */

export class TopProductItem {
  /**
   * Product name (from catalog or custom name)
   */
  name: string;

  /**
   * Product ID from catalog (null for custom products)
   */
  productId: string | null;

  /**
   * Total quantity sold
   */
  quantity: number;

  /**
   * Total revenue for this product
   * Formatted as string with 2 decimal places
   */
  revenue: string;
}

export class TopProductsResponseDto {
  /**
   * Month key in YYYY-MM format
   */
  month: string;

  /**
   * Currency code (currently always "TRY")
   */
  currency: string;

  /**
   * Array of top selling products ordered by revenue DESC
   */
  items: TopProductItem[];
}
