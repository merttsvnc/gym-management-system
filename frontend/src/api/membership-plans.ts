import { apiClient } from './client';
import type {
  MembershipPlan,
  MembershipPlanWithCount,
  PlanListQuery,
  PlanListResponse,
  CreatePlanPayload,
  UpdatePlanPayload,
  ArchivePlanResponse,
} from '@/types/membership-plan';

/**
 * List membership plans for a tenant with pagination and filters
 * GET /api/v1/membership-plans?page=...&limit=...&scope=...&branchId=...&q=...&includeArchived=...
 */
export async function listPlans(
  query: PlanListQuery & { tenantId: string },
): Promise<PlanListResponse> {
  const { tenantId, ...queryParams } = query;
  const searchParams = new URLSearchParams();

  if (queryParams.page !== undefined) {
    searchParams.append('page', queryParams.page.toString());
  }
  if (queryParams.limit !== undefined) {
    searchParams.append('limit', queryParams.limit.toString());
  }
  if (queryParams.status) {
    searchParams.append('status', queryParams.status);
  }
  if (queryParams.search) {
    searchParams.append('search', queryParams.search);
  }
  if (queryParams.scope) {
    searchParams.append('scope', queryParams.scope);
  }
  if (queryParams.branchId) {
    searchParams.append('branchId', queryParams.branchId);
  }
  if (queryParams.q) {
    searchParams.append('q', queryParams.q);
  }
  if (queryParams.includeArchived !== undefined) {
    searchParams.append('includeArchived', queryParams.includeArchived.toString());
  }

  const url = `/membership-plans${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  return apiClient.get<PlanListResponse>(url, { tenantId });
}

/**
 * Get active membership plans for a tenant (no pagination)
 * GET /api/v1/membership-plans/active?branchId=...&includeMemberCount=...
 */
export async function getActivePlans(
  tenantId: string,
  options?: {
    branchId?: string;
    includeMemberCount?: boolean;
  },
): Promise<MembershipPlan[] | MembershipPlanWithCount[]> {
  const searchParams = new URLSearchParams();
  if (options?.branchId) {
    searchParams.append('branchId', options.branchId);
  }
  if (options?.includeMemberCount) {
    searchParams.append('includeMemberCount', 'true');
  }
  const url = `/membership-plans/active${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  return apiClient.get<MembershipPlan[] | MembershipPlanWithCount[]>(url, {
    tenantId,
  });
}

/**
 * Get a single membership plan by ID
 * GET /api/v1/membership-plans/:id
 */
export async function getPlan(
  planId: string,
  tenantId: string,
): Promise<MembershipPlan> {
  return apiClient.get<MembershipPlan>(`/membership-plans/${planId}`, {
    tenantId,
  });
}

/**
 * Create a new membership plan for a tenant
 * POST /api/v1/membership-plans
 */
export async function createPlan(
  payload: CreatePlanPayload,
  tenantId: string,
): Promise<MembershipPlan> {
  return apiClient.post<MembershipPlan, CreatePlanPayload>(
    '/membership-plans',
    payload,
    { tenantId },
  );
}

/**
 * Update an existing membership plan
 * PATCH /api/v1/membership-plans/:id
 */
export async function updatePlan(
  planId: string,
  payload: UpdatePlanPayload,
  tenantId: string,
): Promise<MembershipPlan> {
  return apiClient.patch<MembershipPlan, UpdatePlanPayload>(
    `/membership-plans/${planId}`,
    payload,
    { tenantId },
  );
}

/**
 * Archive a membership plan
 * POST /api/v1/membership-plans/:id/archive
 */
export async function archivePlan(
  planId: string,
  tenantId: string,
): Promise<ArchivePlanResponse> {
  return apiClient.post<ArchivePlanResponse>(
    `/membership-plans/${planId}/archive`,
    undefined,
    { tenantId },
  );
}

/**
 * Restore an archived membership plan
 * POST /api/v1/membership-plans/:id/restore
 */
export async function restorePlan(
  planId: string,
  tenantId: string,
): Promise<MembershipPlan> {
  return apiClient.post<MembershipPlan>(
    `/membership-plans/${planId}/restore`,
    undefined,
    { tenantId },
  );
}

/**
 * Delete a membership plan (only if no members)
 * DELETE /api/v1/membership-plans/:id
 */
export async function deletePlan(
  planId: string,
  tenantId: string,
): Promise<void> {
  return apiClient.del<void>(`/membership-plans/${planId}`, { tenantId });
}


