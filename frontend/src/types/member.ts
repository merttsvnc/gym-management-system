/**
 * Member status enum matching backend Prisma schema
 */
export enum MemberStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Member gender enum matching backend Prisma schema
 */
export enum MemberGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

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
  membershipType: string;
  membershipStartAt: string; // ISO 8601 datetime
  membershipEndAt: string; // ISO 8601 datetime
  status: MemberStatus;
  pausedAt: string | null; // ISO 8601 datetime or null
  resumedAt: string | null; // ISO 8601 datetime or null
  notes: string | null;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  remainingDays: number; // Computed by backend
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
  membershipType?: string;
  membershipStartAt?: string; // ISO 8601 datetime
  membershipEndAt?: string; // ISO 8601 datetime
  notes?: string;
};

/**
 * Payload for updating an existing member
 * Used in PATCH /api/v1/members/:id
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
  membershipType?: string;
  membershipStartAt?: string; // ISO 8601 datetime
  membershipEndAt?: string; // ISO 8601 datetime
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

