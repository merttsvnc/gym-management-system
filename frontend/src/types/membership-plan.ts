/**
 * Duration type enum matching backend Prisma schema
 */
export enum DurationType {
  DAYS = 'DAYS',
  MONTHS = 'MONTHS',
}

/**
 * Plan status enum matching backend Prisma schema
 */
export enum PlanStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Core membership plan entity, mirroring backend Prisma model
 */
export type MembershipPlan = {
  id: string; // CUID
  tenantId: string;
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
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
};

/**
 * Payload for creating a new membership plan
 * Used in POST /api/v1/membership-plans
 */
export type CreatePlanPayload = {
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
  search?: string;
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

