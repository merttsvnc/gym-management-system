import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlanStatusBadge } from './PlanStatusBadge';
import { DurationType, type MembershipPlan } from '@/types/membership-plan';
import { Pencil, Archive, ArchiveRestore } from 'lucide-react';

interface PlanCardProps {
  plan: MembershipPlan;
  onEdit: (plan: MembershipPlan) => void;
  onArchive: (plan: MembershipPlan) => void;
  onRestore: (plan: MembershipPlan) => void;
}

/**
 * Format duration for display
 */
function formatDuration(durationType: DurationType, durationValue: number): string {
  if (durationType === DurationType.DAYS) {
    return `${durationValue} gün`;
  }
  return `${durationValue} ay`;
}

/**
 * Format price for display
 */
function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * Card component displaying plan details
 * Shows: Name, duration, price, status badge
 * Actions: Edit, Archive/Restore
 */
export function PlanCard({
  plan,
  onEdit,
  onArchive,
  onRestore,
}: PlanCardProps) {
  const isArchived = plan.status === 'ARCHIVED';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{plan.name}</CardTitle>
            {plan.description && (
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            )}
          </div>
          <PlanStatusBadge status={plan.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Süre:</span>
            <span className="font-medium">
              {formatDuration(plan.durationType, plan.durationValue)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fiyat:</span>
            <span className="font-medium">{formatPrice(plan.price, plan.currency)}</span>
          </div>
          {plan.maxFreezeDays !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Maksimum Dondurma:</span>
              <span className="font-medium">{plan.maxFreezeDays} gün</span>
            </div>
          )}
          {plan.autoRenew && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Otomatik Yenileme:</span>
              <span className="font-medium text-green-600">Aktif</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(plan)}
            className="flex-1"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Düzenle
          </Button>
          {isArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRestore(plan)}
              className="flex-1"
            >
              <ArchiveRestore className="h-4 w-4 mr-2" />
              Geri Yükle
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onArchive(plan)}
              className="flex-1"
            >
              <Archive className="h-4 w-4 mr-2" />
              Arşivle
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

