import { LockedScreen } from "@/components/billing/LockedScreen";

/**
 * BillingLockedPage displays the locked screen for SUSPENDED tenants
 * This route is accessible without redirecting to login
 */
export function BillingLockedPage() {
  return <LockedScreen />;
}


