import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentTenant } from "@/hooks/useTenant";
import {
  useMembershipPlans,
  useArchivePlan,
  useRestorePlan,
  useDeletePlan,
} from "@/hooks/use-membership-plans";
import { PlanCard } from "@/components/membership-plans/PlanCard";
import { PlanStatus, type MembershipPlan } from "@/types/membership-plan";
import { toast } from "sonner";
import type { ApiError } from "@/types/error";

/**
 * Plan List Page
 * Displays paginated list of plans with filters and search
 */
export function MembershipPlansPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlanStatus | "ALL">("ALL");

  const {
    data: plansData,
    isLoading: plansLoading,
    error: plansError,
  } = useMembershipPlans(tenant?.id || "", {
    page,
    limit,
    ...(search && { search }),
    ...(statusFilter !== "ALL" && { status: statusFilter }),
  });

  const archivePlan = useArchivePlan(tenant?.id || "");
  const restorePlan = useRestorePlan(tenant?.id || "");
  const deletePlan = useDeletePlan(tenant?.id || "");

  const handleArchive = async (plan: MembershipPlan) => {
    if (
      confirm(
        "Bu planı arşivlemek istediğinizden emin misiniz? Arşivlenen planlar yeni üyeliklerde görünmez."
      )
    ) {
      try {
        await archivePlan.mutateAsync(plan.id);
      } catch (error) {
        const apiError = error as ApiError;
        toast.error(apiError.message || "Plan arşivlenirken bir hata oluştu");
      }
    }
  };

  const handleRestore = async (plan: MembershipPlan) => {
    try {
      await restorePlan.mutateAsync(plan.id);
    } catch (error) {
      const apiError = error as ApiError;
      toast.error(apiError.message || "Plan geri yüklenirken bir hata oluştu");
    }
  };

  const handleDelete = async (plan: MembershipPlan) => {
    if (
      confirm(
        "Bu planı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
      )
    ) {
      try {
        await deletePlan.mutateAsync(plan.id);
      } catch (error) {
        const apiError = error as ApiError;
        toast.error(
          apiError.message ||
            "Plan silinirken bir hata oluştu. Planın üyeleri varsa silinemez."
        );
      }
    }
  };

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Üyelik Planları</CardTitle>
            <CardDescription>Salon bilgisi bulunamadı</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const plans = plansData?.data || [];
  const pagination = plansData?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Üyelik Planları
          </h1>
          <p className="text-sm text-muted-foreground">
            Üyelik planlarınızı görüntüleyin ve yönetin.
          </p>
        </div>
        <Button onClick={() => navigate("/membership-plans/new")}>
          Yeni Plan
        </Button>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Plan Listesi</CardTitle>
          <CardDescription>
            Tüm üyelik planlarınızı buradan yönetebilirsiniz
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Label htmlFor="search">Ara</Label>
              <Input
                id="search"
                placeholder="Plan adı ile ara..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full md:w-48">
              <Label htmlFor="status">Durum</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as PlanStatus | "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tümü</SelectItem>
                  <SelectItem value={PlanStatus.ACTIVE}>Aktif</SelectItem>
                  <SelectItem value={PlanStatus.ARCHIVED}>
                    Arşivlenmiş
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Error State */}
          {plansError && (
            <Alert variant="destructive">
              <AlertDescription>
                {(plansError as ApiError).message ||
                  "Planlar yüklenirken bir hata oluştu"}
              </AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {plansLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Plans Grid */}
          {!plansLoading && !plansError && (
            <>
              {plans.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    {search || statusFilter !== "ALL"
                      ? "Arama kriterlerinize uygun plan bulunamadı"
                      : "Henüz plan oluşturulmamış"}
                  </p>
                  {!search && statusFilter === "ALL" && (
                    <Button
                      className="mt-4"
                      onClick={() => navigate("/membership-plans/new")}
                    >
                      İlk Planı Oluştur
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onEdit={(plan) =>
                        navigate(`/membership-plans/${plan.id}/edit`)
                      }
                      onArchive={handleArchive}
                      onRestore={handleRestore}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Toplam {pagination.total} plan, Sayfa {pagination.page} /{" "}
                {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || plansLoading}
                >
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={page === pagination.totalPages || plansLoading}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
