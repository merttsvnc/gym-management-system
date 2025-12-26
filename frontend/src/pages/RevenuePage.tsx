import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentTenant } from "@/hooks/useTenant";
import { RevenueReport } from "@/components/payments/RevenueReport";

/**
 * Revenue Page - Revenue Reports
 * Displays revenue reports with filters for date range, branch, and payment method
 */
export function RevenuePage() {
  const { data: tenant, isLoading: tenantLoading, error: tenantError } = useCurrentTenant();

  if (tenantLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (tenantError) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertDescription>
            {tenantError.message || "Kiracı bilgileri yüklenirken bir hata oluştu"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertDescription>
            Kiracı bilgisi bulunamadı
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Gelir Raporları</h1>
        <p className="text-muted-foreground mt-2">
          Tarih aralığı, şube ve ödeme yöntemine göre gelir raporlarını görüntüleyin
        </p>
      </div>
      <RevenueReport tenantId={tenant.id} />
    </div>
  );
}

