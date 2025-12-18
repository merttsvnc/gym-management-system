/**
 * Global API error handler for billing status errors
 *
 * This handler:
 * - Detects billing lock ONLY via structured error code (code === "TENANT_BILLING_LOCKED")
 * - Does NOT use message text for detection (error code is authoritative)
 * - Redirects SUSPENDED tenants to /billing-locked (not /login)
 * - Preserves JWT token for PAST_DUE status (read-only access)
 * - Shows toast notifications for billing-related errors
 */

import { toast } from "sonner";
import type { ApiError } from "@/types/error";
import { BILLING_ERROR_CODES } from "@/lib/constants/billing-messages";
import { BILLING_BANNER_MESSAGES } from "@/lib/constants/billing-messages";

/**
 * Check if error is a billing lock error via structured error code
 * Error code is the ONLY authoritative source for detection
 *
 * NestJS formats ForbiddenException({ code, message }) as:
 * { statusCode: 403, message: "...", code: "TENANT_BILLING_LOCKED" }
 * or
 * { code: "TENANT_BILLING_LOCKED", message: "..." }
 */
function isBillingLockError(error: ApiError): boolean {
  // Check for structured error code in details (from toApiError conversion)
  if (
    error.details &&
    typeof error.details === "object" &&
    "code" in error.details &&
    error.details.code === BILLING_ERROR_CODES.TENANT_BILLING_LOCKED
  ) {
    return true;
  }

  // Also check if error object itself has code property (direct from axios response)
  if (
    "code" in error &&
    typeof error.code === "string" &&
    error.code === BILLING_ERROR_CODES.TENANT_BILLING_LOCKED
  ) {
    return true;
  }

  // Check if error is an axios error with response.data.code
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "code" in error.response.data &&
    error.response.data.code === BILLING_ERROR_CODES.TENANT_BILLING_LOCKED
  ) {
    return true;
  }

  return false;
}

/**
 * Handle billing lock error (SUSPENDED status)
 * Redirects to /billing-locked and optionally clears JWT
 */
function handleBillingLock(_error: ApiError): void {
  // Optionally clear JWT token for SUSPENDED status
  // Note: For SUSPENDED, we redirect to locked screen, so clearing token is optional
  try {
    // Clear auth tokens if needed
    localStorage.removeItem("gymms_auth");
    localStorage.removeItem("jwt_token");
  } catch {
    console.warn("⚠️ Could not clear auth tokens from localStorage");
  }

  // Dispatch custom event for components listening
  window.dispatchEvent(new Event("auth:billing-locked"));

  // Redirect to billing locked screen (NOT /login)
  window.location.href = "/billing-locked";
}

/**
 * Handle PAST_DUE mutation error
 * Preserves JWT token and shows toast notification
 */
function handlePastDueError(_error: ApiError): void {
  // Preserve JWT token - user remains logged in for read-only access
  // Do NOT redirect to login

  // Show toast notification
  toast.error(BILLING_BANNER_MESSAGES.PAST_DUE.title, {
    description: BILLING_BANNER_MESSAGES.PAST_DUE.message,
  });
}

/**
 * Handle billing-related errors from API responses
 * This function is called by React Query error handlers and axios interceptors
 *
 * NOTE: For 403 errors, billing lock detection should be done in the axios interceptor
 * by checking response.data.code directly. This function is kept for React Query usage.
 */
export function handleBillingError(error: unknown): void {
  const apiError = error as ApiError;

  // Only handle 403 Forbidden errors (billing restrictions)
  if (apiError.statusCode !== 403) {
    return;
  }

  // Detect billing lock ONLY via structured error code
  // Error code is the ONLY authoritative source - do NOT check message text
  if (isBillingLockError(apiError)) {
    handleBillingLock(apiError);
    return;
  }

  // For other 403 errors, check if it's a PAST_DUE mutation attempt
  // This is detected by the error message (since backend doesn't return error code for PAST_DUE mutations)
  // Note: This is a fallback - ideally backend should return structured error codes for all billing errors
  const message = apiError.message?.toLowerCase() || "";
  if (
    message.includes("salt okunur") ||
    message.includes("read-only") ||
    message.includes("ödeme gecikmesi")
  ) {
    handlePastDueError(apiError);
    return;
  }
}

/**
 * React Query error handler wrapper
 * Use this in React Query mutation/query onError callbacks
 */
export function reactQueryBillingErrorHandler(error: unknown): void {
  handleBillingError(error);
}

/**
 * Check if error should skip global toast (already handled by billing handler)
 */
export function shouldSkipBillingToast(error: unknown): boolean {
  const apiError = error as ApiError;
  if (apiError.statusCode !== 403) {
    return false;
  }

  // Skip toast if it's a billing lock error (we redirect instead)
  if (isBillingLockError(apiError)) {
    return true;
  }

  // Skip toast if it's a PAST_DUE error (we show custom toast)
  const message = apiError.message?.toLowerCase() || "";
  if (
    message.includes("salt okunur") ||
    message.includes("read-only") ||
    message.includes("ödeme gecikmesi")
  ) {
    return true;
  }

  return false;
}

