/**
 * Duration type enum matching backend Prisma schema
 */
export const DurationType = {
  DAYS: "DAYS",
  MONTHS: "MONTHS",
} as const;
export type DurationType = (typeof DurationType)[keyof typeof DurationType];

/**
 * Plan status enum matching backend Prisma schema
 */
export const PlanStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

/**
 * Plan scope enum matching backend Prisma schema
 */
export const PlanScope = {
  TENANT: "TENANT",
  BRANCH: "BRANCH",
} as const;
export type PlanScope = (typeof PlanScope)[keyof typeof PlanScope];

/**
 * Core membership plan entity, mirroring backend Prisma model
 */
export type MembershipPlan = {
  id: string; // CUID
  tenantId: string;
  scope: PlanScope; // TENANT or BRANCH
  branchId: string | null; // Required if scope is BRANCH, null if TENANT
  name: string;
  description: string | null;
  durationType: DurationType;
  durationValue: number;
  price: number; // Decimal as number
  currency: string; // ISO 4217 code (e.g., "JPY", "USD", "EUR")
  maxFreezeDays: number | null;
  autoRenew: boolean;
  status: PlanStatus;
  sortOrder: number | null;
  archivedAt: string | null; // ISO 8601 datetime or null
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  // Optional fields from relations
  branch?: {
    id: string;
    name: string;
  } | null;
};

/**
 * Membership plan with active member count (from /active endpoint)
 */
export type MembershipPlanWithCount = MembershipPlan & {
  activeMemberCount: number;
};

/**
 * Payload for creating a new membership plan
 * Used in POST /api/v1/membership-plans
 */
export type CreatePlanPayload = {
  scope: PlanScope; // TENANT or BRANCH
  branchId?: string; // Required if scope is BRANCH, must not be sent if TENANT
  name: string;
  description?: string;
  durationType: DurationType;
  durationValue: number;
  price: number;
  currency: string; // ISO 4217 code
  maxFreezeDays?: number;
  autoRenew?: boolean;
  sortOrder?: number;
};

/**
 * Payload for updating an existing membership plan
 * Used in PATCH /api/v1/membership-plans/:id
 */
export type UpdatePlanPayload = {
  name?: string;
  description?: string;
  durationType?: DurationType;
  durationValue?: number;
  price?: number;
  currency?: string;
  maxFreezeDays?: number | null;
  autoRenew?: boolean;
  sortOrder?: number | null;
  status?: PlanStatus;
};

/**
 * Query parameters for listing membership plans
 * Used in GET /api/v1/membership-plans
 */
export type PlanListQuery = {
  page?: number; // Default: 1, Min: 1
  limit?: number; // Default: 20, Min: 1, Max: 100
  status?: PlanStatus;
  search?: string; // Legacy, use q instead
  scope?: PlanScope; // TENANT or BRANCH
  branchId?: string; // Filter by branch ID
  q?: string; // Name search query
  includeArchived?: boolean; // Default: false
};

/**
 * Paginated response from GET /api/v1/membership-plans
 */
export type PlanListResponse = {
  data: MembershipPlan[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/**
 * Response from POST /api/v1/membership-plans/:id/archive
 */
export type ArchivePlanResponse = {
  id: string;
  status: PlanStatus;
  message: string;
  activeMemberCount?: number;
};
