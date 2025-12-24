/**
 * Dashboard API response types
 */

/**
 * Summary response from GET /api/v1/dashboard/summary
 */
export type DashboardSummary = {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  expiringSoon: number; // Members expiring in next 7 days
};

/**
 * Membership distribution item from GET /api/v1/dashboard/membership-distribution
 */
export type MembershipDistributionItem = {
  planId: string;
  planName: string;
  activeMemberCount: number;
};

/**
 * Monthly members item from GET /api/v1/dashboard/monthly-members
 */
export type MonthlyMembersItem = {
  month: string; // Format: "YYYY-MM"
  newMembers: number;
};


