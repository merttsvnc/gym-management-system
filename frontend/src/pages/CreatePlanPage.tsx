import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/useTenant";
import { useCreatePlan } from "@/hooks/use-membership-plans";
import { PlanForm } from "@/components/membership-plans/PlanForm";
import type {
  CreatePlanPayload,
  UpdatePlanPayload,
} from "@/types/membership-plan";

/**
 * Create Plan Page
 * Form for creating a new membership plan
 */
export function CreatePlanPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const navigate = useNavigate();
  const createPlan = useCreatePlan(tenant?.id || "");

  const handleSubmit = async (data: CreatePlanPayload | UpdatePlanPayload) => {
    await createPlan.mutateAsync(data as CreatePlanPayload);
    // Redirect to plan list on success
    navigate("/membership-plans");
  };

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Yeni Plan</CardTitle>
            <CardDescription>Yükleniyor...</CardDescription>
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
            <CardTitle>Yeni Plan</CardTitle>
            <CardDescription>Salon bilgisi bulunamadı</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Üyelik Planı
        </h1>
        <p className="text-sm text-muted-foreground">
          Yeni bir üyelik planı oluşturun.
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Plan Bilgileri</CardTitle>
          <CardDescription>
            Plan bilgilerini doldurun ve kaydedin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanForm
            mode="create"
            onSubmit={handleSubmit}
            onCancel={() => navigate("/membership-plans")}
            isLoading={createPlan.isPending}
            error={createPlan.error}
          />
        </CardContent>
      </Card>
    </div>
  );
}
