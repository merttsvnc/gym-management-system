import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconEdit,
} from "@tabler/icons-react";
import { usePayments, useMemberPayments } from "@/hooks/usePayments";
import { PaymentMethod } from "@/types/payment";
import type { Payment, PaymentListQuery } from "@/types/payment";
import type { ApiError } from "@/types/error";

interface PaymentHistoryTableProps {
  tenantId: string;
  memberId?: string; // Optional: if provided, shows only this member's payments
  onCorrectPayment?: (payment: Payment) => void; // Callback when "Correct Payment" is clicked
  readOnly?: boolean; // If true, hides correction actions
}

/**
 * Format amount for display (currency formatting)
 */
function formatAmount(amount: string | number): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount);
}

/**
 * Format date for display using tenant timezone
 * Uses `paidOn` field (DATE-ONLY business date) for display
 * Extracts date part (YYYY-MM-DD) to avoid timezone shifts
 */
function formatDate(dateString: string): string {
  // paidOn is stored as ISO date string (YYYY-MM-DD or ISO datetime)
  // Extract date part (YYYY-MM-DD) to avoid timezone shifts
  // If it's already YYYY-MM-DD, use as-is; otherwise extract from ISO datetime
  const datePart = dateString.includes("T")
    ? dateString.split("T")[0]
    : dateString.split(" ")[0]; // Handle space-separated formats too
  
  // Parse YYYY-MM-DD and format using Turkish locale
  const [year, month, day] = datePart.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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
 * Get payment method badge variant
 */
function getPaymentMethodBadgeVariant(
  method: PaymentMethod
): "default" | "secondary" | "outline" {
  const variants: Record<PaymentMethod, "default" | "secondary" | "outline"> = {
    [PaymentMethod.CASH]: "default",
    [PaymentMethod.CREDIT_CARD]: "secondary",
    [PaymentMethod.BANK_TRANSFER]: "secondary",
    [PaymentMethod.CHECK]: "outline",
    [PaymentMethod.OTHER]: "outline",
  };
  return variants[method] || "outline";
}

/**
 * PaymentHistoryTable component for displaying payment history
 * Uses `paidOn` field (not paymentDate) to represent DATE-ONLY business date
 */
export function PaymentHistoryTable({
  tenantId,
  memberId,
  onCorrectPayment,
  readOnly = false,
}: PaymentHistoryTableProps) {
  // Filter state
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<
    PaymentMethod | "ALL"
  >("ALL");
  const [includeCorrections, setIncludeCorrections] = useState<boolean>(false);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(20);

  // Build query object
  const query: Partial<PaymentListQuery> = useMemo(() => {
    const q: Partial<PaymentListQuery> = {
      page,
      limit,
      includeCorrections,
    };

    if (memberId) {
      q.memberId = memberId;
    }
    if (startDate) {
      q.startDate = startDate;
    }
    if (endDate) {
      q.endDate = endDate;
    }
    if (paymentMethodFilter !== "ALL") {
      q.paymentMethod = paymentMethodFilter;
    }

    return q;
  }, [memberId, startDate, endDate, paymentMethodFilter, includeCorrections, page, limit]);

  // Fetch payments
  // Note: When memberId is provided, useMemberPayments only supports date range filters
  // Payment method and includeCorrections filters are only available for general payment list
  const { data, isLoading, error } = memberId
    ? useMemberPayments(tenantId, memberId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      })
    : usePayments(tenantId, query);

  const payments = data?.data || [];
  const pagination = data?.pagination;

  // Reset page when filters change
  const handleFilterChange = () => {
    setPage(1);
  };

  // Get today's date in YYYY-MM-DD format for date input max
  const getTodayDate = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error.message || "Ödemeler yüklenirken bir hata oluştu"}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Start Date Filter */}
          <div className="space-y-2">
            <Label htmlFor="startDate">Başlangıç Tarihi</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                handleFilterChange();
              }}
              max={getTodayDate()}
            />
          </div>

          {/* End Date Filter */}
          <div className="space-y-2">
            <Label htmlFor="endDate">Bitiş Tarihi</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                handleFilterChange();
              }}
              max={getTodayDate()}
              min={startDate || undefined}
            />
          </div>
        </div>

        {/* Payment Method and Corrections filters - only shown when viewing all payments (not member-specific) */}
        {!memberId && (
          <div className="flex gap-2">
            {/* Payment Method Filter */}
            <Select
              value={paymentMethodFilter}
              onValueChange={(value) => {
                setPaymentMethodFilter(value as PaymentMethod | "ALL");
                handleFilterChange();
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Ödeme Yöntemi" />
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

            {/* Include Corrections Filter */}
            <Select
              value={includeCorrections ? "true" : "false"}
              onValueChange={(value) => {
                setIncludeCorrections(value === "true");
                handleFilterChange();
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Düzeltmeler" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Düzeltmeler Hariç</SelectItem>
                <SelectItem value="true">Düzeltmeler Dahil</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-12 flex-1" />
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-12 w-32" />
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <Alert>
          <AlertDescription>Ödeme bulunamadı</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih (paidOn)</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Ödeme Yöntemi</TableHead>
                  <TableHead>Not</TableHead>
                  <TableHead>Durum</TableHead>
                  {!readOnly && <TableHead className="text-right">İşlemler</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {formatDate(payment.paidOn)}
                    </TableCell>
                    <TableCell>{formatAmount(payment.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={getPaymentMethodBadgeVariant(
                          payment.paymentMethod
                        )}
                      >
                        {getPaymentMethodLabel(payment.paymentMethod)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {payment.note || "-"}
                    </TableCell>
                    <TableCell>
                      {/* Correction Indicator Badge */}
                      {payment.isCorrection && (
                        <Badge variant="secondary" className="mr-2">
                          Düzeltme
                        </Badge>
                      )}
                      {payment.isCorrected && (
                        <Badge variant="outline" className="text-orange-600 dark:text-orange-400">
                          Düzeltilmiş
                        </Badge>
                      )}
                      {!payment.isCorrection && !payment.isCorrected && (
                        <Badge variant="outline" className="text-green-600 dark:text-green-400">
                          Normal
                        </Badge>
                      )}
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <IconDotsVertical className="h-4 w-4" />
                              <span className="sr-only">Menü</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* Correct Payment action - only show if not already corrected */}
                            {!payment.isCorrected && onCorrectPayment && (
                              <DropdownMenuItem
                                onClick={() => onCorrectPayment(payment)}
                              >
                                <IconEdit className="mr-2 h-4 w-4" />
                                Düzelt
                              </DropdownMenuItem>
                            )}
                            {/* Show disabled option if already corrected */}
                            {payment.isCorrected && (
                              <DropdownMenuItem disabled>
                                <IconEdit className="mr-2 h-4 w-4" />
                                Düzeltilmiş (tekrar düzeltilemez)
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Toplam {pagination.total} ödeme, Sayfa {pagination.page} /{" "}
                {pagination.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isLoading}
                >
                  <IconChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Önceki sayfa</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={page === pagination.totalPages || isLoading}
                >
                  <IconChevronRight className="h-4 w-4" />
                  <span className="sr-only">Sonraki sayfa</span>
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

