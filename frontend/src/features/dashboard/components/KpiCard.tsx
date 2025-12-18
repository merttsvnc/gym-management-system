import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type KpiCardProps = {
  title: string;
  value: number | undefined;
  description?: string;
  isLoading?: boolean;
};

/**
 * Reusable KPI card component
 */
export function KpiCard({
  title,
  value,
  description,
  isLoading = false,
}: KpiCardProps) {
  const formattedValue =
    value !== undefined
      ? new Intl.NumberFormat("tr-TR").format(value)
      : "0";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{formattedValue}</div>
        )}
        {description && (
          <CardDescription className="mt-1">{description}</CardDescription>
        )}
      </CardContent>
    </Card>
  );
}

