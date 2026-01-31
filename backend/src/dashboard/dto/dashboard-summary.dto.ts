/**
 * Response DTO for dashboard summary endpoint
 * Used by mobile home page cards
 */
export class DashboardSummaryDto {
  counts: {
    totalMembers: number;
    activeMembers: number;
    passiveMembers: number;
    expiringSoonMembers: number;
  };
  meta: {
    expiringDays: number;
    branchId?: string;
  };
}
