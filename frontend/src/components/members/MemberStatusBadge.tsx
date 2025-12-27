import { Badge } from "@/components/ui/badge";
import { MemberStatus, type Member } from "@/types/member";

interface MemberStatusBadgeProps {
  status?: MemberStatus;
  member?: Member;
}

/**
 * Maps member status to Turkish label
 * Note: For membership activity (active/expired), use member.membershipState instead
 */
const statusLabels: Record<MemberStatus, string> = {
  [MemberStatus.ACTIVE]: "Aktif",
  [MemberStatus.PAUSED]: "Dondurulmuş",
  [MemberStatus.INACTIVE]: "Pasif",
  [MemberStatus.ARCHIVED]: "Arşivlenmiş",
};

/**
 * Maps member status to badge variant
 */
const statusVariants: Record<
  MemberStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  [MemberStatus.ACTIVE]: "default", // Green-ish (primary)
  [MemberStatus.PAUSED]: "secondary", // Yellow/amber (muted)
  [MemberStatus.INACTIVE]: "outline", // Gray
  [MemberStatus.ARCHIVED]: "destructive", // Red
};

/**
 * Component to display member status with color coding
 *
 * USAGE:
 * - Pass `member` prop to display derived membership status (active/expired)
 * - Pass `status` prop to display the persisted status field (active/paused/inactive/archived)
 *
 * For membership activity status, prefer passing `member` to show derived status.
 */
export function MemberStatusBadge({ status, member }: MemberStatusBadgeProps) {
  // If member is provided, show derived membership status
  if (member) {
    const isExpired = member.membershipState === "EXPIRED";
    const label = isExpired ? "Süresi Dolmuş" : "Aktif";
    const variant = isExpired ? "destructive" : "default";
    const className = isExpired
      ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
      : member.isExpiringSoon
      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
      : "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";

    return (
      <Badge variant={variant} className={className}>
        {label}
        {member.isExpiringSoon && !isExpired && " (Yakında Bitecek)"}
      </Badge>
    );
  }

  // Fallback: show persisted status field
  if (!status) {
    return null;
  }

  const label = statusLabels[status];
  const variant = statusVariants[status];

  // Custom styling for PAUSED to make it more yellow/amber
  const className =
    status === MemberStatus.PAUSED
      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
      : status === MemberStatus.ACTIVE
      ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
      : "";

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
