import { Badge } from "@/components/ui/badge";
import {
  IconCash,
  IconCreditCard,
  IconBuildingBank,
  IconFileCheck,
  IconQuestionMark,
} from "@tabler/icons-react";
import { PaymentMethod } from "@/types/payment";

interface PaymentMethodBadgeProps {
  paymentMethod: PaymentMethod;
  className?: string;
}

/**
 * Maps payment method to Turkish label
 */
const paymentMethodLabels: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Nakit",
  [PaymentMethod.CREDIT_CARD]: "Kredi/Banka Kartı",
  [PaymentMethod.BANK_TRANSFER]: "Havale/EFT",
  [PaymentMethod.CHECK]: "Çek",
  [PaymentMethod.OTHER]: "Diğer",
};

/**
 * Maps payment method to badge variant
 */
const paymentMethodVariants: Record<
  PaymentMethod,
  "default" | "secondary" | "outline"
> = {
  [PaymentMethod.CASH]: "default",
  [PaymentMethod.CREDIT_CARD]: "secondary",
  [PaymentMethod.BANK_TRANSFER]: "secondary",
  [PaymentMethod.CHECK]: "outline",
  [PaymentMethod.OTHER]: "outline",
};

/**
 * Maps payment method to icon component
 */
const paymentMethodIcons: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  [PaymentMethod.CASH]: IconCash,
  [PaymentMethod.CREDIT_CARD]: IconCreditCard,
  [PaymentMethod.BANK_TRANSFER]: IconBuildingBank,
  [PaymentMethod.CHECK]: IconFileCheck,
  [PaymentMethod.OTHER]: IconQuestionMark,
};

/**
 * Maps payment method to custom color classes
 */
const paymentMethodColors: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  [PaymentMethod.CREDIT_CARD]: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  [PaymentMethod.BANK_TRANSFER]: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  [PaymentMethod.CHECK]: "",
  [PaymentMethod.OTHER]: "",
};

/**
 * PaymentMethodBadge component for displaying payment method with icon and color
 * Provides accessible labels and visual indicators
 */
export function PaymentMethodBadge({
  paymentMethod,
  className,
}: PaymentMethodBadgeProps) {
  // Safe fallback for unexpected values
  const label = paymentMethodLabels[paymentMethod] ?? "Bilinmeyen";
  const variant = paymentMethodVariants[paymentMethod] ?? "outline";
  const Icon = paymentMethodIcons[paymentMethod] ?? IconQuestionMark;
  const colorClasses = paymentMethodColors[paymentMethod] ?? "";

  return (
    <Badge
      variant={variant}
      className={`${colorClasses} ${className || ""}`}
      aria-label={`Ödeme yöntemi: ${label}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

