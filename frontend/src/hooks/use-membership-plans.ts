import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPlans,
  getActivePlans,
  getPlan,
  createPlan,
  updatePlan,
  archivePlan,
  restorePlan,
  deletePlan,
} from '@/api/membership-plans';
import type {
  MembershipPlan,
  PlanListQuery,
  PlanListResponse,
  CreatePlanPayload,
  UpdatePlanPayload,
  ArchivePlanResponse,
} from '@/types/membership-plan';
import type { ApiError } from '@/types/error';
import { toast } from 'sonner';

/**
 * Query keys for membership plan-related queries
 */
const planKeys = {
  list: (tenantId: string, query?: Partial<PlanListQuery>) =>
    ['membership-plans', tenantId, query] as const,
  active: (tenantId: string) =>
    ['membership-plans', tenantId, 'active'] as const,
  detail: (tenantId: string, planId: string) =>
    ['membership-plans', tenantId, planId] as const,
};

/**
 * Hook to fetch membership plans for a tenant with filters
 * Automatically disabled if tenantId is not provided
 */
export function useMembershipPlans(
  tenantId: string,
  query?: Partial<PlanListQuery>,
) {
  return useQuery<PlanListResponse, ApiError>({
    queryKey: planKeys.list(tenantId, query),
    queryFn: () => listPlans({ tenantId, ...query }),
    enabled: !!tenantId,
  });
}

/**
 * Hook to fetch active membership plans for dropdowns
 * Automatically disabled if tenantId is not provided
 */
export function useActivePlans(tenantId: string) {
  return useQuery<MembershipPlan[], ApiError>({
    queryKey: planKeys.active(tenantId),
    queryFn: () => getActivePlans(tenantId),
    enabled: !!tenantId,
  });
}

/**
 * Hook to fetch a single membership plan by ID
 * Automatically disabled if tenantId or planId is not provided
 */
export function useMembershipPlan(tenantId: string, planId: string) {
  return useQuery<MembershipPlan, ApiError>({
    queryKey: planKeys.detail(tenantId, planId),
    queryFn: () => getPlan(planId, tenantId),
    enabled: !!tenantId && !!planId,
  });
}

/**
 * Hook to create a new membership plan
 * Invalidates the plan list and active plans queries on success
 */
export function useCreatePlan(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<MembershipPlan, ApiError, CreatePlanPayload>({
    mutationFn: (payload) => createPlan(payload, tenantId),
    onSuccess: () => {
      // Invalidate plan list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['membership-plans', tenantId],
      });
      toast.success('Üyelik planı başarıyla oluşturuldu');
    },
    onError: (error) => {
      return error;
    },
  });
}

/**
 * Hook to update an existing membership plan
 * Invalidates the plan list, active plans, and detail queries on success
 */
export function useUpdatePlan(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MembershipPlan,
    ApiError,
    { planId: string; payload: UpdatePlanPayload }
  >({
    mutationFn: ({ planId, payload }) => updatePlan(planId, payload, tenantId),
    onSuccess: (data) => {
      // Invalidate plan list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['membership-plans', tenantId],
      });
      // Update the detail query cache
      queryClient.setQueryData(planKeys.detail(tenantId, data.id), data);
      toast.success('Üyelik planı başarıyla güncellendi');
    },
    onError: (error) => {
      return error;
    },
  });
}

/**
 * Hook to archive a membership plan
 * Invalidates the plan list, active plans, and detail queries on success
 */
export function useArchivePlan(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<ArchivePlanResponse, ApiError, string>({
    mutationFn: (planId) => archivePlan(planId, tenantId),
    onSuccess: (data, planId) => {
      // Invalidate plan list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['membership-plans', tenantId],
      });
      // Update the detail query cache
      queryClient.setQueryData(planKeys.detail(tenantId, planId), {
        ...data,
        status: data.status,
      });
      toast.success(
        data.activeMemberCount
          ? `Plan arşivlendi. Bu plana bağlı ${data.activeMemberCount} aktif üye bulunmaktadır.`
          : 'Plan başarıyla arşivlendi',
      );
    },
    onError: (error) => {
      return error;
    },
  });
}

/**
 * Hook to restore an archived membership plan
 * Invalidates the plan list, active plans, and detail queries on success
 */
export function useRestorePlan(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<MembershipPlan, ApiError, string>({
    mutationFn: (planId) => restorePlan(planId, tenantId),
    onSuccess: (data) => {
      // Invalidate plan list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['membership-plans', tenantId],
      });
      // Update the detail query cache
      queryClient.setQueryData(planKeys.detail(tenantId, data.id), data);
      toast.success('Plan başarıyla geri yüklendi');
    },
    onError: (error) => {
      return error;
    },
  });
}

/**
 * Hook to delete a membership plan
 * Invalidates the plan list and active plans queries on success
 */
export function useDeletePlan(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (planId) => deletePlan(planId, tenantId),
    onSuccess: () => {
      // Invalidate plan list queries for this tenant
      queryClient.invalidateQueries({
        queryKey: ['membership-plans', tenantId],
      });
      toast.success('Plan başarıyla silindi');
    },
    onError: (error) => {
      return error;
    },
  });
}


