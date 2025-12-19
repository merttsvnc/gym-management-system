import { useAuth } from "@/features/auth/useAuth";
import { BillingStatus } from "@/types/billing";

/**
 * Hook to get current billing status
 * @returns Current billing status or null if not available
 */
export function useBillingStatus(): BillingStatus | null {
  const { billingStatus } = useAuth();
  return billingStatus;
}

/**
 * Hook to check if tenant is in read-only mode (PAST_DUE)
 * @returns true if tenant is PAST_DUE, false otherwise
 */
export function useIsReadOnly(): boolean {
  const billingStatus = useBillingStatus();
  return billingStatus === BillingStatus.PAST_DUE;
}

/**
 * Hook to check if tenant is suspended
 * @returns true if tenant is SUSPENDED, false otherwise
 */
export function useIsSuspended(): boolean {
  const billingStatus = useBillingStatus();
  return billingStatus === BillingStatus.SUSPENDED;
}


