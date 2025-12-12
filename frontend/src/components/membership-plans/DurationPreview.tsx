import { addDays, addMonths, format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { DurationType, type MembershipPlan } from '@/types/membership-plan';

interface DurationPreviewProps {
  startDate: Date | null;
  plan: MembershipPlan | null;
}

/**
 * Component that calculates and displays membership end date preview
 * Updates reactively when start date or plan changes
 */
export function DurationPreview({
  startDate,
  plan,
}: DurationPreviewProps) {
  if (!startDate || !plan) {
    return null;
  }

  let endDate: Date;
  if (plan.durationType === DurationType.DAYS) {
    endDate = addDays(startDate, plan.durationValue);
  } else {
    endDate = addMonths(startDate, plan.durationValue);
  }

  return (
    <p className="text-sm text-muted-foreground">
      Üyelik bitiş tarihi:{' '}
      <span className="font-medium text-foreground">
        {format(endDate, 'dd MMMM yyyy', { locale: tr })}
      </span>
    </p>
  );
}

