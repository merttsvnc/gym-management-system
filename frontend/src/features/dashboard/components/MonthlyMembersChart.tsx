import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyMembersItem } from "../types";

type MonthlyMembersChartProps = {
  data: MonthlyMembersItem[] | undefined;
  isLoading?: boolean;
};

/**
 * Format month string (YYYY-MM) to display format (Dec 2025)
 */
function formatMonth(monthStr: string): string {
  try {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("tr-TR", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return monthStr;
  }
}

/**
 * Monthly new members line chart component
 */
export function MonthlyMembersChart({
  data,
  isLoading = false,
}: MonthlyMembersChartProps) {
  const chartData = data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aylık Yeni Üyeler</CardTitle>
        <CardDescription>Son 6 ay içinde kayıt olan üye sayısı</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            Veri bulunamadı
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                style={{ fontSize: "12px" }}
              />
              <YAxis style={{ fontSize: "12px" }} />
              <Tooltip
                labelFormatter={(value) => formatMonth(value as string)}
                formatter={(value: number) => [
                  new Intl.NumberFormat("tr-TR").format(value),
                  "Yeni Üye",
                ]}
              />
              <Line
                type="monotone"
                dataKey="newMembers"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

