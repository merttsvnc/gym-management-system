import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActivePlans } from "@/hooks/use-membership-plans";
import { DurationType } from "@/types/membership-plan";
import { Skeleton } from "@/components/ui/skeleton";

interface PlanSelectorProps {
  tenantId: string;
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  branchId?: string;
  requireBranch?: boolean; // If true, disable when branchId is not provided
}

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
 * Component for selecting a membership plan
 * Shows only ACTIVE plans with name, duration, and price
 * Supports branch-aware filtering when branchId is provided
 */
export function PlanSelector({
  tenantId,
  value,
  onValueChange,
  disabled,
  branchId,
  requireBranch = false,
}: PlanSelectorProps) {
  // Fetch plans with branchId if provided
  const { data: plans, isLoading } = useActivePlans(tenantId, {
    branchId: branchId || undefined,
  });

  // Determine if dropdown should be disabled
  const isDisabled = disabled || (requireBranch && !branchId);

  if (isLoading) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-10 w-full" />
        <p className="text-xs text-muted-foreground">Planlar yükleniyor…</p>
      </div>
    );
  }

  // Show disabled state if branch is required but not selected
  if (requireBranch && !branchId) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Önce şube seçin" />
        </SelectTrigger>
      </Select>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="space-y-1">
        <Select disabled>
          <SelectTrigger>
            <SelectValue
              placeholder={
                branchId
                  ? "Bu şube için uygun plan bulunamadı."
                  : "Aktif plan bulunamadı"
              }
            />
          </SelectTrigger>
        </Select>
        {branchId && (
          <p className="text-xs text-muted-foreground">
            Bu şube için uygun plan bulunamadı.
          </p>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value || ""}
      onValueChange={onValueChange}
      disabled={isDisabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Üyelik planı seçin" />
      </SelectTrigger>
      <SelectContent>
        {plans.map((plan) => (
          <SelectItem key={plan.id} value={plan.id}>
            <div className="flex flex-col">
              <span className="font-medium">{plan.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatDuration(plan.durationType, plan.durationValue)} -{" "}
                {formatPrice(plan.price, plan.currency)}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
