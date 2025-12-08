/**
 * Core branch entity, mirroring backend Prisma model
 */
export type Branch = {
  id: string; // CUID
  tenantId: string;
  name: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  archivedAt: string | null; // ISO 8601 datetime or null
};

/**
 * Payload for creating a new branch
 * Used in POST /api/v1/branches
 */
export type CreateBranchPayload = {
  name: string; // 2-100 characters, alphanumeric, spaces, hyphens, apostrophes, ampersands
  address: string; // 5-300 characters
};

/**
 * Payload for updating an existing branch
 * Used in PATCH /api/v1/branches/:id
 */
export type UpdateBranchPayload = {
  name?: string; // 2-100 characters, must be unique within tenant
  address?: string; // 5-300 characters
};

/**
 * Query parameters for listing branches
 * Used in GET /api/v1/branches
 */
export type BranchListQuery = {
  page?: number; // Default: 1, Min: 1
  limit?: number; // Default: 20, Min: 1, Max: 100
  includeArchived?: boolean; // Default: false
};

/**
 * Paginated response from GET /api/v1/branches
 */
export type BranchListResponse = {
  data: Branch[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
