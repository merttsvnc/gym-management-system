import { useState, useMemo } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useCurrentTenant } from "@/hooks/useTenant";
import { useBranches } from "@/hooks/useBranches";
import {
  useMembershipPlans,
  useArchivePlan,
  useRestorePlan,
  useDeletePlan,
  useActivePlans,
} from "@/hooks/use-membership-plans";
import {
  PlanScope,
  PlanStatus,
  type MembershipPlan,
} from "@/types/membership-plan";
import { DurationType } from "@/types/membership-plan";
import type { ApiError } from "@/types/error";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";

/**
 * Format duration for display
 */
function formatDuration(
  durationType: DurationType,
  durationValue: number
): string {
  if (durationType === DurationType.DAYS) {
    return `${durationValue} gün`;
  }
  return `${durationValue} ay`;
}

/**
 * Format price for display
 */
function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * Get plan status display (uses archivedAt if present, otherwise status)
 */
function getPlanStatus(plan: MembershipPlan): {
  isArchived: boolean;
  label: string;
} {
  if (plan.archivedAt) {
    return { isArchived: true, label: "Arşivli" };
  }
  if (plan.status === PlanStatus.ARCHIVED) {
    return { isArchived: true, label: "Arşivli" };
  }
  return { isArchived: false, label: "Aktif" };
}

/**
 * Plan List Page
 * Displays paginated table of plans with filters, branch selector, and member count
 */
