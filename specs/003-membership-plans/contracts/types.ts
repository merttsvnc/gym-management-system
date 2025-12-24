/**
 * TypeScript Contracts for Membership Plan Management API
 * 
 * These types are shared between backend and frontend to ensure type safety
 * and prevent contract drift.
 * 
 * Version: 1.0.0
 * Feature: 003-membership-plans
 */

// ============================================================================
// Enums
// ============================================================================

export enum DurationType {
  DAYS = 'DAYS',
  MONTHS = 'MONTHS',
}

export enum PlanStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

// ============================================================================
// Core Types
// ============================================================================

export interface MembershipPlan {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  durationType: DurationType;
  durationValue: number;
  price: number;
  currency: string;
  maxFreezeDays?: number;
  autoRenew: boolean;
  status: PlanStatus;
  sortOrder?: number;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  // Computed field (optional, if requested)
  activeMemberCount?: number; // Number of active members using this plan
}

// ============================================================================
// Request DTOs
// ============================================================================

export interface CreatePlanRequest {
  name: string; // Required: Plan name, unique per tenant
  description?: string; // Optional: Plan description
  durationType: DurationType; // Required: "DAYS" or "MONTHS"
  durationValue: number; // Required: Integer > 0
  price: number; // Required: Decimal >= 0
  currency: string; // Required: ISO 4217 currency code
  maxFreezeDays?: number; // Optional: Integer >= 0, null means no freeze
  autoRenew?: boolean; // Optional: Default false
  sortOrder?: number; // Optional: Integer for UI ordering
}

export interface UpdatePlanRequest {
  name?: string; // Optional: Update plan name
  description?: string; // Optional: Update description
  durationType?: DurationType; // Optional: Update duration type
  durationValue?: number; // Optional: Update duration value
  price?: number; // Optional: Update price
  currency?: string; // Optional: Update currency
  maxFreezeDays?: number; // Optional: Update freeze days (null to remove)
  autoRenew?: boolean; // Optional: Update auto-renew flag
  sortOrder?: number; // Optional: Update sort order
  status?: PlanStatus; // Optional: Update status (ACTIVE/ARCHIVED)
}

export interface PlanListQuery {
  page?: number; // Default: 1
  limit?: number; // Default: 20, Max: 100
  status?: PlanStatus; // Optional: Filter by status (ACTIVE, ARCHIVED), default: all
  search?: string; // Optional: Search by plan name (partial match, case-insensitive)
}

// ============================================================================
// Response DTOs
// ============================================================================

export interface PlanListResponse {
  data: MembershipPlan[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ArchivePlanResponse {
  id: string;
  status: 'ARCHIVED';
  message: string; // Informational message
  activeMemberCount?: number; // Number of active members using this plan (if any)
}

// ============================================================================
// Error Response
// ============================================================================

export interface ErrorResponse {
  statusCode: number;
  message: string; // Error message
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// ============================================================================
// Member Integration Types (Modified)
// ============================================================================

export interface CreateMemberRequest {
  // ... existing fields ...
  
  // REPLACED: membershipType?: string;
  // NEW: Plan selection (required)
  membershipPlanId: string; // Required: ID of ACTIVE plan to assign
  
  // MODIFIED: Start date is optional (defaults to today)
  membershipStartDate?: string; // Optional: ISO 8601 date, defaults to today
  
  // REMOVED: membershipEndDate (now calculated automatically)
  // membershipEndDate is calculated from plan duration + start date
  
  // OPTIONAL: Store purchase price
  membershipPriceAtPurchase?: number; // Optional: Price at purchase time
}

export interface UpdateMemberRequest {
  // ... existing fields ...
  
  // NOT ALLOWED in v1: membershipPlanId (plan change requires explicit future feature)
  // membershipPlanId?: string; // Disallowed: Cannot change plan after creation
  
  // ALLOWED: Update dates manually if needed
  membershipStartDate?: string; // Optional: Update start date
  membershipEndDate?: string; // Optional: Update end date manually
}

export interface Member {
  // ... existing fields ...
  membershipPlanId: string; // NEW: Foreign key to plan
  membershipPlan?: MembershipPlan; // Optional: Include plan details if requested
  membershipPriceAtPurchase?: number; // Optional: Purchase-time price
  // ... other fields ...
}

// ============================================================================
// API Path Constants
// ============================================================================

export const MEMBERSHIP_PLANS_API_BASE = '/api/v1/membership-plans';

export const MEMBERSHIP_PLANS_API_PATHS = {
  LIST: MEMBERSHIP_PLANS_API_BASE,
  ACTIVE: `${MEMBERSHIP_PLANS_API_BASE}/active`,
  BY_ID: (id: string) => `${MEMBERSHIP_PLANS_API_BASE}/${id}`,
  ARCHIVE: (id: string) => `${MEMBERSHIP_PLANS_API_BASE}/${id}/archive`,
  RESTORE: (id: string) => `${MEMBERSHIP_PLANS_API_BASE}/${id}/restore`,
} as const;

// ============================================================================
// Validation Constants
// ============================================================================

export const PLAN_VALIDATION = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 1000,
  DURATION_DAYS_MIN: 1,
  DURATION_DAYS_MAX: 730,
  DURATION_MONTHS_MIN: 1,
  DURATION_MONTHS_MAX: 24,
  PRICE_MIN: 0,
  PRICE_DECIMAL_PLACES: 2,
  CURRENCY_REGEX: /^[A-Z]{3}$/,
  SORT_ORDER_DEFAULT: 0,
} as const;

// ============================================================================
// Type Guards
// ============================================================================

export function isDurationType(value: string): value is DurationType {
  return value === DurationType.DAYS || value === DurationType.MONTHS;
}

export function isPlanStatus(value: string): value is PlanStatus {
  return value === PlanStatus.ACTIVE || value === PlanStatus.ARCHIVED;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDuration(
  durationType: DurationType,
  durationValue: number,
): string {
  if (durationType === DurationType.DAYS) {
    return `${durationValue} ${durationValue === 1 ? 'day' : 'days'}`;
  }
  return `${durationValue} ${durationValue === 1 ? 'month' : 'months'}`;
}




