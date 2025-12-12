import { apiClient } from './client';
import type {
  MembershipPlan,
  PlanListQuery,
  PlanListResponse,
  CreatePlanPayload,
  UpdatePlanPayload,
  ArchivePlanResponse,
} from '@/types/membership-plan';

/**
 * List membership plans for a tenant with pagination and filters
 * GET /api/v1/membership-plans?page=...&limit=...&status=...&search=...
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

  const url = `/membership-plans${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  return apiClient.get<PlanListResponse>(url, { tenantId });
}

/**
 * Get active membership plans for a tenant (no pagination)
 * GET /api/v1/membership-plans/active
 */
export async function getActivePlans(
  tenantId: string,
): Promise<MembershipPlan[]> {
  return apiClient.get<MembershipPlan[]>(`/membership-plans/active`, {
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


