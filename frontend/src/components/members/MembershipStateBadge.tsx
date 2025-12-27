import { Badge } from "@/components/ui/badge";
import type { Member } from "@/types/member";

interface MembershipStateBadgeProps {
  member: Pick<Member, "membershipState" | "isExpiringSoon">;
}

/**
 * Component to display derived membership state (ACTIVE/EXPIRED/EXPIRING SOON)
 * 
 * This component shows the actual membership validity status based on membership dates,
 * not the persisted workflow status. Use MemberWorkflowStatusBadge for workflow status.
 * 
 * @example
 * <MembershipStateBadge member={member} />
 */
export function MembershipStateBadge({ member }: MembershipStateBadgeProps) {
  const isExpired = member.membershipState === "EXPIRED";
  
  if (isExpired) {
    return (
      <Badge
        variant="destructive"
        className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
      >
        Süresi Dolmuş
      </Badge>
    );
  }

  // ACTIVE membership
  const label = "Aktif";
  const className = member.isExpiringSoon
    ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
    : "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
  const variant = member.isExpiringSoon ? "secondary" : "default";

  return (
    <Badge variant={variant} className={className}>
      {label}
      {member.isExpiringSoon && " (Yakında Bitecek)"}
    </Badge>
  );
}

