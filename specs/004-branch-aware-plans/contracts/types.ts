/**
 * TypeScript Contracts for Branch-Aware Membership Plan Management API
 * 
 * These types are shared between backend and frontend to ensure type safety
 * and prevent contract drift.
 * 
 * Version: 1.0.0
 * Feature: 004-branch-aware-plans
 */

// ============================================================================
// Enums
// ============================================================================

export enum PlanScope {
  TENANT = 'TENANT',
  BRANCH = 'BRANCH',
}

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
  scope: PlanScope; // "TENANT" or "BRANCH"
  branchId: string | null; // null for TENANT scope, branch ID for BRANCH scope
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
  scope: PlanScope; // Required: "TENANT" or "BRANCH"
  branchId?: string; // Required if scope is BRANCH, must be omitted or null if scope is TENANT
  name: string; // Required: Plan name, unique per tenant (TENANT scope) or per branch (BRANCH scope)
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
  // scope and branchId are NOT ALLOWED (immutable after creation)
  name?: string; // Optional: Update plan name
  description?: string; // Optional: Update description
  durationType?: DurationType; // Optional: Update duration type (immutable, but allowed for validation)
  durationValue?: number; // Optional: Update duration value (immutable, but allowed for validation)
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
  scope?: PlanScope; // Optional: Filter by scope (TENANT | BRANCH)
  branchId?: string; // Optional: Filter by branchId (returns BRANCH-scoped plans for that branch)
  q?: string; // Optional: Search by plan name (partial match, case-insensitive)
  includeArchived?: boolean; // Optional: Include archived plans, default: false
  includeMemberCount?: boolean; // Optional: Include activeMemberCount field, default: false
}

export interface ActivePlansQuery {
  branchId?: string; // Optional: Filter plans available to a specific branch
  // If branchId provided: Returns TENANT-scoped plans + BRANCH-scoped plans for that branch
  // If branchId not provided: Returns all TENANT-scoped plans only
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

export interface RestorePlanResponse {
  id: string;
  status: 'ACTIVE';
  message: string;
}

export interface ErrorResponse {
  statusCode: number;
  message: string; // Error message
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isTenantScoped(plan: MembershipPlan): plan is MembershipPlan & { scope: PlanScope.TENANT; branchId: null } {
  return plan.scope === PlanScope.TENANT && plan.branchId === null;
}

export function isBranchScoped(plan: MembershipPlan): plan is MembershipPlan & { scope: PlanScope.BRANCH; branchId: string } {
  return plan.scope === PlanScope.BRANCH && plan.branchId !== null;
}


