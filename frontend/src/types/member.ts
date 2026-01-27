/**
 * Member status enum matching backend Prisma schema
 */
export const MemberStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

/**
 * Member gender enum matching backend Prisma schema
 */
export const MemberGender = {
  MALE: "MALE",
  FEMALE: "FEMALE",
} as const;
export type MemberGender = (typeof MemberGender)[keyof typeof MemberGender];

import type { MembershipPlan } from "./membership-plan";

/**
 * Core member entity, mirroring backend Prisma model
 */
export type Member = {
  id: string; // CUID
  tenantId: string;
  branchId: string;
  firstName: string;
  lastName: string;
  gender: MemberGender | null;
  dateOfBirth: string | null; // ISO 8601 datetime or null
  phone: string;
  email: string | null;
  photoUrl: string | null;
  membershipPlanId: string; // Foreign key to MembershipPlan
  membershipStartDate: string; // ISO 8601 datetime
  membershipEndDate: string; // ISO 8601 datetime
  membershipPriceAtPurchase: number | null; // Price at purchase time (Decimal as number)
  status: MemberStatus;
  pausedAt: string | null; // ISO 8601 datetime or null
  resumedAt: string | null; // ISO 8601 datetime or null
  notes: string | null;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime

  // Legacy computed field (kept for backwards compatibility)
  remainingDays: number;

  // New derived fields - single source of truth for membership activity
  isMembershipActive: boolean;
  membershipState: "ACTIVE" | "EXPIRED";
  daysRemaining: number | null;
  isExpiringSoon: boolean;

  membershipPlan?: MembershipPlan; // Optional relation, included when includePlan=true
};

/**
 * Payload for creating a new member
 * Used in POST /api/v1/members
 */
export type CreateMemberPayload = {
  branchId: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender?: MemberGender;
  dateOfBirth?: string; // ISO 8601 date string
  email?: string;
  photoUrl?: string;
  membershipPlanId: string; // Required: Foreign key to MembershipPlan
  membershipStartDate?: string; // ISO 8601 datetime (defaults to today if not provided)
  membershipPriceAtPurchase?: number; // Optional: Price at purchase time (defaults to plan price)
  notes?: string;
};

/**
 * Payload for updating an existing member
 * Used in PATCH /api/v1/members/:id
 * Note: membershipPlanId changes are not allowed in v1 (immutable after creation)
 */
export type UpdateMemberPayload = {
  branchId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: MemberGender;
  dateOfBirth?: string; // ISO 8601 date string
  email?: string;
  photoUrl?: string;
  membershipStartDate?: string; // ISO 8601 datetime
  membershipEndDate?: string; // ISO 8601 datetime
  notes?: string;
};

/**
 * Payload for changing member status
 * Used in POST /api/v1/members/:id/status
 */
export type ChangeMemberStatusPayload = {
  status: MemberStatus;
};

/**
 * Query parameters for listing members
 * Used in GET /api/v1/members
 */
export type MemberListQuery = {
  page?: number; // Default: 1, Min: 1
  limit?: number; // Default: 20, Min: 1, Max: 100
  branchId?: string;
  status?: MemberStatus;
  search?: string;
  includeArchived?: boolean; // Default: false
};

/**
 * Paginated response from GET /api/v1/members
 */
export type MemberListResponse = {
  data: Member[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
