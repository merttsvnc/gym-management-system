import { Badge } from '@/components/ui/badge';
import { MemberStatus } from '@/types/member';

interface MemberStatusBadgeProps {
  status: MemberStatus;
}

/**
 * Maps member status to Turkish label
 */
const statusLabels: Record<MemberStatus, string> = {
  [MemberStatus.ACTIVE]: 'Aktif',
  [MemberStatus.PAUSED]: 'Dondurulmuş',
  [MemberStatus.INACTIVE]: 'Pasif',
  [MemberStatus.ARCHIVED]: 'Arşivlenmiş',
};

/**
 * Maps member status to badge variant
 */
const statusVariants: Record<MemberStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  [MemberStatus.ACTIVE]: 'default', // Green-ish (primary)
  [MemberStatus.PAUSED]: 'secondary', // Yellow/amber (muted)
  [MemberStatus.INACTIVE]: 'outline', // Gray
  [MemberStatus.ARCHIVED]: 'destructive', // Red
};

/**
 * Component to display member status with color coding
 */
export function MemberStatusBadge({ status }: MemberStatusBadgeProps) {
  const label = statusLabels[status];
  const variant = statusVariants[status];

  // Custom styling for PAUSED to make it more yellow/amber
  const className =
    status === MemberStatus.PAUSED
      ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20'
      : status === MemberStatus.ACTIVE
        ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'
        : '';

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

