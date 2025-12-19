/**
 * Global API error handler for billing status errors
 *
 * This handler:
 * - Detects billing lock ONLY via structured error code (code === "TENANT_BILLING_LOCKED")
 * - Does NOT use message text for detection (error code is authoritative)
 * - Redirects SUSPENDED tenants to /billing-locked (not /login)
 * - Preserves JWT token for PAST_DUE status (read-only access)
 * - Shows toast notifications for billing-related errors
 * - Invalidates React Query cache and user context on mid-session status changes
 */

import { toast } from "sonner";
import type { ApiError } from "@/types/error";
import { BILLING_ERROR_CODES } from "@/lib/constants/billing-messages";
import { BILLING_BANNER_MESSAGES } from "@/lib/constants/billing-messages";
import type { BillingStatus } from "@/types/billing";
import { queryClient } from "./query-client";

/**
 * Get billing status from localStorage
 * Returns null if not available or if localStorage is not accessible
 */
function getBillingStatusFromStorage(): BillingStatus | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }

    const stored = localStorage.getItem("gymms_auth");
    if (!stored) {
      return null;
    }

    const authData = JSON.parse(stored);
    return authData.billingStatus || null;
  } catch {
    return null;
  }
}

/**
 * Check if error is a billing lock error via structured error code
 * Error code is the ONLY authoritative source for detection
 *
 * NestJS formats ForbiddenException({ code, message }) as:
 * { statusCode: 403, message: "...", code: "TENANT_BILLING_LOCKED" }
 * or
 * { code: "TENANT_BILLING_LOCKED", message: "..." }
 */
function isBillingLockError(error: ApiError | unknown): boolean {
  // Type guard to check if error has ApiError structure
  if (!error || typeof error !== "object") {
    return false;
  }

  // Check if error object itself has code property (from toApiError conversion)
  if (
    "code" in error &&
    typeof error.code === "string" &&
    error.code === BILLING_ERROR_CODES.TENANT_BILLING_LOCKED
  ) {
    return true;
  }

  // Check for structured error code in details (fallback for nested structures)
  if (
    "details" in error &&
    error.details &&
    typeof error.details === "object" &&
    "code" in error.details &&
    error.details.code === BILLING_ERROR_CODES.TENANT_BILLING_LOCKED
  ) {
    return true;
  }

  // Check if error is an axios error with response.data.code (direct axios error)
  if (
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
 * Invalidate user session cache (React Query cache, user context)
 * Called when billing status changes mid-session
 */
function invalidateUserSessionCache(): void {
  // Invalidate all React Query queries to force refetch
  queryClient.invalidateQueries();

  // Clear all cached queries
  queryClient.clear();

  // Dispatch custom event for auth context to update billing status
  window.dispatchEvent(new CustomEvent("auth:billing-status-changed"));
}

/**
 * Handle billing lock error (SUSPENDED status)
 * Redirects to /billing-locked and optionally clears JWT
 * Invalidates user session cache before redirect
 */
function handleBillingLock(): void {
  // Invalidate user session cache first
  invalidateUserSessionCache();

  // Optionally clear JWT token for SUSPENDED status
  // Note: For SUSPENDED, we redirect to locked screen, so clearing token is optional
  try {
    // Clear auth tokens if needed
    localStorage.removeItem("gymms_auth");
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
 * Does NOT redirect to login
 * Invalidates cache to trigger UI updates (banner, read-only indicators)
 */
function handlePastDueError(): void {
  // Invalidate user session cache to trigger UI updates
  // This ensures banner and read-only indicators appear immediately
  invalidateUserSessionCache();

  // Preserve JWT token - user remains logged in for read-only access
  // Do NOT redirect to login
  // Do NOT clear JWT token

  // Show toast notification
  toast.error(BILLING_BANNER_MESSAGES.PAST_DUE.title, {
    description: BILLING_BANNER_MESSAGES.PAST_DUE.message,
  });
}

/**
 * Handle billing-related errors from API responses
 * This function is called by React Query error handlers and axios interceptors
 *
 * Detection is done ONLY via structured error code (code === "TENANT_BILLING_LOCKED").
 * Message text is NOT used for detection - error code is authoritative.
 *
 * Mid-session enforcement relies on backend authority: when any API request returns
 * 403 with code === "TENANT_BILLING_LOCKED", this handler detects it and applies
 * appropriate actions (redirect for SUSPENDED, toast for PAST_DUE).
 */
export function handleBillingError(error: unknown): void {
  const apiError = error as ApiError;

  // Only handle 403 Forbidden errors (billing restrictions)
  if (apiError.statusCode !== 403) {
    return;
  }

  // Detect billing lock ONLY via structured error code
  // Error code is the ONLY authoritative source - do NOT check message text
  // This ensures mid-session status changes are detected immediately via backend authority
  if (!isBillingLockError(apiError)) {
    // Not a billing lock error - could be other 403 errors (permission denied, etc.)
    // Let other error handlers deal with it
    return;
  }

  // Differentiate PAST_DUE vs SUSPENDED using billing status from localStorage
  // Both use the same error code, so we check the current billing status
  const billingStatus = getBillingStatusFromStorage();

  if (billingStatus === "PAST_DUE") {
    // PAST_DUE: Show toast, preserve JWT, do NOT redirect
    // User remains logged in for read-only access
    handlePastDueError();
  } else {
    // SUSPENDED or unknown: Redirect to /billing-locked
    // Default to SUSPENDED behavior if billing status is not available
    // This handles mid-session transitions from ACTIVE → SUSPENDED
    handleBillingLock();
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
 * Uses ONLY structured error codes for detection - no message text parsing
 */
export function shouldSkipBillingToast(error: unknown): boolean {
  const apiError = error as ApiError;
  if (apiError.statusCode !== 403) {
    return false;
  }

  // Skip toast if it's a billing lock error
  // For SUSPENDED: we redirect (skip toast)
  // For PAST_DUE: we show custom toast (skip global toast)
  if (isBillingLockError(apiError)) {
    return true;
  }

  return false;
}
