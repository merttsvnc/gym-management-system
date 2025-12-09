/**
 * Shared TypeScript types for Tenant Management API
 * 
 * This file defines the contract between backend and frontend.
 * It should be kept in sync with the OpenAPI specification.
 * 
 * Usage:
 * - Backend: Use for DTOs and response typing
 * - Frontend: Use for API client and component props
 */

// ============================================================================
// Core Entities
// ============================================================================

/**
 * Tenant entity representing a gym business account
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: CurrencyCode;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
}

/**
 * Branch entity representing a physical gym location
 */
export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  archivedAt: string | null; // ISO 8601 datetime or null
}

// ============================================================================
// Enums and Constants
// ============================================================================

/**
 * Supported currency codes (ISO 4217)
 */
export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD',
  'JPY', 'CNY', 'INR', 'BRL', 'MXN',
  'ZAR', 'TRY', 'SGD', 'HKD', 'NZD',
] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

/**
 * User roles (currently only ADMIN implemented)
 */
export enum Role {
  ADMIN = 'ADMIN',
  // Future roles:
  // OWNER = 'OWNER',
  // STAFF = 'STAFF',
  // TRAINER = 'TRAINER',
  // ACCOUNTANT = 'ACCOUNTANT',
}

// ============================================================================
// API Request DTOs
// ============================================================================

/**
 * Request body for updating tenant settings
 */
export interface UpdateTenantRequest {
  name?: string;
  defaultCurrency?: CurrencyCode;
}

/**
 * Request body for creating a new branch
 */
export interface CreateBranchRequest {
  name: string;
  address: string;
}

/**
 * Request body for updating an existing branch
 */
export interface UpdateBranchRequest {
  name?: string;
  address?: string;
}

/**
 * Query parameters for listing branches
 */
export interface BranchListQuery {
  page?: number;
  limit?: number;
  includeArchived?: boolean;
}

// ============================================================================
// API Response DTOs
// ============================================================================

/**
 * Response for tenant endpoints
 */
export type TenantResponse = Tenant;

/**
 * Response for branch endpoints
 */
export type BranchResponse = Branch;

/**
 * Response for branch list endpoint with pagination
 */
export interface BranchListResponse {
  data: Branch[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  statusCode: number;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Validation rules for tenant and branch entities
 */
export const VALIDATION_RULES = {
  tenant: {
    name: {
      minLength: 3,
      maxLength: 100,
    },
  },
  branch: {
    name: {
      minLength: 2,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9 '\-&]+$/,
      patternMessage: 'Only alphanumeric characters, spaces, hyphens, apostrophes, and ampersands allowed',
    },
    address: {
      minLength: 5,
      maxLength: 300,
    },
  },
  pagination: {
    defaultPage: 1,
    defaultLimit: 20,
    maxLimit: 100,
  },
} as const;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a string is a valid currency code
 */
export function isValidCurrencyCode(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(code as CurrencyCode);
}

/**
 * Type guard to check if an object is a valid ErrorResponse
 */
export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'statusCode' in obj &&
    'message' in obj
  );
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract pagination info from any paginated response
 */
export type PaginationInfo = BranchListResponse['pagination'];

/**
 * Generic paginated response structure
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

/**
 * API response wrapper with status
 */
export type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: ErrorResponse };

// ============================================================================
// Business Logic Types
// ============================================================================

/**
 * Branch status for UI display
 */
export type BranchStatus = 'active' | 'archived';

/**
 * Helper to get branch status from Branch entity
 */
export function getBranchStatus(branch: Branch): BranchStatus {
  return branch.isActive ? 'active' : 'archived';
}

/**
 * Helper to check if branch can be archived
 */
export interface ArchiveValidation {
  canArchive: boolean;
  reason?: string;
}

// ============================================================================
// Frontend-Specific Types
// ============================================================================

/**
 * Form state for tenant settings form
 */
export interface TenantFormData {
  name: string;
  defaultCurrency: CurrencyCode;
}

/**
 * Form state for branch create/edit form
 */
export interface BranchFormData {
  name: string;
  address: string;
}

/**
 * Filter state for branch list
 */
export interface BranchFilters {
  page: number;
  limit: number;
  includeArchived: boolean;
}

// ============================================================================
// JWT Token Payload (for reference, not transmitted in API)
// ============================================================================

/**
 * Expected JWT token payload structure
 * (Backend generates, frontend reads)
 */
export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: Role;
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expires at (Unix timestamp)
}

// ============================================================================
// API Endpoint Paths (for reference)
// ============================================================================

/**
 * API endpoint paths for tenant management
 */
export const API_PATHS = {
  tenants: {
    current: '/api/v1/tenants/current',
  },
  branches: {
    list: '/api/v1/branches',
    byId: (id: string) => `/api/v1/branches/${id}`,
    archive: (id: string) => `/api/v1/branches/${id}/archive`,
    restore: (id: string) => `/api/v1/branches/${id}/restore`,
    setDefault: (id: string) => `/api/v1/branches/${id}/set-default`,
  },
} as const;

// ============================================================================
// HTTP Status Codes (for reference)
// ============================================================================

/**
 * HTTP status codes used in API responses
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SERVER_ERROR: 500,
} as const;

// ============================================================================
// Error Messages (for consistency)
// ============================================================================

/**
 * Standard error messages for tenant management operations
 */
export const ERROR_MESSAGES = {
  tenant: {
    notFound: 'Tenant not found',
    updateFailed: 'Failed to update tenant settings',
    invalidCurrency: 'Invalid currency code',
  },
  branch: {
    notFound: 'Branch not found',
    duplicateName: 'Branch name already exists for this tenant',
    cannotArchiveLast: 'Cannot archive the last active branch',
    cannotArchiveDefault: 'Cannot archive default branch. Set another branch as default first.',
    notArchived: 'Branch is not archived',
    cannotSetArchivedAsDefault: 'Cannot set archived branch as default',
    createFailed: 'Failed to create branch',
    updateFailed: 'Failed to update branch',
    archiveFailed: 'Failed to archive branch',
    restoreFailed: 'Failed to restore branch',
  },
  auth: {
    unauthorized: 'Unauthorized',
    forbidden: 'Access denied',
    invalidToken: 'Invalid or expired token',
    missingTenantContext: 'Tenant context not found',
  },
  validation: {
    invalidInput: 'Validation failed',
    missingFields: 'Required fields are missing',
  },
  general: {
    serverError: 'Internal server error',
    networkError: 'Network error. Please check your connection.',
  },
} as const;

// ============================================================================
// Success Messages (for UI feedback)
// ============================================================================

/**
 * Standard success messages for UI notifications
 */
export const SUCCESS_MESSAGES = {
  tenant: {
    updated: 'Tenant settings updated successfully',
  },
  branch: {
    created: 'Branch created successfully',
    updated: 'Branch updated successfully',
    archived: 'Branch archived successfully',
    restored: 'Branch restored successfully',
    defaultSet: 'Default branch updated successfully',
  },
} as const;

