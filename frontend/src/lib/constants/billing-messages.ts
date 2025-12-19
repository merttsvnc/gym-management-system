/**
 * Frontend-owned billing constants
 *
 * This file contains:
 * - Error codes matching backend values (for detection)
 * - UI strings owned by frontend (banners, tooltips, locked screen)
 *
 * NOTE: Frontend defines its own error code constants matching backend values.
 * Frontend owns all UI strings - no imports from backend.
 */

/**
 * Billing error codes matching backend values
 * Used for structured error detection (code === "TENANT_BILLING_LOCKED")
 */
export const BILLING_ERROR_CODES = {
  TENANT_BILLING_LOCKED: "TENANT_BILLING_LOCKED",
} as const;

/**
 * Banner messages for billing status banners
 * Frontend-owned UI strings
 */
export const BILLING_BANNER_MESSAGES = {
  PAST_DUE: {
    title: "Ödeme Gecikmesi",
    message:
      "Ödemeniz gecikti. Hesabınız şu anda salt okunur modda. Lütfen ödemenizi tamamlayın.",
    variant: "warning" as const,
  },
  SUSPENDED: {
    title: "Erişim Geçici Olarak Durduruldu",
    message:
      "Ödeme durumunuz nedeniyle yönetim paneline erişiminiz geçici olarak kısıtlanmıştır.",
    variant: "error" as const,
  },
} as const;

/**
 * Tooltip messages for disabled buttons/forms in read-only mode
 * Frontend-owned UI strings
 */
export const BILLING_TOOLTIP_MESSAGES = {
  PAST_DUE_READ_ONLY:
    "Ödeme gecikmesi nedeniyle hesabınız salt okunur modda. Bu işlemi gerçekleştirmek için ödemenizi tamamlayın.",
} as const;
