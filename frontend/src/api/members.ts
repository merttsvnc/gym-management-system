import { apiClient } from './client';
import type {
  Member,
  MemberListQuery,
  MemberListResponse,
  CreateMemberPayload,
  UpdateMemberPayload,
  ChangeMemberStatusPayload,
} from '@/types/member';

/**
 * List members for a tenant with pagination and filters
 * GET /api/v1/members?page=...&limit=...&branchId=...&status=...&search=...&includeArchived=...
 */
export async function listMembers(
  query: MemberListQuery & { tenantId: string },
): Promise<MemberListResponse> {
  const { tenantId, ...queryParams } = query;
  const searchParams = new URLSearchParams();

  if (queryParams.page !== undefined) {
    searchParams.append('page', queryParams.page.toString());
  }
  if (queryParams.limit !== undefined) {
    searchParams.append('limit', queryParams.limit.toString());
  }
  if (queryParams.branchId) {
    searchParams.append('branchId', queryParams.branchId);
  }
  if (queryParams.status) {
    searchParams.append('status', queryParams.status);
  }
  if (queryParams.search) {
    searchParams.append('search', queryParams.search);
  }
  if (queryParams.includeArchived !== undefined) {
    searchParams.append('includeArchived', queryParams.includeArchived.toString());
  }

  const url = `/members${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  return apiClient.get<MemberListResponse>(url, { tenantId });
}

/**
 * Get a single member by ID
 * GET /api/v1/members/:id
 */
export async function getMemberById(
  memberId: string,
  tenantId: string,
): Promise<Member> {
  return apiClient.get<Member>(`/members/${memberId}`, { tenantId });
}

/**
 * Create a new member for a tenant
 * POST /api/v1/members
 */
export async function createMember(
  payload: CreateMemberPayload,
  tenantId: string,
): Promise<Member> {
  return apiClient.post<Member, CreateMemberPayload>('/members', payload, {
    tenantId,
  });
}

/**
 * Update an existing member
 * PATCH /api/v1/members/:id
 */
export async function updateMember(
  memberId: string,
  payload: UpdateMemberPayload,
  tenantId: string,
): Promise<Member> {
  return apiClient.patch<Member, UpdateMemberPayload>(
    `/members/${memberId}`,
    payload,
    { tenantId },
  );
}

/**
 * Change member status
 * POST /api/v1/members/:id/status
 */
export async function changeMemberStatus(
  memberId: string,
  payload: ChangeMemberStatusPayload,
  tenantId: string,
): Promise<Member> {
  return apiClient.post<Member, ChangeMemberStatusPayload>(
    `/members/${memberId}/status`,
    payload,
    { tenantId },
  );
}

/**
 * Archive (soft-delete) a member
 * POST /api/v1/members/:id/archive
 */
export async function archiveMember(
  memberId: string,
  tenantId: string,
): Promise<Member> {
  return apiClient.post<Member>(`/members/${memberId}/archive`, undefined, {
    tenantId,
  });
}

