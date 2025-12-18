import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { useCurrentTenant } from "@/hooks/useTenant";
import { useBranches } from "@/hooks/useBranches";
import {
  useDashboardSummary,
  useMembershipDistribution,
  useMonthlyMembers,
  useRefreshDashboard,
} from "@/features/dashboard/hooks";
import { KpiCard } from "@/features/dashboard/components/KpiCard";
import { MonthlyMembersChart } from "@/features/dashboard/components/MonthlyMembersChart";
import { MembershipDistributionChart } from "@/features/dashboard/components/MembershipDistributionChart";

/**
 * Panel Page - Admin Dashboard
 * Displays KPI cards, charts, and branch filter
 */
export function PanelPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const [selectedBranchId, setSelectedBranchId] = useState<string | undefined>(
    undefined
  );

  // Fetch branches for branch selector
  const { data: branchesData } = useBranches(tenant?.id || "", {
    includeArchived: false,
  });
  const branches = branchesData?.data || [];

  // Fetch dashboard data
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useDashboardSummary(selectedBranchId);

  const {
    data: distribution,
    isLoading: distributionLoading,
    error: distributionError,
  } = useMembershipDistribution(selectedBranchId);

  const {
    data: monthlyMembers,
    isLoading: monthlyMembersLoading,
    error: monthlyMembersError,
  } = useMonthlyMembers(selectedBranchId, 6);

  const refreshDashboard = useRefreshDashboard();

  const isLoading =
    tenantLoading ||
    summaryLoading ||
    distributionLoading ||
    monthlyMembersLoading;

  const hasError =
    summaryError || distributionError || monthlyMembersError;

  const handleRefresh = () => {
    refreshDashboard();
  };

  const handleBranchChange = (value: string) => {
    if (value === "all") {
      setSelectedBranchId(undefined);
    } else {
      setSelectedBranchId(value);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="text-sm text-muted-foreground">
            Salonunuzun genel durumunu ve önemli metrikleri buradan görüntüleyin.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {branches.length > 0 && (
            <Select
              value={selectedBranchId || "all"}
              onValueChange={handleBranchChange}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Şube seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Şubeler</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Error State */}
      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>
            Veriler yüklenirken bir hata oluştu. Lütfen tekrar deneyin.
            <Button
              variant="link"
              className="ml-2 h-auto p-0"
              onClick={handleRefresh}
            >
              Yeniden Dene
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Toplam Üye"
          value={summary?.totalMembers}
          isLoading={summaryLoading}
        />
        <KpiCard
          title="Aktif Üye"
          value={summary?.activeMembers}
          isLoading={summaryLoading}
        />
        <KpiCard
          title="Pasif Üye"
          value={summary?.inactiveMembers}
          isLoading={summaryLoading}
        />
        <KpiCard
          title="Yakında Bitecek"
          value={summary?.expiringSoon}
          description="Sonraki 7 gün"
          isLoading={summaryLoading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-1 lg:col-span-4">
          <MonthlyMembersChart
            data={monthlyMembers}
            isLoading={monthlyMembersLoading}
          />
        </div>
        <div className="col-span-1 lg:col-span-3">
          <MembershipDistributionChart
            data={distribution}
            isLoading={distributionLoading}
          />
        </div>
      </div>
    </div>
  );
}
