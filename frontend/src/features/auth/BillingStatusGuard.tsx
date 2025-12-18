import { Navigate } from "react-router-dom";
import { useIsSuspended } from "@/hooks/use-billing-status";

interface BillingStatusGuardProps {
  children: React.ReactNode;
}

/**
 * BillingStatusGuard redirects SUSPENDED tenants to /billing-locked
 * This component should wrap protected routes
 */
export function BillingStatusGuard({ children }: BillingStatusGuardProps) {
  const isSuspended = useIsSuspended();

  if (isSuspended) {
    return <Navigate to="/billing-locked" replace />;
  }

  return <>{children}</>;
}

