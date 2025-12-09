import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentTenant, updateCurrentTenant } from '@/api/tenants';
import type { Tenant, UpdateTenantPayload } from '@/types/tenant';
import type { ApiError } from '@/types/error';

/**
 * Query keys for tenant-related queries
 */
const tenantKeys = {
  current: ['tenant', 'current'] as const,
};

/**
 * Hook to fetch the current tenant
 * Uses React Query to cache and manage tenant data
 */
export function useCurrentTenant() {
  return useQuery<Tenant, ApiError>({
    queryKey: tenantKeys.current,
    queryFn: getCurrentTenant,
  });
}

/**
 * Hook to update the current tenant settings
 * Automatically updates the cache on success
 */
export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation<Tenant, ApiError, UpdateTenantPayload>({
    mutationFn: updateCurrentTenant,
    onSuccess: (data) => {
      // Update the cache with the new tenant data
      queryClient.setQueryData(tenantKeys.current, data);
    },
  });
}

