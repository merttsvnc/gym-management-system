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
  MembershipPlanWithCount,
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
  active: (
    tenantId: string,
    options?: { branchId?: string; includeMemberCount?: boolean },
  ) => ['membership-plans', tenantId, 'active', options] as const,
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
export function useActivePlans(
  tenantId: string,
  options?: {
    branchId?: string;
    includeMemberCount?: boolean;
  },
) {
  return useQuery<MembershipPlan[] | MembershipPlanWithCount[], ApiError>({
    queryKey: planKeys.active(tenantId, options),
    queryFn: () => getActivePlans(tenantId, options),
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
      const apiError = error as ApiError;
      // Handle specific error codes
      if (apiError.statusCode === 400) {
        // Validation error - message already shown by global handler
      } else if (apiError.statusCode === 403) {
        toast.error('Bu işlem için yetkiniz yok.');
      } else if (apiError.statusCode === 409) {
        toast.error('Bu plan adı zaten kullanılıyor.');
      } else if (apiError.statusCode === 404) {
        toast.error('Kayıt bulunamadı.');
      }
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
      const apiError = error as ApiError;
      // Handle specific error codes
      if (apiError.statusCode === 400) {
        // Validation error - message already shown by global handler
      } else if (apiError.statusCode === 403) {
        toast.error('Bu işlem için yetkiniz yok.');
      } else if (apiError.statusCode === 409) {
        toast.error('Bu plan adı zaten kullanılıyor.');
      } else if (apiError.statusCode === 404) {
        toast.error('Kayıt bulunamadı.');
      }
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
      // Archive is idempotent, so always show success
      if (data.activeMemberCount && data.activeMemberCount > 0) {
        toast.success(
          `Plan arşivlendi. Bu plana bağlı ${data.activeMemberCount} aktif üye bulunmaktadır.`,
        );
      } else {
        toast.success('Plan başarıyla arşivlendi');
      }
    },
    onError: (error) => {
      const apiError = error as ApiError;
      // Handle specific error codes
      if (apiError.statusCode === 403) {
        toast.error('Bu işlem için yetkiniz yok.');
      } else if (apiError.statusCode === 404) {
        toast.error('Kayıt bulunamadı.');
      }
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
      const apiError = error as ApiError;
      // Handle specific error codes
      if (apiError.statusCode === 400) {
        // Check if error message mentions conflict or already active
        const message = apiError.message || '';
        if (
          message.toLowerCase().includes('zaten') ||
          message.toLowerCase().includes('already')
        ) {
          toast.error('Plan zaten aktif durumda.');
        } else {
          toast.error(message || 'Plan geri yüklenirken bir hata oluştu');
        }
      } else if (apiError.statusCode === 403) {
        toast.error('Bu işlem için yetkiniz yok.');
      } else if (apiError.statusCode === 404) {
        toast.error('Kayıt bulunamadı.');
      }
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
      const apiError = error as ApiError;
      // Handle specific error codes
      if (apiError.statusCode === 400) {
        // Check if error message mentions members
        const message = apiError.message || '';
        if (
          message.toLowerCase().includes('üye') ||
          message.toLowerCase().includes('member')
        ) {
          toast.error(
            'Bu plana bağlı üyeler bulunmaktadır. Lütfen önce planı arşivleyin.',
          );
        } else {
          toast.error(message || 'Plan silinirken bir hata oluştu');
        }
      } else if (apiError.statusCode === 403) {
        toast.error('Bu işlem için yetkiniz yok.');
      } else if (apiError.statusCode === 404) {
        toast.error('Kayıt bulunamadı.');
      }
      return error;
    },
  });
}


