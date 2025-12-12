import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listMembers,
  getMemberById,
  createMember,
  updateMember,
  changeMemberStatus,
  archiveMember,
} from "@/api/members";
import type {
  Member,
  MemberListQuery,
  MemberListResponse,
  CreateMemberPayload,
  UpdateMemberPayload,
  ChangeMemberStatusPayload,
} from "@/types/member";
import type { ApiError } from "@/types/error";
import { toast } from "sonner";

/**
 * Query keys for member-related queries
 */
const memberKeys = {
  list: (tenantId: string, query?: Partial<MemberListQuery>) =>
    ["members", tenantId, query] as const,
  detail: (tenantId: string, memberId: string) =>
    ["members", tenantId, memberId] as const,
};

/**
 * Hook to fetch members for a tenant
 * Automatically disabled if tenantId is not provided
 */
export function useMembers(tenantId: string, query?: Partial<MemberListQuery>) {
  return useQuery<MemberListResponse, ApiError>({
    queryKey: memberKeys.list(tenantId, query),
    queryFn: () => listMembers({ tenantId, ...query }),
    enabled: !!tenantId,
  });
}

/**
 * Hook to fetch a single member by ID
 * Automatically disabled if tenantId or memberId is not provided
 * Includes plan information by default
 */
export function useMember(tenantId: string, memberId: string) {
  return useQuery<Member, ApiError>({
    queryKey: memberKeys.detail(tenantId, memberId),
    queryFn: () => getMemberById(memberId, tenantId, true), // includePlan=true
    enabled: !!tenantId && !!memberId,
  });
}

/**
 * Hook to create a new member
 * Invalidates the member list query on success
 */
export function useCreateMember(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<Member, ApiError, CreateMemberPayload>({
    mutationFn: (payload) => createMember(payload, tenantId),
    onSuccess: () => {
      // Invalidate member list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ["members", tenantId],
      });
      toast.success("Üye başarıyla oluşturuldu");
    },
    onError: (error) => {
      // Global interceptor shows toast, but we can add specific handling here if needed
      return error;
    },
  });
}

/**
 * Hook to update an existing member
 * Invalidates the member list and detail queries on success
 */
export function useUpdateMember(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    Member,
    ApiError,
    { memberId: string; payload: UpdateMemberPayload }
  >({
    mutationFn: ({ memberId, payload }) =>
      updateMember(memberId, payload, tenantId),
    onSuccess: (data) => {
      // Invalidate member list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ["members", tenantId],
      });
      // Update the detail query cache
      queryClient.setQueryData(memberKeys.detail(tenantId, data.id), data);
      toast.success("Üye başarıyla güncellendi");
    },
    onError: (error) => {
      return error;
    },
  });
}

/**
 * Hook to change member status
 * Invalidates the member list and detail queries on success
 */
export function useChangeMemberStatus(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    Member,
    ApiError,
    { memberId: string; payload: ChangeMemberStatusPayload }
  >({
    mutationFn: ({ memberId, payload }) =>
      changeMemberStatus(memberId, payload, tenantId),
    onSuccess: (data) => {
      // Invalidate member list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ["members", tenantId],
      });
      // Update the detail query cache
      queryClient.setQueryData(memberKeys.detail(tenantId, data.id), data);
      toast.success("Üye durumu güncellendi");
    },
    onError: (error) => {
      return error;
    },
  });
}

/**
 * Hook to archive a member
 * Invalidates the member list and detail queries on success
 */
export function useArchiveMember(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<Member, ApiError, string>({
    mutationFn: (memberId) => archiveMember(memberId, tenantId),
    onSuccess: (data) => {
      // Invalidate member list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ["members", tenantId],
      });
      // Update the detail query cache
      queryClient.setQueryData(memberKeys.detail(tenantId, data.id), data);
      toast.success("Üye arşivlendi");
    },
    onError: (error) => {
      return error;
    },
  });
}
