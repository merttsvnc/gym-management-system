import type { BillingStatus, LoginResponse, AuthMeResponse } from '@/types/billing';

export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN';
  tenantId: string;
}

/**
 * @deprecated Use LoginResponse from @/types/billing instead
 * Kept for backward compatibility during migration
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// Re-export billing types for convenience
export type { LoginResponse, AuthMeResponse, BillingStatus };

