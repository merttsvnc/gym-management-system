import { Badge } from "@/components/ui/badge";
import { MemberStatus } from "@/types/member";

interface MemberWorkflowStatusBadgeProps {
  status: MemberStatus;
}

/**
 * Maps member workflow status to Turkish label
 */
const statusLabels: Record<MemberStatus, string> = {
  [MemberStatus.ACTIVE]: "Sistemde Aktif",
  [MemberStatus.PAUSED]: "Dondurulmuş",
  [MemberStatus.INACTIVE]: "Pasif",
  [MemberStatus.ARCHIVED]: "Arşivlenmiş",
};

/**
 * Maps member workflow status to badge variant
 */
const statusVariants: Record<
  MemberStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  [MemberStatus.ACTIVE]: "default",
  [MemberStatus.PAUSED]: "secondary",
  [MemberStatus.INACTIVE]: "outline",
  [MemberStatus.ARCHIVED]: "destructive",
};

/**
 * Component to display persisted workflow status (PAUSED/ARCHIVED/INACTIVE/ACTIVE)
 * 
 * This component shows the workflow status stored in the database, not the derived
 * membership validity. Use MembershipStateBadge for membership validity display.
 * 
 * @example
 * <MemberWorkflowStatusBadge status={member.status} />
 */
export function MemberWorkflowStatusBadge({
  status,
}: MemberWorkflowStatusBadgeProps) {
  const label = statusLabels[status];
  const variant = statusVariants[status];

  // Custom styling for specific statuses
  const className =
    status === MemberStatus.PAUSED
      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
      : status === MemberStatus.ACTIVE
      ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
      : "";

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

