/**
 * Billing error codes and server-side error messages
 *
 * These constants are used by the backend for:
 * - Error response codes (structured error codes for frontend detection)
 * - Server-side error messages (for API responses and logs)
 *
 * NOTE: Frontend owns all UI strings (banners, tooltips, locked screen text).
 * Backend does NOT export UI-facing strings.
 */

/**
 * Billing error codes
 * These codes are used in structured error responses for frontend detection
 */
export const BILLING_ERROR_CODES = {
  TENANT_BILLING_LOCKED: 'TENANT_BILLING_LOCKED',
  /**
   * Replaces the legacy TRIAL_EXPIRED code.
   * Returned as a 402 PAYMENT_REQUIRED when no RevenueCat entitlement snapshot
   * exists for the tenant and no qualifying legacy access is active.
   * Free trial is now exclusively managed via StoreKit / RevenueCat introductory offers.
   */
  BILLING_REQUIRED: 'BILLING_REQUIRED',
  /** No RevenueCat snapshot and no qualifying legacy access; mutations require in-app purchase / entitlement. */
  PREMIUM_REQUIRED: 'PREMIUM_REQUIRED',
} as const;

/**
 * Billing error messages (server-side only)
 * These messages are used in API responses and server logs
 * Frontend owns all UI strings (banners, tooltips, etc.)
 */
export const BILLING_ERROR_MESSAGES = {
  SUSPENDED_LOGIN:
    'Hesabınız askıya alınmıştır. Lütfen destek ekibi ile iletişime geçin.',
  SUSPENDED_ACCESS:
    'Hesabınız askıya alınmıştır. Lütfen destek ekibi ile iletişime geçin.',
  PAST_DUE_MUTATION:
    'Ödeme gecikmesi nedeniyle hesabınız salt okunur modda. Lütfen ödemenizi tamamlayın.',
  PREMIUM_REQUIRED: 'Premium subscription is required for this action.',
  /** Mutations blocked: premium is not active (RevenueCat snapshot present or legacy path evaluated; not payment-delay-specific). */
  PREMIUM_MUTATIONS_LOCKED:
    'Bu işlem için aktif premium gerekir. Şu anda hesabınız salt okunur; yazma işlemleri kapalı.',
  BILLING_STATUS_UPDATE_FORBIDDEN:
    'Faturalama durumu API üzerinden güncellenemez.',
  RATE_LIMIT_EXCEEDED:
    'Çok fazla giriş denemesi. Lütfen bir süre sonra tekrar deneyin.',
  RATE_LIMIT_EXCEEDED_GENERIC:
    'Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin.',
} as const;
