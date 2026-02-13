/**
 * Request context type for multi-tenancy scope
 * Used to pass tenantId and branchId throughout the application
 */
export interface RequestContext {
  tenantId: string;
  branchId: string;
  userId?: string;
}
