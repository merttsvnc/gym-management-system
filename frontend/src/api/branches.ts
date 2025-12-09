import { apiClient } from './client';
import type {
  Branch,
  BranchListQuery,
  BranchListResponse,
  CreateBranchPayload,
  UpdateBranchPayload,
} from '@/types/branch';

/**
 * List branches for a tenant with pagination
 * GET /api/v1/branches?page=...&limit=...&includeArchived=...
 */
export async function listBranches(
  query: BranchListQuery & { tenantId: string },
): Promise<BranchListResponse> {
  const { tenantId, ...queryParams } = query;
  const searchParams = new URLSearchParams();
  
  if (queryParams.page !== undefined) {
    searchParams.append('page', queryParams.page.toString());
  }
  if (queryParams.limit !== undefined) {
    searchParams.append('limit', queryParams.limit.toString());
  }
  if (queryParams.includeArchived !== undefined) {
    searchParams.append('includeArchived', queryParams.includeArchived.toString());
  }

  const url = `/branches${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  
  return apiClient.get<BranchListResponse>(url, { tenantId });
}

/**
 * Get a single branch by ID
 * GET /api/v1/branches/:id
 */
export async function getBranchById(
  branchId: string,
  tenantId: string,
): Promise<Branch> {
  return apiClient.get<Branch>(`/branches/${branchId}`, { tenantId });
}

/**
 * Create a new branch for a tenant
 * POST /api/v1/branches
 */
export async function createBranch(
  payload: CreateBranchPayload,
  tenantId: string,
): Promise<Branch> {
  return apiClient.post<Branch, CreateBranchPayload>('/branches', payload, {
    tenantId,
  });
}

/**
 * Update an existing branch
 * PATCH /api/v1/branches/:id
 */
export async function updateBranch(
  branchId: string,
  payload: UpdateBranchPayload,
  tenantId: string,
): Promise<Branch> {
  return apiClient.patch<Branch, UpdateBranchPayload>(
    `/branches/${branchId}`,
    payload,
    { tenantId },
  );
}

/**
 * Archive (soft-delete) a branch
 * POST /api/v1/branches/:id/archive
 */
export async function archiveBranch(
  branchId: string,
  tenantId: string,
): Promise<Branch> {
  return apiClient.post<Branch>(`/branches/${branchId}/archive`, undefined, {
    tenantId,
  });
}

/**
 * Restore an archived branch
 * POST /api/v1/branches/:id/restore
 */
export async function restoreBranch(
  branchId: string,
  tenantId: string,
): Promise<Branch> {
  return apiClient.post<Branch>(`/branches/${branchId}/restore`, undefined, {
    tenantId,
  });
}

/**
 * Set a branch as the default branch for the tenant
 * POST /api/v1/branches/:id/set-default
 */
export async function setDefaultBranch(
  branchId: string,
  tenantId: string,
): Promise<Branch> {
  return apiClient.post<Branch>(`/branches/${branchId}/set-default`, undefined, {
    tenantId,
  });
}

