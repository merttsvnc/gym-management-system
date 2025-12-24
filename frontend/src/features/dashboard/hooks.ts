import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDashboardSummary,
  getMembershipDistribution,
  getMonthlyMembers,
} from "./api";
import type {
  DashboardSummary,
  MembershipDistributionItem,
  MonthlyMembersItem,
} from "./types";
import type { ApiError } from "@/types/error";

/**
 * Query keys for dashboard queries
 */
const dashboardKeys = {
  summary: (branchId?: string) =>
    ["dashboard", "summary", branchId || "all"] as const,
  distribution: (branchId?: string) =>
    ["dashboard", "distribution", branchId || "all"] as const,
  monthlyMembers: (branchId?: string, months?: number) =>
    ["dashboard", "monthly-members", branchId || "all", months] as const,
};

/**
 * Hook to fetch dashboard summary (KPI metrics)
 */
export function useDashboardSummary(branchId?: string) {
  return useQuery<DashboardSummary, ApiError>({
    queryKey: dashboardKeys.summary(branchId),
    queryFn: () => getDashboardSummary(branchId),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook to fetch membership distribution by plan
 */
export function useMembershipDistribution(branchId?: string) {
  return useQuery<MembershipDistributionItem[], ApiError>({
    queryKey: dashboardKeys.distribution(branchId),
    queryFn: () => getMembershipDistribution(branchId),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook to fetch monthly new members data
 */
export function useMonthlyMembers(
  branchId?: string,
  months: number = 6
) {
  return useQuery<MonthlyMembersItem[], ApiError>({
    queryKey: dashboardKeys.monthlyMembers(branchId, months),
    queryFn: () => getMonthlyMembers(branchId, months),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook to refresh all dashboard data
 */
export function useRefreshDashboard() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}


