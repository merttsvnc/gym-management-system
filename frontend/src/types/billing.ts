/**
 * Billing status type matching backend Prisma schema
 */
export const BillingStatus = {
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  SUSPENDED: "SUSPENDED",
} as const;

export type BillingStatus = (typeof BillingStatus)[keyof typeof BillingStatus];

/**
 * Tenant billing information
 */
export interface TenantBillingInfo {
  id: string;
  name: string;
  billingStatus: BillingStatus;
  billingStatusUpdatedAt?: string | null;
}

/**
 * Login response type including billing status
 * Note: refreshToken is optional as backend may not return it
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken?: string; // Optional - backend doesn't currently return refresh tokens
  user: {
    id: string;
    email: string;
    role: "ADMIN";
    tenantId: string;
  };
  tenant: {
    id: string;
    name: string;
    billingStatus: BillingStatus;
  };
}

/**
 * Auth me response type including billing status
 */
export interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: "ADMIN";
    tenantId: string;
  };
  tenant: {
    id: string;
    name: string;
    billingStatus: BillingStatus;
    billingStatusUpdatedAt: string | null;
  };
}
