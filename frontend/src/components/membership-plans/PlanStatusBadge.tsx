import { Badge } from '@/components/ui/badge';
import { PlanStatus } from '@/types/membership-plan';

interface PlanStatusBadgeProps {
  status: PlanStatus;
}

/**
 * Badge component for displaying membership plan status
 * ACTIVE = green, ARCHIVED = gray
 */
export function PlanStatusBadge({ status }: PlanStatusBadgeProps) {
  if (status === PlanStatus.ACTIVE) {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
        Aktif
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600">
      Arşivlenmiş
    </Badge>
  );
}

