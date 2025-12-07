import React, { useState } from "react";
import { useCurrentTenant } from "@/hooks/useTenant";
import {
  useBranches,
  useArchiveBranch,
  useRestoreBranch,
  useSetDefaultBranch,
} from "@/hooks/useBranches";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BranchFormDialog } from "@/features/branches/BranchFormDialog";
import type { ApiError } from "@/types/error";
import type { Branch } from "@/types/branch";

// Plan limits - currently hardcoded for SINGLE plan
const MAX_BRANCHES_SINGLE_PLAN = 3;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export function BranchesPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const {
    data: branchesData,
    isLoading: branchesLoading,
    error: branchesError,
  } = useBranches(tenant?.id || "", { includeArchived });

  const archiveBranch = useArchiveBranch(tenant?.id || "");
  const restoreBranch = useRestoreBranch(tenant?.id || "");
  const setDefaultBranch = useSetDefaultBranch(tenant?.id || "");

  const handleArchive = async (branchId: string) => {
    if (
      confirm(
        "Bu şubeyi arşivlemek istediğinizden emin misiniz? Daha sonra geri yükleyebilirsiniz."
      )
    ) {
      try {
        await archiveBranch.mutateAsync(branchId);
      } catch {
        // Error handled by mutation state
      }
    }
  };

  const handleRestore = async (branchId: string) => {
    try {
      await restoreBranch.mutateAsync(branchId);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSetDefault = async (branchId: string) => {
    try {
      await setDefaultBranch.mutateAsync(branchId);
    } catch {
      // Error handled by mutation state
    }
  };

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Şubeler</CardTitle>
            <CardDescription>Yükleniyor...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>Salon bilgisi bulunamadı</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (branchesError) {
    const apiError = branchesError as ApiError;
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>
            {apiError.message || "Şubeler yüklenirken hata oluştu"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const branches = branchesData?.data || [];
  const isLoading = branchesLoading;

  // Calculate active branches count (excluding archived)
  const activeBranchesCount = branches.filter((b) => !b.archivedAt).length;
  const canCreateBranch = activeBranchesCount < MAX_BRANCHES_SINGLE_PLAN;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Şubeler</h1>
          <p className="text-sm text-muted-foreground">
            Salonunuza bağlı şubeleri görüntüleyin ve yönetin.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            onClick={() => setCreateDialogOpen(true)}
            disabled={!canCreateBranch}
          >
            Yeni Şube
          </Button>
          {!canCreateBranch && (
            <p className="text-xs text-muted-foreground text-right max-w-[200px]">
              Plan limitine ulaştınız. Mevcut planınız en fazla{" "}
              {MAX_BRANCHES_SINGLE_PLAN} şubeye izin veriyor.
            </p>
          )}
        </div>
      </div>
      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Şube Listesi</CardTitle>
              <CardDescription>
                Tüm şubelerinizi buradan yönetebilirsiniz
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-md border">
                <input
                  id="show-archived-checkbox"
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
                <Label
                  htmlFor="show-archived-checkbox"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Arşivleri göster
                </Label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Şubeler yükleniyor...
            </div>
          ) : branches.length === 0 ? (
            <div className="py-8 text-center space-y-4">
              <p className="text-muted-foreground">
                {includeArchived
                  ? "Şube bulunamadı"
                  : "Henüz şube yok. Başlamak için ilk şubenizi oluşturun."}
              </p>
              {!includeArchived && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  İlk şubenizi oluşturun
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden lg:block w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Şube Adı</TableHead>
                      <TableHead>Adres</TableHead>
                      <TableHead className="w-[100px]">Durum</TableHead>
                      <TableHead className="hidden lg:table-cell w-[150px]">
                        Oluşturulma
                      </TableHead>
                      <TableHead className="hidden xl:table-cell w-[150px]">
                        Güncelleme
                      </TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((branch) => (
                      <TableRow key={branch.id}>
                        <TableCell className="font-medium">
                          <div
                            className="truncate max-w-[120px] lg:max-w-[150px] xl:max-w-[200px]"
                            title={branch.name}
                          >
                            {branch.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div
                            className="truncate max-w-[150px] lg:max-w-[200px] xl:max-w-[300px]"
                            title={branch.address}
                          >
                            {branch.address}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {branch.isDefault && (
                              <Badge
                                variant="default"
                                className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
                              >
                                Varsayılan
                              </Badge>
                            )}
                            {branch.archivedAt ? (
                              <Badge
                                variant="secondary"
                                className="bg-muted text-muted-foreground whitespace-nowrap"
                              >
                                Arşivlenmiş
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-primary/20 text-primary whitespace-nowrap"
                              >
                                Aktif
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-sm hidden lg:table-cell">
                          {formatDate(branch.createdAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-sm hidden xl:table-cell">
                          {formatDate(branch.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 items-center flex-wrap">
                            {!branch.archivedAt && !branch.isDefault && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetDefault(branch.id)}
                                disabled={setDefaultBranch.isPending}
                                className="h-8 text-xs sm:text-sm whitespace-nowrap"
                              >
                                Varsayılan Yap
                              </Button>
                            )}
                            {!branch.archivedAt && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingBranch(branch);
                                    setEditDialogOpen(true);
                                  }}
                                  className="h-8 text-xs sm:text-sm whitespace-nowrap"
                                >
                                  Düzenle
                                </Button>
                                {!branch.isDefault && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleArchive(branch.id)}
                                    disabled={archiveBranch.isPending}
                                    className="h-8 text-xs sm:text-sm whitespace-nowrap"
                                  >
                                    Arşivle
                                  </Button>
                                )}
                              </>
                            )}
                            {branch.archivedAt && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRestore(branch.id)}
                                disabled={restoreBranch.isPending}
                                className="h-8 text-xs sm:text-sm whitespace-nowrap"
                              >
                                Geri Yükle
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-4 lg:hidden">
                {branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="flex flex-col gap-4 rounded-lg border p-4 bg-card text-card-foreground shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1 min-w-0">
                        <h3 className="font-semibold leading-none tracking-tight truncate">
                          {branch.name}
                        </h3>
                        <p className="text-sm text-muted-foreground wrap-break-word">
                          {branch.address}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 items-end shrink-0">
                        {branch.isDefault && (
                          <Badge variant="default">Varsayılan</Badge>
                        )}
                        {branch.archivedAt ? (
                          <Badge variant="secondary">Arşivlenmiş</Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-primary/20 text-primary"
                          >
                            Aktif
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">
                          Oluşturulma
                        </span>
                        <span className="font-medium">
                          {formatDate(branch.createdAt)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">
                          Güncelleme
                        </span>
                        <span className="font-medium">
                          {formatDate(branch.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      {!branch.archivedAt && !branch.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(branch.id)}
                          disabled={setDefaultBranch.isPending}
                          className="h-8 text-xs"
                        >
                          Varsayılan Yap
                        </Button>
                      )}
                      {!branch.archivedAt && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingBranch(branch);
                              setEditDialogOpen(true);
                            }}
                            className="h-8 text-xs"
                          >
                            Düzenle
                          </Button>
                          {!branch.isDefault && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleArchive(branch.id)}
                              disabled={archiveBranch.isPending}
                              className="h-8 text-xs"
                            >
                              Arşivle
                            </Button>
                          )}
                        </>
                      )}
                      {branch.archivedAt && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(branch.id)}
                          disabled={restoreBranch.isPending}
                          className="h-8 text-xs"
                        >
                          Geri Yükle
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Branch Dialog */}
      <BranchFormDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        tenantId={tenant.id}
      />

      {/* Edit Branch Dialog */}
      {editingBranch && (
        <BranchFormDialog
          mode="edit"
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingBranch(null);
          }}
          tenantId={tenant.id}
          initialData={editingBranch}
        />
      )}
    </div>
  );
}
