/**
 * Core tenant entity, mirroring backend Prisma model
 */
export type Tenant = {
  id: string; // CUID
  name: string;
  slug: string;
  defaultCurrency: string; // ISO 4217 code (e.g., "USD", "EUR")
  planKey: "SINGLE"; // Plan key from backend enum
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
};

/**
 * Response shape from GET /api/v1/tenants/current
 */
export type TenantResponse = Tenant;

/**
 * Payload for updating tenant settings
 * Used in PATCH /api/v1/tenants/current
 */
export type UpdateTenantPayload = {
  name?: string; // 3-100 characters, alphanumeric and spaces
  defaultCurrency?: string; // ISO 4217 code
};


