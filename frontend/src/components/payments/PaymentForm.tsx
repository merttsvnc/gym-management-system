import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMembers } from "@/hooks/useMembers";
import { useMember } from "@/hooks/useMembers";
import { useBranches } from "@/hooks/useBranches";
import { useCreatePayment, useCorrectPayment, usePayment } from "@/hooks/usePayments";
import { PaymentMethod } from "@/types/payment";
import type {
  CreatePaymentRequest,
  CorrectPaymentRequest,
  Payment,
} from "@/types/payment";
import type { ApiError } from "@/types/error";
import { MemberStatus } from "@/types/member";

interface PaymentFormProps {
  mode: "create" | "correct";
  initialMemberId?: string; // Pre-fill member when opened from member detail page
  initialPayment?: Payment; // Pre-fill values for correction mode
  onSubmit?: () => void; // Callback after successful submission
  onCancel?: () => void;
  tenantId: string;
}

/**
 * Format amount for display (currency formatting)
 */
function formatAmount(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Parse amount from input string (remove currency symbols, commas, etc.)
 * Handles Turkish format: "1.234,50" -> 1234.50
 * Also handles standard format: "1234.50" -> 1234.50
 */
function parseAmount(value: string): number {
  if (!value || value.trim() === "") return 0;
  
  // Remove all non-numeric characters except decimal separators
  const cleaned = value.replace(/[^\d.,]/g, "");
  
  // Handle Turkish format (dot = thousand separator, comma = decimal)
  // If last comma exists and there are dots, assume Turkish format
  const lastCommaIndex = cleaned.lastIndexOf(",");
  const hasDots = cleaned.includes(".");
  
  let normalized: string;
  if (lastCommaIndex !== -1 && hasDots) {
    // Turkish format: remove dots (thousand separators), replace comma with dot
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastCommaIndex !== -1) {
    // Only comma exists: could be Turkish decimal or thousand separator
    // If comma is in last 3 chars, assume decimal separator
    if (cleaned.length - lastCommaIndex <= 3) {
      normalized = cleaned.replace(",", ".");
    } else {
      // Comma is likely thousand separator, remove it
      normalized = cleaned.replace(/,/g, "");
    }
  } else {
    // No comma, just dots (standard format) or no separators
    normalized = cleaned;
  }
  
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format amount for input (remove currency formatting for editing)
 */
function formatAmountForInput(value: number): string {
  return value.toFixed(2);
}

/**
 * Get today's date in YYYY-MM-DD format (local date, no timezone shift)
 * Uses local date to respect tenant timezone and avoid UTC conversion issues
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Check if payment is older than 90 days
 */
function isPaymentOlderThan90Days(paidOn: string): boolean {
  const paymentDate = new Date(paidOn);
  const today = new Date();
  const daysDiff = Math.floor(
    (today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysDiff > 90;
}

/**
 * PaymentForm component for creating and correcting payments
 * Uses `paidOn` field (not paymentDate) to represent DATE-ONLY business date
 */
export function PaymentForm({
  mode,
  initialMemberId,
  initialPayment,
  onSubmit,
  onCancel,
  tenantId,
}: PaymentFormProps) {
  // Form state
  const [memberId, setMemberId] = useState(initialMemberId || "");
  const [memberSearch, setMemberSearch] = useState("");
  const [amount, setAmount] = useState(
    initialPayment ? parseAmount(initialPayment.amount) : 0
  );
  const [amountDisplay, setAmountDisplay] = useState(
    initialPayment ? formatAmountForInput(parseAmount(initialPayment.amount)) : ""
  );
  const [paidOn, setPaidOn] = useState(
    initialPayment && initialPayment.paidOn
      ? initialPayment.paidOn.split("T")[0]
      : getTodayDate()
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(
    initialPayment?.paymentMethod || ""
  );
  const [note, setNote] = useState(initialPayment?.note || "");
  const [version, setVersion] = useState(initialPayment?.version || 0);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch members for searchable dropdown
  const { data: membersData, isLoading: membersLoading } = useMembers(
    tenantId,
    {
      search: memberSearch || undefined,
      limit: 50, // Limit results for performance
      includeArchived: true, // Include archived members for historical payments
    }
  );
  const members = membersData?.data || [];

  // Fetch selected member details (for checking archived/inactive status)
  const { data: selectedMember } = useMember(
    tenantId,
    memberId,
    !!memberId && mode === "create"
  );

  // Fetch branch details (for checking archived status)
  const { data: branchesData } = useBranches(tenantId);
  const branches = branchesData?.data || [];
  const selectedBranch = useMemo(() => {
    if (!selectedMember) return null;
    return branches.find((b) => b.id === selectedMember.branchId);
  }, [selectedMember, branches]);

  // Mutations
  const createPaymentMutation = useCreatePayment(tenantId);
  const correctPaymentMutation = useCorrectPayment(tenantId);
  const queryClient = useQueryClient();

  // Subscribe to live payment data in correction mode to get updated version after conflicts
  const { data: livePayment } = usePayment(
    tenantId,
    mode === "correct" && initialPayment?.id ? initialPayment.id : ""
  );

  const isLoading =
    createPaymentMutation.isPending || correctPaymentMutation.isPending;

  // Check if member is archived or inactive
  const isMemberArchivedOrInactive = useMemo(() => {
    if (!selectedMember) return false;
    return (
      selectedMember.status === MemberStatus.ARCHIVED ||
      selectedMember.status === MemberStatus.INACTIVE
    );
  }, [selectedMember]);

  // Check if branch is archived
  const isBranchArchived = useMemo(() => {
    if (!selectedBranch) return false;
    return !!selectedBranch.archivedAt;
  }, [selectedBranch]);

  // Check if payment is older than 90 days (for correction mode)
  const showOldPaymentWarning = useMemo(() => {
    if (mode !== "correct" || !initialPayment) return false;
    return isPaymentOlderThan90Days(initialPayment.paidOn);
  }, [mode, initialPayment]);

  // Reset form when initialMemberId changes
  useEffect(() => {
    if (initialMemberId && mode === "create") {
      setMemberId(initialMemberId);
      setMemberSearch("");
    }
  }, [initialMemberId, mode]);

  // Reset form when initialPayment or livePayment changes (for correction mode)
  // Use livePayment when available (after refetch) to get updated version
  useEffect(() => {
    const paymentToUse = livePayment || initialPayment;
    if (paymentToUse && mode === "correct") {
      setMemberId(paymentToUse.memberId);
      setAmount(parseAmount(paymentToUse.amount));
      setAmountDisplay(formatAmountForInput(parseAmount(paymentToUse.amount)));
      setPaidOn(paymentToUse.paidOn.split("T")[0]);
      setPaymentMethod(paymentToUse.paymentMethod);
      setNote(paymentToUse.note || "");
      setVersion(paymentToUse.version); // This will update with latest version after 409 conflict
      setMemberSearch("");
    }
  }, [livePayment, initialPayment, mode]);

  // Handle amount input change (format for display)
  const handleAmountChange = (value: string) => {
    setAmountDisplay(value);
    const parsed = parseAmount(value);
    setAmount(parsed);
    if (errors.amount) {
      setErrors({ ...errors, amount: "" });
    }
  };

  // Handle amount blur (format for display)
  const handleAmountBlur = () => {
    if (amount > 0) {
      setAmountDisplay(formatAmountForInput(amount));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!memberId.trim()) {
      newErrors.memberId = "Üye seçimi zorunludur";
    }

    if (amount <= 0) {
      newErrors.amount = "Tutar 0'dan büyük olmalıdır";
    } else if (amount > 999999.99) {
      newErrors.amount = "Tutar en fazla 999,999.99 olabilir";
    }

    if (!paidOn) {
      newErrors.paidOn = "Ödeme tarihi zorunludur";
    } else {
      const paymentDate = new Date(paidOn);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      if (paymentDate > today) {
        newErrors.paidOn = "Ödeme tarihi gelecekte olamaz";
      }
    }

    if (!paymentMethod) {
      newErrors.paymentMethod = "Ödeme yöntemi seçimi zorunludur";
    }

    if (note && note.length > 500) {
      newErrors.note = "Not en fazla 500 karakter olabilir";
    }

    if (mode === "correct" && version === undefined) {
      newErrors.version = "Versiyon bilgisi eksik";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (mode === "create") {
        const payload: CreatePaymentRequest = {
          memberId: memberId.trim(),
          amount: amount,
          paidOn: paidOn,
          paymentMethod: paymentMethod as PaymentMethod,
          ...(note.trim() && { note: note.trim() }),
        };

        await createPaymentMutation.mutateAsync(payload);
        // Clear errors on success
        setErrors({});
        onSubmit?.();
      } else if (mode === "correct" && initialPayment) {
        const payload: CorrectPaymentRequest = {
          amount: amount !== parseAmount(initialPayment.amount) ? amount : undefined,
          paidOn:
            paidOn !== initialPayment.paidOn.split("T")[0]
              ? paidOn
              : undefined,
          paymentMethod:
            paymentMethod !== initialPayment.paymentMethod
              ? (paymentMethod as PaymentMethod)
              : undefined,
          note: note !== (initialPayment.note || "") ? note.trim() : undefined,
          version: version,
        };

        // Only send fields that have changed (exclude version from change check)
        const { version: _version, ...changeFields } = payload;
        const hasChanges = Object.values(changeFields).some(
          (v) => v !== undefined
        );

        if (!hasChanges) {
          setErrors({
            general: "En az bir alan değiştirilmelidir",
          });
          return;
        }

        await correctPaymentMutation.mutateAsync({
          paymentId: initialPayment.id,
          payload,
        });
        // Clear errors on success
        setErrors({});
        onSubmit?.();
      }
    } catch (err) {
      const apiError = err as ApiError;
      // Error handling is done in the mutation hooks
      // But we can set form-level errors here if needed
      if (apiError.statusCode === 400) {
        // Check if it's the single-correction rule violation (already corrected)
        const message = apiError.message || "";
        if (
          message.includes("zaten düzeltilmiş") ||
          message.includes("already corrected")
        ) {
          setErrors({
            general:
              "Bu ödeme zaten düzeltilmiş. Bir ödeme yalnızca bir kez düzeltilebilir.",
          });
        } else if (apiError.message?.includes("tarih") || apiError.message?.includes("date")) {
          setErrors({ ...errors, paidOn: apiError.message });
        } else if (
          apiError.message?.includes("tutar") ||
          apiError.message?.includes("amount")
        ) {
          setErrors({ ...errors, amount: apiError.message });
        }
      } else if (apiError.statusCode === 409) {
        // Version conflict - hook already invalidates queries
        // usePayment hook will automatically refetch and update form state via useEffect
        setErrors({
          general:
            "Ödeme başka bir kullanıcı tarafından güncellenmiş. Veriler yenileniyor, lütfen tekrar deneyin.",
        });
      } else if (apiError.statusCode === 429) {
        // Rate limit exceeded - show retry message
        setErrors({
          general:
            "Çok fazla istek gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.",
        });
      }
    }
  };

  // Filter members based on search
  const filteredMembers = useMemo(() => {
    if (!memberSearch) return members.slice(0, 20); // Limit to 20 for performance
    const searchLower = memberSearch.toLowerCase();
    return members
      .filter(
        (m) =>
          `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchLower) ||
          m.phone.includes(memberSearch)
      )
      .slice(0, 20);
  }, [members, memberSearch]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Warning banners (non-blocking) */}
      {isMemberArchivedOrInactive && (
        <Alert
          variant="default"
          className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
        >
          <AlertDescription>
            Bu üye arşivlenmiş veya pasif durumda. Ödeme kaydedilebilir ancak
            dikkatli olunmalıdır.
          </AlertDescription>
        </Alert>
      )}

      {isBranchArchived && (
        <Alert
          variant="default"
          className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
        >
          <AlertDescription>
            Bu üyenin şubesi arşivlenmiş. Ödeme kaydedilebilir ancak dikkatli
            olunmalıdır.
          </AlertDescription>
        </Alert>
      )}

      {showOldPaymentWarning && (
        <Alert
          variant="default"
          className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
        >
          <AlertDescription>
            Bu ödeme 90 günden eski. Düzeltme yapılabilir ancak dikkatli
            olunmalıdır.
          </AlertDescription>
        </Alert>
      )}

      {/* General error */}
      {errors.general && (
        <Alert variant="destructive">
          <AlertDescription>{errors.general}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Member Selector (searchable) */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="memberId">
            Üye <span className="text-destructive">*</span>
          </Label>
          <div className="space-y-2">
            <Input
              id="memberSearch"
              placeholder={
                mode === "correct"
                  ? "Üye bilgisi düzeltme için değiştirilemez"
                  : memberId && selectedMember
                  ? `${selectedMember.firstName} ${selectedMember.lastName}`
                  : "Üye ara (ad, soyad veya telefon)..."
              }
              value={
                mode === "correct" && selectedMember
                  ? `${selectedMember.firstName} ${selectedMember.lastName}`
                  : memberSearch
              }
              onChange={(e) => {
                if (mode === "correct") return; // Disabled in correction mode
                setMemberSearch(e.target.value);
                if (memberId && e.target.value === "") {
                  // Clear selection when search is cleared
                  setMemberId("");
                }
              }}
              disabled={isLoading || mode === "correct"}
              className={errors.memberId ? "border-destructive" : ""}
            />
            {memberSearch && !memberId && filteredMembers.length > 0 && (
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="px-3 py-2 hover:bg-accent cursor-pointer border-b last:border-b-0"
                    onClick={() => {
                      setMemberId(member.id);
                      setMemberSearch(
                        `${member.firstName} ${member.lastName}`
                      );
                    }}
                  >
                    <div className="font-medium">
                      {member.firstName} {member.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {member.phone}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {memberSearch && !memberId && filteredMembers.length === 0 && !membersLoading && (
              <p className="text-sm text-muted-foreground">
                Üye bulunamadı
              </p>
            )}
            {memberId && selectedMember && mode === "create" && (
              <div className="text-sm text-muted-foreground">
                Seçili: {selectedMember.firstName} {selectedMember.lastName} (
                {selectedMember.phone})
              </div>
            )}
          </div>
          {errors.memberId && (
            <p className="text-sm text-destructive">{errors.memberId}</p>
          )}
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount">
            Tutar <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              ₺
            </span>
            <Input
              id="amount"
              type="text"
              value={amountDisplay}
              onChange={(e) => handleAmountChange(e.target.value)}
              onBlur={handleAmountBlur}
              placeholder="0.00"
              className={`pl-8 ${errors.amount ? "border-destructive" : ""}`}
              disabled={isLoading}
            />
          </div>
          {amount > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatAmount(amount)}
            </p>
          )}
          {errors.amount && (
            <p className="text-sm text-destructive">{errors.amount}</p>
          )}
        </div>

        {/* Payment Date (paidOn) */}
        <div className="space-y-2">
          <Label htmlFor="paidOn">
            Ödeme Tarihi <span className="text-destructive">*</span>
          </Label>
          <Input
            id="paidOn"
            type="date"
            value={paidOn}
            onChange={(e) => {
              setPaidOn(e.target.value);
              if (errors.paidOn) setErrors({ ...errors, paidOn: "" });
            }}
            max={getTodayDate()} // Prevent future dates
            className={errors.paidOn ? "border-destructive" : ""}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Geçmiş tarihli ödemeler kaydedilebilir
          </p>
          {errors.paidOn && (
            <p className="text-sm text-destructive">{errors.paidOn}</p>
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="paymentMethod">
            Ödeme Yöntemi <span className="text-destructive">*</span>
          </Label>
          <Select
            value={paymentMethod}
            onValueChange={(value) => {
              setPaymentMethod(value as PaymentMethod);
              if (errors.paymentMethod)
                setErrors({ ...errors, paymentMethod: "" });
            }}
            disabled={isLoading}
          >
            <SelectTrigger
              id="paymentMethod"
              className={errors.paymentMethod ? "border-destructive" : ""}
            >
              <SelectValue placeholder="Ödeme yöntemi seçin" />
            </SelectTrigger>
            <SelectContent>
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
          {errors.paymentMethod && (
            <p className="text-sm text-destructive">{errors.paymentMethod}</p>
          )}
        </div>

        {/* Note */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="note">Not</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (errors.note) setErrors({ ...errors, note: "" });
            }}
            placeholder="Ödeme hakkında notlar..."
            rows={3}
            maxLength={500}
            className={errors.note ? "border-destructive" : ""}
            disabled={isLoading}
          />
          <div className="flex justify-between">
            <p className="text-xs text-muted-foreground">
              İsteğe bağlı, en fazla 500 karakter
            </p>
            <p className="text-xs text-muted-foreground">
              {note.length}/500
            </p>
          </div>
          {errors.note && (
            <p className="text-sm text-destructive">{errors.note}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setErrors({});
              onCancel();
            }}
            disabled={isLoading}
          >
            İptal
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? "Kaydediliyor..."
            : mode === "create"
            ? "Ödeme Kaydet"
            : "Düzeltmeyi Kaydet"}
        </Button>
      </div>
    </form>
  );
}

