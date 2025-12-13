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
 */
export function PlanSelector({
  tenantId,
  value,
  onValueChange,
  disabled,
}: PlanSelectorProps) {
  const { data: plans, isLoading } = useActivePlans(tenantId);

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (!plans || plans.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Aktif plan bulunamadı" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value || ""}
      onValueChange={onValueChange}
      disabled={disabled}
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
