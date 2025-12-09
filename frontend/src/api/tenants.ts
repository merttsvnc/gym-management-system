import { apiClient } from './client';
import type { Tenant, UpdateTenantPayload } from '@/types/tenant';

/**
 * Get the current tenant for the authenticated user
 * GET /api/v1/tenants/current
 */
export async function getCurrentTenant(): Promise<Tenant> {
  return apiClient.get<Tenant>('/tenants/current');
}

/**
 * Update the current tenant settings
 * PATCH /api/v1/tenants/current
 */
export async function updateCurrentTenant(
  payload: UpdateTenantPayload,
): Promise<Tenant> {
  return apiClient.patch<Tenant, UpdateTenantPayload>(
    '/tenants/current',
    payload,
  );
}

