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
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
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
  BILLING_STATUS_UPDATE_FORBIDDEN:
    'Faturalama durumu API üzerinden güncellenemez.',
  RATE_LIMIT_EXCEEDED:
    'Çok fazla giriş denemesi. Lütfen bir süre sonra tekrar deneyin.',
  RATE_LIMIT_EXCEEDED_GENERIC:
    'Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin.',
} as const;
