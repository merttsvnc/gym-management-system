import { useState, useEffect } from "react";
import { useCurrentTenant, useUpdateTenant } from "@/hooks/useTenant";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiError } from "@/types/error";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export function TenantSettingsPage() {
  const { data: tenant, isLoading, error } = useCurrentTenant();
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
      setSuccessMessage("Tenant settings updated successfully");
    } catch {
      // Error is handled by the mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Genel Ayarlar</CardTitle>
            <CardDescription>Yükleniyor...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    const apiError = error as ApiError;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Alert variant="destructive">
          <AlertDescription>
            {apiError.message || "Ayarlar yüklenirken hata oluştu"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Alert variant="destructive">
          <AlertDescription>Tenant not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Genel Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          Salonunuzun temel bilgilerini ve görünümünü buradan yönetin.
        </p>
      </div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Salon Bilgileri</CardTitle>
          <CardDescription>Temel salon bilgilerini güncelleyin</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Tenant Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter tenant name"
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
                The unique identifier for your tenant. This cannot be changed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Created At
                </Label>
                <p className="text-sm font-medium">
                  {formatDate(tenant.createdAt)}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Updated At
                </Label>
                <p className="text-sm font-medium">
                  {formatDate(tenant.updatedAt)}
                </p>
              </div>
            </div>

            {updateTenant.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {(updateTenant.error as ApiError).message ||
                    "Failed to update tenant settings"}
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
    </div>
  );
}
