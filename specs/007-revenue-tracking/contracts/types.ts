/**
 * TypeScript Contracts for Collections & Revenue Tracking API
 * 
 * These types are shared between backend and frontend to ensure type safety
 * and prevent contract drift.
 * 
 * Version: 1.0.0
 * Feature: 007-revenue-tracking
 */

// ============================================================================
// Enums
// ============================================================================

export enum PaymentMethod {
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  OTHER = 'OTHER',
}

// ============================================================================
// Core Types
// ============================================================================

export interface Payment {
  id: string;
  tenantId: string;
  branchId: string;
  memberId: string;
  amount: string; // Decimal as string (e.g., "100.00")
  paidOn: string; // ISO 8601 date string (YYYY-MM-DD, date-only, no time component). DATE-ONLY business date stored as start-of-day UTC DateTime.
  paymentMethod: PaymentMethod;
  note: string | null;
  isCorrection: boolean;
  correctedPaymentId: string | null;
  isCorrected: boolean;
  version: number; // Version number for optimistic locking
  createdBy: string; // User ID
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string; // ISO 8601 datetime string
  member: {
    id: string;
    firstName: string;
    lastName: string;
  };
  branch: {
    id: string;
    name: string;
  };
}

// ============================================================================
// Request DTOs
// ============================================================================

export interface CreatePaymentRequest {
  memberId: string; // CUID of member
  amount: number; // Positive number, 2 decimal places
  paidOn: string; // ISO 8601 date string (YYYY-MM-DD, date-only, no time component), can be in the past. DATE-ONLY business date stored as start-of-day UTC DateTime.
  paymentMethod: PaymentMethod; // Enum: CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER
  note?: string | null; // Optional note (max 500 characters)
}

export interface CorrectPaymentRequest {
  amount?: number; // New amount (if correcting amount)
  paidOn?: string; // New date (if correcting date, ISO 8601). DATE-ONLY business date stored as start-of-day UTC DateTime.
  paymentMethod?: PaymentMethod; // New payment method (if correcting method)
  note?: string | null; // Updated note (optional)
  correctionReason?: string | null; // Reason for correction (optional, max 500 chars)
  version: number; // Current version of payment (for optimistic locking)
}

export interface PaymentListQuery {
  memberId?: string; // Filter by member ID
  branchId?: string; // Filter by branch ID
  paymentMethod?: PaymentMethod; // Filter by payment method
  startDate?: string; // Filter payments from this date (inclusive, ISO 8601)
  endDate?: string; // Filter payments to this date (inclusive, ISO 8601)
  includeCorrections?: boolean; // Include corrected payments in results (default: true)
  page?: number; // Page number (default: 1)
  limit?: number; // Items per page (default: 20, max: 100)
}

export interface MemberPaymentsQuery {
  startDate?: string; // Filter payments from this date (inclusive)
  endDate?: string; // Filter payments to this date (inclusive)
  page?: number; // Page number (default: 1)
  limit?: number; // Items per page (default: 20, max: 100)
}

export interface RevenueReportQuery {
  startDate: string; // Start date for revenue period (ISO 8601, required)
  endDate: string; // End date for revenue period (ISO 8601, required)
  branchId?: string; // Filter by branch ID
  paymentMethod?: PaymentMethod; // Filter by payment method
  groupBy?: 'day' | 'week' | 'month'; // Grouping period (default: "day")
}

// ============================================================================
// Response DTOs
// ============================================================================

export interface PaymentResponse extends Payment {}

export interface PaymentListResponse {
  data: PaymentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CorrectPaymentResponse {
  payment: PaymentResponse;
  warning?: string; // Warning message if payment is older than 90 days
}

export interface RevenueReportResponse {
  totalRevenue: string; // Total revenue as decimal string
  currency: string; // Tenant's default currency
  period: {
    startDate: string; // ISO 8601 date
    endDate: string; // ISO 8601 date
  };
  breakdown: Array<{
    period: string; // Period identifier (date, week, or month)
    revenue: string; // Revenue for this period as decimal string
    paymentCount: number; // Number of payments in this period
  }>;
  filters: {
    branchId: string | null;
    paymentMethod: PaymentMethod | null;
  };
}

// ============================================================================
// Error Responses
// ============================================================================

export interface ErrorResponse {
  statusCode: number;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// ============================================================================
// Helper Types
// ============================================================================

export type PaymentListParams = PaymentListQuery;
export type MemberPaymentsParams = MemberPaymentsQuery;
export type RevenueReportParams = RevenueReportQuery;

