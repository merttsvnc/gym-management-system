import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRevenueReport } from "@/hooks/useRevenue";
import { useBranches } from "@/hooks/useBranches";
import { PaymentMethod } from "@/types/payment";
import type { RevenueReportQuery } from "@/types/payment";
import type { ApiError } from "@/types/error";

interface RevenueReportProps {
  tenantId: string;
}

/**
 * Format amount for display (currency formatting)
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display using Turkish locale
 */
function formatDate(dateString: string): string {
  const datePart = dateString.includes("T")
    ? dateString.split("T")[0]
    : dateString.split(" ")[0];
  
  const [year, month, day] = datePart.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Format period label based on groupBy type
 * Backend returns:
 * - day: YYYY-MM-DD
 * - week: YYYY-MM-DD (week start date, Monday)
 * - month: YYYY-MM
 */
function formatPeriodLabel(period: string, groupBy: "day" | "week" | "month"): string {
  if (groupBy === "day") {
    return formatDate(period);
  } else if (groupBy === "week") {
    // Backend returns YYYY-MM-DD (week start date)
    return `Hafta ${formatDate(period)}`;
  } else if (groupBy === "month") {
    // Backend returns YYYY-MM
    const [year, month] = period.split("-");
    const monthNames = [
      "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
      "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  }
  return period;
}

/**
 * Get payment method display name in Turkish
 */
function getPaymentMethodLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    [PaymentMethod.CASH]: "Nakit",
    [PaymentMethod.CREDIT_CARD]: "Kredi/Banka Kartı",
    [PaymentMethod.BANK_TRANSFER]: "Havale/EFT",
    [PaymentMethod.CHECK]: "Çek",
    [PaymentMethod.OTHER]: "Diğer",
  };
  return labels[method] || method;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get first day of current month in YYYY-MM-DD format
 */
function getFirstDayOfMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * RevenueReport component for displaying revenue reports with filters
 */
export function RevenueReport({ tenantId }: RevenueReportProps) {
  // Live filter state (for UI inputs)
  const [startDate, setStartDate] = useState<string>(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState<string>(getTodayDate());
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [branchId, setBranchId] = useState<string>("ALL");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "ALL">("ALL");

  // Applied filters state (used for actual query)
  const [appliedFilters, setAppliedFilters] = useState<RevenueReportQuery | null>(null);

  // Fetch branches for branch filter
  const { data: branchesData } = useBranches(tenantId);
  const branches = branchesData?.data || [];

  // Build query object from applied filters (only query when filters are applied)
  const query: RevenueReportQuery = useMemo(() => {
    if (!appliedFilters) {
      // Return empty query (will be disabled by hook's enabled check)
      return { startDate: "", endDate: "", groupBy: "day" };
    }
    return appliedFilters;
  }, [appliedFilters]);

  // Fetch revenue report (only enabled when appliedFilters is set)
  // Hook's enabled check ensures query only runs when startDate/endDate are non-empty
  const { data, isLoading, error } = useRevenueReport(tenantId, query);

  // Handle generate report (apply filters and trigger query)
  const handleGenerateReport = () => {
    const filters: RevenueReportQuery = {
      startDate,
      endDate,
      groupBy,
    };

    if (branchId !== "ALL") {
      filters.branchId = branchId;
    }
    if (paymentMethod !== "ALL") {
      filters.paymentMethod = paymentMethod;
    }

    setAppliedFilters(filters);
    // Query will auto-refetch when appliedFilters changes
  };

  // Validation: ensure startDate <= endDate
  const isValidDateRange = startDate <= endDate;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error.message || "Gelir raporu yüklenirken bir hata oluştu"}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle>Rapor Filtreleri</CardTitle>
          <CardDescription>
            Gelir raporu için tarih aralığı, şube ve ödeme yöntemi filtrelerini seçin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Date Range and Group By */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Start Date */}
              <div className="space-y-2">
                <Label htmlFor="startDate">Başlangıç Tarihi</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate || getTodayDate()}
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label htmlFor="endDate">Bitiş Tarihi</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  max={getTodayDate()}
                  min={startDate || undefined}
                />
              </div>

              {/* Group By */}
              <div className="space-y-2">
                <Label htmlFor="groupBy">Gruplama</Label>
                <Select
                  value={groupBy}
                  onValueChange={(value) =>
                    setGroupBy(value as "day" | "week" | "month")
                  }
                >
                  <SelectTrigger id="groupBy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Günlük</SelectItem>
                    <SelectItem value="week">Haftalık</SelectItem>
                    <SelectItem value="month">Aylık</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Branch and Payment Method Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Branch Filter */}
              <div className="space-y-2">
                <Label htmlFor="branchId">Şube</Label>
                <Select
                  value={branchId}
                  onValueChange={setBranchId}
                >
                  <SelectTrigger id="branchId">
                    <SelectValue placeholder="Tüm Şubeler" />
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

              {/* Payment Method Filter */}
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Ödeme Yöntemi</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) =>
                    setPaymentMethod(value as PaymentMethod | "ALL")
                  }
                >
                  <SelectTrigger id="paymentMethod">
                    <SelectValue placeholder="Tüm Yöntemler" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tüm Yöntemler</SelectItem>
                    <SelectItem value={PaymentMethod.CASH}>Nakit</SelectItem>
                    <SelectItem value={PaymentMethod.CREDIT_CARD}>
                      Kredi/Banka Kartı
                    </SelectItem>
                    <SelectItem value={PaymentMethod.BANK_TRANSFER}>
                      Havale/EFT
                    </SelectItem>
                    <SelectItem value={PaymentMethod.CHECK}>Çek</SelectItem>
                    <SelectItem value={PaymentMethod.OTHER}>Diğer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate Report Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleGenerateReport}
                disabled={!isValidDateRange || isLoading}
              >
                {isLoading ? "Yükleniyor..." : "Raporu Oluştur"}
              </Button>
            </div>

            {/* Date Range Validation Error */}
            {!isValidDateRange && (
              <Alert variant="destructive">
                <AlertDescription>
                  Başlangıç tarihi bitiş tarihinden sonra olamaz
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Results */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Gelir Raporu</CardTitle>
            <CardDescription>
              {appliedFilters && (
                <>
                  {formatDate(appliedFilters.startDate)} - {formatDate(appliedFilters.endDate)} tarihleri arası
                  {appliedFilters.branchId && ` • ${branches.find((b) => b.id === appliedFilters.branchId)?.name || ""}`}
                  {appliedFilters.paymentMethod && ` • ${getPaymentMethodLabel(appliedFilters.paymentMethod)}`}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Total Revenue */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Toplam Gelir</p>
                    <p className="text-2xl font-bold">
                      {formatAmount(data.totalRevenue)}
                    </p>
                  </div>
                  <Badge variant="default" className="text-lg px-4 py-2">
                    {data.breakdown.length} {appliedFilters?.groupBy === "day" ? "Gün" : appliedFilters?.groupBy === "week" ? "Hafta" : "Ay"}
                  </Badge>
                </div>

                {/* Breakdown Table */}
                {data.breakdown.length === 0 ? (
                  <Alert>
                    <AlertDescription>
                      Seçilen tarih aralığında ödeme bulunamadı
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            {appliedFilters?.groupBy === "day"
                              ? "Tarih"
                              : appliedFilters?.groupBy === "week"
                              ? "Hafta"
                              : "Ay"}
                          </TableHead>
                          <TableHead className="text-right">Ödeme Sayısı</TableHead>
                          <TableHead className="text-right">Gelir</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.breakdown.map((item) => (
                          <TableRow key={item.period}>
                            <TableCell className="font-medium">
                              {formatPeriodLabel(item.period, data.period)}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.count}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatAmount(item.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty State - No Report Generated Yet */}
      {!data && !isLoading && !error && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <p>Raporu oluşturmak için filtreleri ayarlayın ve "Raporu Oluştur" butonuna tıklayın</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

