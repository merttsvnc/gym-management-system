import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { MembershipDistributionItem } from "../types";

type MembershipDistributionChartProps = {
  data: MembershipDistributionItem[] | undefined;
  isLoading?: boolean;
};

/**
 * Color palette for bars (using CSS variables for theme support)
 */
const COLORS = [
  "var(--primary)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * Membership distribution bar chart component
 */
export function MembershipDistributionChart({
  data,
  isLoading = false,
}: MembershipDistributionChartProps) {
  const chartData = data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Üyelik Dağılımı</CardTitle>
        <CardDescription>Plan bazında aktif üye sayısı</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            Aktif üyelik bulunamadı
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" style={{ fontSize: "12px" }} />
              <YAxis
                dataKey="planName"
                type="category"
                width={150}
                style={{ fontSize: "12px" }}
              />
              <Tooltip
                formatter={(value: number) => [
                  new Intl.NumberFormat("tr-TR").format(value),
                  "Aktif Üye",
                ]}
              />
              <Bar dataKey="activeMemberCount" radius={[0, 4, 4, 0]}>
                {chartData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

