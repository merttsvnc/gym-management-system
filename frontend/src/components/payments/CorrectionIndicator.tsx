import { Badge } from "@/components/ui/badge";
import { IconEdit, IconLink } from "@tabler/icons-react";
import { Link } from "react-router-dom";

interface CorrectionIndicatorProps {
  /**
   * True if this payment is a correction (isCorrection = true)
   */
  isCorrection?: boolean;
  /**
   * True if this payment has been corrected (isCorrected = true)
   */
  isCorrected?: boolean;
  /**
   * ID of the original payment that was corrected (if this is a correction)
   */
  correctedPaymentId?: string | null;
  /**
   * ID of the payment that corrected this one (if this has been corrected)
   * Note: This may not be directly available in Payment type, but can be passed if known
   */
  correctingPaymentId?: string | null;
  /**
   * Optional callback when link is clicked (for navigation handling)
   */
  onLinkClick?: (paymentId: string) => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

/**
 * CorrectionIndicator component for displaying correction status
 * Shows badges indicating if a payment is a correction or has been corrected
 * Provides links to navigate to related payments
 */
export function CorrectionIndicator({
  isCorrection = false,
  isCorrected = false,
  correctedPaymentId,
  correctingPaymentId,
  onLinkClick,
  className,
}: CorrectionIndicatorProps) {
  // If payment is a correction, show link to original payment
  if (isCorrection && correctedPaymentId) {
    const handleLinkClick = (e: React.MouseEvent) => {
      if (onLinkClick) {
        e.preventDefault();
        onLinkClick(correctedPaymentId!);
      }
    };

    return (
      <div className={`flex items-center gap-2 ${className || ""}`}>
        <Badge
          variant="secondary"
          className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
          aria-label="Bu ödeme bir düzeltmedir"
        >
          <IconEdit className="h-3 w-3 mr-1" aria-hidden="true" />
          Düzeltme
        </Badge>
        {correctedPaymentId && (
          onLinkClick ? (
            <button
              onClick={handleLinkClick}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline bg-transparent border-none cursor-pointer p-0"
              aria-label={`Orijinal ödemeye git: ${correctedPaymentId}`}
            >
              <IconLink className="h-3 w-3" aria-hidden="true" />
              <span>Orijinal ödeme</span>
            </button>
          ) : (
            <Link
              to={`/payments/${correctedPaymentId}`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline"
              aria-label={`Orijinal ödemeye git: ${correctedPaymentId}`}
            >
              <IconLink className="h-3 w-3" aria-hidden="true" />
              <span>Orijinal ödeme</span>
            </Link>
          )
        )}
      </div>
    );
  }

  // If payment has been corrected, show link to correcting payment
  if (isCorrected && correctingPaymentId) {
    const handleLinkClick = (e: React.MouseEvent) => {
      if (onLinkClick) {
        e.preventDefault();
        onLinkClick(correctingPaymentId!);
      }
    };

    return (
      <div className={`flex items-center gap-2 ${className || ""}`}>
        <Badge
          variant="outline"
          className="text-orange-600 dark:text-orange-400 border-orange-500/20"
          aria-label="Bu ödeme düzeltilmiştir"
        >
          <IconEdit className="h-3 w-3 mr-1" aria-hidden="true" />
          Düzeltilmiş
        </Badge>
        {correctingPaymentId && (
          onLinkClick ? (
            <button
              onClick={handleLinkClick}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline bg-transparent border-none cursor-pointer p-0"
              aria-label={`Düzeltme ödemesine git: ${correctingPaymentId}`}
            >
              <IconLink className="h-3 w-3" aria-hidden="true" />
              <span>Düzeltme ödemesi</span>
            </button>
          ) : (
            <Link
              to={`/payments/${correctingPaymentId}`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline"
              aria-label={`Düzeltme ödemesine git: ${correctingPaymentId}`}
            >
              <IconLink className="h-3 w-3" aria-hidden="true" />
              <span>Düzeltme ödemesi</span>
            </Link>
          )
        )}
      </div>
    );
  }

  // If payment has been corrected but no correctingPaymentId provided, show badge only
  if (isCorrected) {
    return (
      <Badge
        variant="outline"
        className={`text-orange-600 dark:text-orange-400 border-orange-500/20 ${className || ""}`}
        aria-label="Bu ödeme düzeltilmiştir"
      >
        <IconEdit className="h-3 w-3 mr-1" aria-hidden="true" />
        Düzeltilmiş
      </Badge>
    );
  }

  // If payment is a correction but no correctedPaymentId provided, show badge only
  if (isCorrection) {
    return (
      <Badge
        variant="secondary"
        className={`bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 ${className || ""}`}
        aria-label="Bu ödeme bir düzeltmedir"
      >
        <IconEdit className="h-3 w-3 mr-1" aria-hidden="true" />
        Düzeltme
      </Badge>
    );
  }

  // Normal payment (no correction status)
  return (
    <Badge
      variant="outline"
      className={`text-green-600 dark:text-green-400 border-green-500/20 ${className || ""}`}
      aria-label="Normal ödeme"
    >
      Normal
    </Badge>
  );
}

