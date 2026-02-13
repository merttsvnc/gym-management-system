/**
 * Response DTO for payment method breakdown endpoint
 * Returns revenue grouped by payment method for membership and product sales
 */

export class PaymentMethodAmount {
  /**
   * Payment method enum value (CASH, CREDIT_CARD, etc.)
   */
  paymentMethod: string;

  /**
   * Total amount for this payment method
   * Formatted as string with 2 decimal places
   */
  amount: string;
}

export class PaymentMethodBreakdownResponseDto {
  /**
   * Month key in YYYY-MM format
   */
  month: string;

  /**
   * Currency code (currently always "TRY")
   */
  currency: string;

  /**
   * Membership revenue grouped by payment method
   */
  membershipByMethod: PaymentMethodAmount[];

  /**
   * Product sales revenue grouped by payment method
   */
  productSalesByMethod: PaymentMethodAmount[];
}
