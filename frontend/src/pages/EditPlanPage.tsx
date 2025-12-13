import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentTenant } from "@/hooks/useTenant";
import {
  useMembershipPlan,
  useUpdatePlan,
  useArchivePlan,
  useRestorePlan,
} from "@/hooks/use-membership-plans";
import { PlanForm } from "@/components/membership-plans/PlanForm";
import { PlanStatus } from "@/types/membership-plan";
import type { UpdatePlanPayload } from "@/types/membership-plan";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import type { ApiError } from "@/types/error";

/**
 * Edit Plan Page
 * Form page for editing an existing plan with archive/restore functionality
 */
export function EditPlanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const {
    data: plan,
    isLoading: planLoading,
    error: planError,
  } = useMembershipPlan(tenant?.id || "", id || "");

  const updatePlan = useUpdatePlan(tenant?.id || "");
  const archivePlan = useArchivePlan(tenant?.id || "");
  const restorePlan = useRestorePlan(tenant?.id || "");

  const handleSubmit = async (data: UpdatePlanPayload) => {
    if (!id) return;
    await updatePlan.mutateAsync({ planId: id, payload: data });
  };

  const handleArchive = async () => {
    if (!id) return;
    if (
      confirm(
        "Bu planı arşivlemek istediğinizden emin misiniz? Arşivlenen planlar yeni üyeliklerde görünmez."
      )
    ) {
      try {
        await archivePlan.mutateAsync(id);
      } catch (error) {
        const apiError = error as ApiError;
        toast.error(apiError.message || "Plan arşivlenirken bir hata oluştu");
      }
    }
  };

  const handleRestore = async () => {
    if (!id) return;
    try {
      await restorePlan.mutateAsync(id);
    } catch (error) {
      const apiError = error as ApiError;
      toast.error(apiError.message || "Plan geri yüklenirken bir hata oluştu");
    }
  };

  if (tenantLoading || planLoading) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Plan Düzenle</CardTitle>
            <CardDescription>Salon bilgisi bulunamadı</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (planError) {
    const apiError = planError as ApiError;
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>
            {apiError.message || "Plan bilgisi yüklenirken bir hata oluştu"}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/membership-plans")}>
          Plan Listesine Dön
        </Button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>Plan bulunamadı</AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/membership-plans")}>
          Plan Listesine Dön
        </Button>
      </div>
    );
  }

  const isArchived = plan.status === PlanStatus.ARCHIVED;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Plan Düzenle: {plan.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan bilgilerini düzenleyin.
          </p>
        </div>
        <div className="flex gap-2">
          {isArchived ? (
            <Button variant="outline" onClick={handleRestore}>
              <ArchiveRestore className="h-4 w-4 mr-2" />
              Geri Yükle
            </Button>
          ) : (
            <Button variant="outline" onClick={handleArchive}>
              <Archive className="h-4 w-4 mr-2" />
              Arşivle
            </Button>
          )}
        </div>
      </div>

      {/* Warning banner if plan has active members */}
      {!isArchived && (
        <Alert>
          <AlertDescription>
            Bu plana bağlı aktif üyeler varsa, plan değişiklikleri mevcut
            üyelikleri etkilemez. Yalnızca yeni üyelikler için geçerlidir.
          </AlertDescription>
        </Alert>
      )}

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Plan Bilgileri</CardTitle>
          <CardDescription>
            Plan bilgilerini düzenleyin ve kaydedin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanForm
            mode="edit"
            initialData={plan}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/membership-plans")}
            isLoading={updatePlan.isPending}
            error={updatePlan.error}
          />
        </CardContent>
      </Card>
    </div>
  );
}
