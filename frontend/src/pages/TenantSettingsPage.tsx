import { useState, useEffect } from "react";
import { useCurrentTenant, useUpdateTenant } from "@/hooks/useTenant";
import { useBranches } from "@/hooks/useBranches";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiError } from "@/types/error";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString("tr-TR");
}

// Plan configuration
const PLAN_CONFIG = {
  SINGLE: {
    name: "Starter Plan",
    maxBranches: 3,
    description: "Mevcut planınız en fazla 3 şubeye izin verir.",
  },
};

export function TenantSettingsPage() {
  const { data: tenant, isLoading, error } = useCurrentTenant();
  const { data: branchesData } = useBranches(tenant?.id || "", {
    includeArchived: false,
  });
  const updateTenant = useUpdateTenant();
  const [name, setName] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(tenant.name);
    }
  }, [tenant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);

    try {
      await updateTenant.mutateAsync({ name });
      setSuccessMessage("Salon ayarları başarıyla güncellendi");
    } catch {
      // Error is handled by the mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>Salon Ayarları</CardTitle>
            <CardDescription>Yükleniyor...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    const apiError = error as ApiError;
    return (
      <div className="space-y-6">
        <Alert variant="destructive" className="max-w-4xl">
          <AlertDescription>
            {apiError.message || "Ayarlar yüklenirken hata oluştu"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive" className="max-w-4xl">
          <AlertDescription>Salon bilgisi bulunamadı</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Calculate active branches count and plan info
  const activeBranchesCount = branchesData?.data.length || 0;
  const planConfig = PLAN_CONFIG[tenant.planKey];
  const maxBranches = planConfig.maxBranches;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Salon Ayarları
        </h1>
        <p className="text-sm text-muted-foreground">
          Salonunuzun temel bilgilerini ve plan durumunu buradan yönetin.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Card 1: Salon Bilgileri */}
        <Card>
          <CardHeader>
            <CardTitle>Salon Bilgileri</CardTitle>
            <CardDescription>
              Temel salon bilgilerini güncelleyin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Salon Adı</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Salon adını giriniz"
                  required
                  minLength={3}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <div className="relative">
                  <Input
                    id="slug"
                    value={tenant.slug}
                    disabled
                    className="bg-muted/50 text-muted-foreground font-mono"
                  />
                </div>
                <p className="text-[0.8rem] text-muted-foreground">
                  Bu kimlik değiştirilemez ve sistem tarafından kullanılır.
                </p>
              </div>

              {/* Timestamps */}
              <div className="pt-4 border-t space-y-1">
                <p className="text-xs text-muted-foreground">
                  Oluşturulma tarihi: {formatDate(tenant.createdAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Son güncelleme: {formatDate(tenant.updatedAt)}
                </p>
              </div>

              {updateTenant.error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {(updateTenant.error as ApiError).message ||
                      "Ayarlar güncellenirken hata oluştu"}
                  </AlertDescription>
                </Alert>
              )}

              {successMessage && (
                <Alert>
                  <AlertDescription>{successMessage}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="default"
                  disabled={updateTenant.isPending || name === tenant.name}
                >
                  {updateTenant.isPending ? "Kaydediliyor..." : "Kaydet"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Card 2: Plan ve Kullanım */}
        <Card>
          <CardHeader>
            <CardTitle>Plan ve kullanım</CardTitle>
            <CardDescription>
              Mevcut planınız ve şube kullanım durumunuz.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Plan Info */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Plan Adı</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  {tenant.planKey}
                </Badge>
                <span className="text-sm">{planConfig.name}</span>
              </div>
            </div>

            {/* Branch Usage */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Şube Kullanımı</Label>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {activeBranchesCount}
                </span>
                <span className="text-muted-foreground">/ {maxBranches}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {planConfig.description}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button variant="outline" disabled>
              Planı yükselt
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
