import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { BillingStatus } from "@/types/billing";
import { BILLING_BANNER_MESSAGES } from "@/lib/constants/billing-messages";
import { AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BillingStatusBanner component displays a persistent banner
 * for PAST_DUE and SUSPENDED billing statuses
 */
export function BillingStatusBanner() {
  const billingStatus = useBillingStatus();

  // Don't render if billing status is not PAST_DUE or SUSPENDED
  if (
    billingStatus !== BillingStatus.PAST_DUE &&
    billingStatus !== BillingStatus.SUSPENDED
  ) {
    return null;
  }

  const bannerConfig =
    billingStatus === BillingStatus.PAST_DUE
      ? BILLING_BANNER_MESSAGES.PAST_DUE
      : BILLING_BANNER_MESSAGES.SUSPENDED;

  const Icon =
    billingStatus === BillingStatus.PAST_DUE ? AlertTriangle : XCircle;

  return (
    <Alert
      variant={billingStatus === BillingStatus.SUSPENDED ? "destructive" : "default"}
      className={cn(
        "mb-4 border-2",
        billingStatus === BillingStatus.PAST_DUE &&
          "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-600",
        billingStatus === BillingStatus.SUSPENDED &&
          "border-red-500 bg-red-50 dark:bg-red-950/20 dark:border-red-600"
      )}
    >
      <Icon className="h-5 w-5" />
      <AlertTitle className="font-semibold">{bannerConfig.title}</AlertTitle>
      <AlertDescription className="mt-1">
        {bannerConfig.message}
      </AlertDescription>
    </Alert>
  );
}