export function MembershipPlansPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<PlanScope | "ALL">("ALL");
  const [branchFilter, setBranchFilter] = useState<string | "ALL">("ALL");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeMemberCount, setIncludeMemberCount] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<MembershipPlan | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [planToArchive, setPlanToArchive] = useState<MembershipPlan | null>(
    null
  );

  // Fetch branches for branch selector
  const { data: branchesData } = useBranches(tenant?.id || "", {
    includeArchived: false,
  });
  const branches = branchesData?.data || [];

  // Build query params
  const queryParams = useMemo(() => {
    const params: Record<string, string | number | boolean> = {
      page,
      limit,
      includeArchived,
    };
    if (searchQuery.trim()) {
      params.q = searchQuery.trim();
    }
    if (scopeFilter !== "ALL") {
      params.scope = scopeFilter;
    }
    if (branchFilter !== "ALL" && scopeFilter === PlanScope.BRANCH) {
      params.branchId = branchFilter;
    }
    return params;
  }, [page, limit, searchQuery, scopeFilter, branchFilter, includeArchived]);

  // Fetch plans list
  const {
    data: plansData,
    isLoading: plansLoading,
    error: plansError,
  } = useMembershipPlans(tenant?.id || "", queryParams);

  // Fetch active plans with member count if enabled
  const { data: activePlansData } = useActivePlans(tenant?.id || "", {
    branchId: branchFilter !== "ALL" ? branchFilter : undefined,
    includeMemberCount: includeMemberCount,
  });

  // Create member count map
  const memberCountMap = useMemo(() => {
    if (!includeMemberCount || !activePlansData)
      return new Map<string, number>();
    const map = new Map<string, number>();
    activePlansData.forEach((plan) => {
      if (
        "activeMemberCount" in plan &&
        typeof plan.activeMemberCount === "number"
      ) {
        map.set(plan.id, plan.activeMemberCount);
      }
    });
    return map;
  }, [includeMemberCount, activePlansData]);

  const archivePlan = useArchivePlan(tenant?.id || "");
  const restorePlan = useRestorePlan(tenant?.id || "");
  const deletePlan = useDeletePlan(tenant?.id || "");

  const plans = plansData?.data || [];
  const pagination = plansData?.pagination;

  // Reset page when filters change
  const handleFilterChange = () => {
    setPage(1);
  };

  const handleArchive = async (plan: MembershipPlan) => {
    setPlanToArchive(plan);
    setArchiveDialogOpen(true);
  };

  const confirmArchive = async () => {
    if (!planToArchive) return;
    try {
      await archivePlan.mutateAsync(planToArchive.id);
      setArchiveDialogOpen(false);
      setPlanToArchive(null);
    } catch {
      // Error handled by hook
    }
  };

  const handleRestore = async (plan: MembershipPlan) => {
    if (
      confirm(
        "Bu planı geri yüklemek istediğinizden emin misiniz? Plan tekrar aktif hale gelecektir."
      )
    ) {
      try {
        await restorePlan.mutateAsync(plan.id);
      } catch {
        // Error handled by hook
      }
    }
  };

  const handleDelete = (plan: MembershipPlan) => {
    setPlanToDelete(plan);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;
    try {
      await deletePlan.mutateAsync(planToDelete.id);
      setDeleteDialogOpen(false);
      setPlanToDelete(null);
    } catch {
      // Error handled by hook
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

  // Get archive warning message
  const archiveWarning =
    planToArchive && memberCountMap.has(planToArchive.id)
      ? `Bu plana bağlı ${memberCountMap.get(
          planToArchive.id
        )} aktif üye bulunmaktadır.`
      : null;

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
          {/* Branch Selector */}
          <div className="mb-4">
            <Label htmlFor="branch-selector">Şube</Label>
            <Select
              value={branchFilter}
              onValueChange={(value) => {
                setBranchFilter(value);
                handleFilterChange();
              }}
            >
              <SelectTrigger id="branch-selector" className="w-full md:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm Şubeler</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Label htmlFor="search">Ara</Label>
              <Input
                id="search"
                placeholder="Plan adı ile ara..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleFilterChange();
                }}
              />
            </div>
            <div className="w-full md:w-48">
              <Label htmlFor="scope">Kapsam</Label>
              <Select
                value={scopeFilter}
                onValueChange={(value) => {
                  setScopeFilter(value as PlanScope | "ALL");
                  if (value === "ALL") {
                    setBranchFilter("ALL");
                  }
                  handleFilterChange();
                }}
              >
                <SelectTrigger id="scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tümü</SelectItem>
                  <SelectItem value={PlanScope.TENANT}>Salon</SelectItem>
                  <SelectItem value={PlanScope.BRANCH}>Şube</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scopeFilter === PlanScope.BRANCH && (
              <div className="w-full md:w-64">
                <Label htmlFor="branch-filter">Şube Filtresi</Label>
                <Select
                  value={branchFilter}
                  onValueChange={(value) => {
                    setBranchFilter(value);
                    handleFilterChange();
                  }}
                >
                  <SelectTrigger id="branch-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tüm Şubeler</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-md border self-end">
              <Checkbox
                id="include-archived"
                checked={includeArchived}
                onCheckedChange={(checked) => {
                  setIncludeArchived(checked === true);
                  handleFilterChange();
                }}
              />
              <Label
                htmlFor="include-archived"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Arşivleri göster
              </Label>
            </div>
            <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-md border self-end">
              <Checkbox
                id="include-member-count"
                checked={includeMemberCount}
                onCheckedChange={(checked) => {
                  setIncludeMemberCount(checked === true);
                }}
              />
              <Label
                htmlFor="include-member-count"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Aktif Üye Sayısı
              </Label>
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
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {/* Plans Table */}
          {!plansLoading && !plansError && (
            <>
              {plans.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    {searchQuery || scopeFilter !== "ALL" || includeArchived
                      ? "Arama kriterlerinize uygun plan bulunamadı"
                      : "Henüz plan oluşturulmamış"}
                  </p>
                  {!searchQuery &&
                    scopeFilter === "ALL" &&
                    !includeArchived && (
                      <Button
                        className="mt-4"
                        onClick={() => navigate("/membership-plans/new")}
                      >
                        İlk Planı Oluştur
                      </Button>
                    )}
                </div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plan Adı</TableHead>
                          <TableHead>Kapsam</TableHead>
                          <TableHead>Şube</TableHead>
                          <TableHead>Fiyat</TableHead>
                          <TableHead>Süre</TableHead>
                          {includeMemberCount && (
                            <TableHead>Aktif Üye</TableHead>
                          )}
                          <TableHead>Durum</TableHead>
                          <TableHead className="text-right">İşlemler</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plans.map((plan) => {
                          const status = getPlanStatus(plan);
                          const memberCount = memberCountMap.get(plan.id);
                          // Look up branch name from branches list
                          const branchName =
                            plan.scope === PlanScope.BRANCH && plan.branchId
                              ? branches.find((b) => b.id === plan.branchId)
                                  ?.name || "—"
                              : "—";
                          return (
                            <TableRow
                              key={plan.id}
                              className={
                                status.isArchived
                                  ? "opacity-60 text-muted-foreground"
                                  : ""
                              }
                            >
                              <TableCell className="font-medium">
                                {plan.name}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    plan.scope === PlanScope.TENANT
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {plan.scope === PlanScope.TENANT
                                    ? "Salon"
                                    : "Şube"}
                                </Badge>
                              </TableCell>
                              <TableCell>{branchName}</TableCell>
                              <TableCell>
                                {formatPrice(plan.price, plan.currency)}
                              </TableCell>
                              <TableCell>
                                {formatDuration(
                                  plan.durationType,
                                  plan.durationValue
                                )}
                              </TableCell>
                              {includeMemberCount && (
                                <TableCell>
                                  {memberCount !== undefined
                                    ? memberCount
                                    : "—"}
                                </TableCell>
                              )}
                              <TableCell>
                                <Badge
                                  variant={
                                    status.isArchived ? "secondary" : "outline"
                                  }
                                >
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      navigate(
                                        `/membership-plans/${plan.id}/edit`
                                      )
                                    }
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {status.isArchived ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRestore(plan)}
                                      disabled={restorePlan.isPending}
                                    >
                                      <ArchiveRestore className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleArchive(plan)}
                                      disabled={archivePlan.isPending}
                                    >
                                      <Archive className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(plan)}
                                    disabled={deletePlan.isPending}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6">
                      <div className="text-sm text-muted-foreground">
                        Toplam {pagination.total} plan, Sayfa {pagination.page}{" "}
                        / {pagination.totalPages}
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
                            setPage((p) =>
                              Math.min(pagination.totalPages, p + 1)
                            )
                          }
                          disabled={
                            page === pagination.totalPages || plansLoading
                          }
                        >
                          Sonraki
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Archive Confirmation Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planı Arşivle</DialogTitle>
            <DialogDescription>
              Bu planı arşivlemek istediğinizden emin misiniz? Arşivlenen
              planlar yeni üyeliklerde görünmez.
            </DialogDescription>
          </DialogHeader>
          {archiveWarning && (
            <Alert>
              <AlertDescription>{archiveWarning}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveDialogOpen(false);
                setPlanToArchive(null);
              }}
            >
              İptal
            </Button>
            <Button onClick={confirmArchive} disabled={archivePlan.isPending}>
              {archivePlan.isPending ? "Arşivleniyor..." : "Arşivle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planı Sil</DialogTitle>
            <DialogDescription>
              Bu planı kalıcı olarak silmek istediğinizden emin misiniz? Bu
              işlem geri alınamaz. Eğer bu plana bağlı üyeler varsa, silme
              işlemi başarısız olacaktır.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPlanToDelete(null);
              }}
            >
              İptal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletePlan.isPending}
            >
              {deletePlan.isPending ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
