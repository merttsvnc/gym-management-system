import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listBranches,
  createBranch,
  updateBranch,
  archiveBranch,
  restoreBranch,
  setDefaultBranch,
} from '@/api/branches';
import type {
  Branch,
  BranchListQuery,
  BranchListResponse,
  CreateBranchPayload,
  UpdateBranchPayload,
} from '@/types/branch';
import type { ApiError } from '@/types/error';

/**
 * Query keys for branch-related queries
 */
const branchKeys = {
  list: (tenantId: string, query?: Partial<BranchListQuery>) =>
    ['branches', tenantId, query] as const,
  detail: (tenantId: string, branchId: string) =>
    ['branches', tenantId, branchId] as const,
};

/**
 * Hook to fetch branches for a tenant
 * Automatically disabled if tenantId is not provided
 */
export function useBranches(
  tenantId: string,
  query?: Partial<BranchListQuery>,
) {
  return useQuery<BranchListResponse, ApiError>({
    queryKey: branchKeys.list(tenantId, query),
    queryFn: () => listBranches({ tenantId, ...query }),
    enabled: !!tenantId,
  });
}

/**
 * Hook to create a new branch
 * Invalidates the branch list query on success
 */
export function useCreateBranch(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<Branch, ApiError, CreateBranchPayload>({
    mutationFn: (payload) => createBranch(payload, tenantId),
    onSuccess: () => {
      // Invalidate branch list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['branches', tenantId],
      });
    },
  });
}

/**
 * Hook to update an existing branch
 * Invalidates the branch list query on success
 */
export function useUpdateBranch(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    Branch,
    ApiError,
    { branchId: string; payload: UpdateBranchPayload }
  >({
    mutationFn: ({ branchId, payload }) =>
      updateBranch(branchId, payload, tenantId),
    onSuccess: () => {
      // Invalidate branch list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['branches', tenantId],
      });
    },
  });
}

/**
 * Hook to archive a branch
 * Invalidates the branch list query on success
 */
export function useArchiveBranch(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<Branch, ApiError, string>({
    mutationFn: (branchId) => archiveBranch(branchId, tenantId),
    onSuccess: () => {
      // Invalidate branch list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['branches', tenantId],
      });
    },
  });
}

/**
 * Hook to restore an archived branch
 * Invalidates the branch list query on success
 */
export function useRestoreBranch(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<Branch, ApiError, string>({
    mutationFn: (branchId) => restoreBranch(branchId, tenantId),
    onSuccess: () => {
      // Invalidate branch list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['branches', tenantId],
      });
    },
  });
}

/**
 * Hook to set a branch as the default branch
 * Invalidates the branch list query on success
 */
export function useSetDefaultBranch(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<Branch, ApiError, string>({
    mutationFn: (branchId) => setDefaultBranch(branchId, tenantId),
    onSuccess: () => {
      // Invalidate branch list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['branches', tenantId],
      });
    },
  });
}

