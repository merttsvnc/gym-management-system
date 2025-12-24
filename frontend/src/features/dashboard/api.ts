import { apiClient } from "@/api/client";
import type {
  DashboardSummary,
  MembershipDistributionItem,
  MonthlyMembersItem,
} from "./types";

/**
 * Dashboard API client methods
 */

/**
 * Get dashboard summary (KPI metrics)
 * GET /api/v1/dashboard/summary?branchId=...
 */
export async function getDashboardSummary(
  branchId?: string
): Promise<DashboardSummary> {
  const searchParams = new URLSearchParams();
  if (branchId) {
    searchParams.append("branchId", branchId);
  }
  const url = `/dashboard/summary${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  return apiClient.get<DashboardSummary>(url);
}

/**
 * Get membership distribution by plan
 * GET /api/v1/dashboard/membership-distribution?branchId=...
 */
export async function getMembershipDistribution(
  branchId?: string
): Promise<MembershipDistributionItem[]> {
  const searchParams = new URLSearchParams();
  if (branchId) {
    searchParams.append("branchId", branchId);
  }
  const url = `/dashboard/membership-distribution${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  return apiClient.get<MembershipDistributionItem[]>(url);
}

/**
 * Get monthly new members data
 * GET /api/v1/dashboard/monthly-members?branchId=...&months=6
 */
export async function getMonthlyMembers(
  branchId?: string,
  months: number = 6
): Promise<MonthlyMembersItem[]> {
  const searchParams = new URLSearchParams();
  if (branchId) {
    searchParams.append("branchId", branchId);
  }
  searchParams.append("months", months.toString());
  const url = `/dashboard/monthly-members?${searchParams.toString()}`;
  return apiClient.get<MonthlyMembersItem[]>(url);
}


