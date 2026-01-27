/**
 * Payment method enum matching backend Prisma schema
 */
export const PaymentMethod = {
  CASH: "CASH",
  CREDIT_CARD: "CREDIT_CARD",
  BANK_TRANSFER: "BANK_TRANSFER",
  CHECK: "CHECK",
  OTHER: "OTHER",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Core payment entity, mirroring backend Prisma model
 * Uses `paidOn` field (not paymentDate) to represent DATE-ONLY business date
 */
export type Payment = {
  id: string; // CUID
  tenantId: string;
  branchId: string;
  memberId: string;
  amount: string; // Decimal as string for JSON serialization
  paidOn: string; // ISO 8601 date string (DATE-ONLY format: YYYY-MM-DD)
  paymentMethod: PaymentMethod;
  note: string | null;
  isCorrection: boolean;
  correctedPaymentId: string | null;
  isCorrected: boolean;
  version: number; // Optimistic locking version
  createdBy: string; // User ID
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string; // ISO 8601 datetime string;

  // Optional relations (populated when include relations)
  member?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  branch?: {
    id: string;
    name: string;
  };
};

/**
 * Payload for creating a new payment
 * Used in POST /api/v1/payments
 */
export type CreatePaymentRequest = {
  memberId: string;
  amount: number; // Decimal as number (0.01 to 999999.99)
  paidOn: string; // ISO 8601 date string (DATE-ONLY format: YYYY-MM-DD)
  paymentMethod: PaymentMethod;
  note?: string; // Optional, max 500 characters
};

/**
 * Payload for correcting an existing payment
 * Used in POST /api/v1/payments/:id/correct
 */
export type CorrectPaymentRequest = {
  amount?: number; // Optional: corrected amount
  paidOn?: string; // Optional: corrected date (ISO 8601 date string)
  paymentMethod?: PaymentMethod; // Optional: corrected payment method
  note?: string; // Optional: corrected note
  correctionReason?: string; // Optional: reason for correction (max 500 characters)
  version: number; // Required: optimistic locking version
};

/**
 * Response from payment correction endpoint
 * Includes warning if payment is older than 90 days
 */
export type CorrectPaymentResponse = Payment & {
  warning?: string; // Warning message if payment is older than 90 days
};

/**
 * Query parameters for listing payments
 * Used in GET /api/v1/payments
 */
export type PaymentListQuery = {
  memberId?: string;
  branchId?: string;
  paymentMethod?: PaymentMethod;
  startDate?: string; // ISO 8601 date string
  endDate?: string; // ISO 8601 date string
  includeCorrections?: boolean; // Default: false
  page?: number; // Default: 1, Min: 1
  limit?: number; // Default: 20, Min: 1, Max: 100
};

/**
 * Paginated response from GET /api/v1/payments
 */
export type PaymentListResponse = {
  data: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/**
 * Query parameters for revenue report
 * Used in GET /api/v1/revenue
 */
export type RevenueReportQuery = {
  startDate: string; // Required: ISO 8601 date string
  endDate: string; // Required: ISO 8601 date string
  branchId?: string;
  paymentMethod?: PaymentMethod;
  groupBy?: "day" | "week" | "month"; // Default: "day"
};

/**
 * Revenue breakdown item for a specific period
 */
export type RevenueBreakdownItem = {
  period: string; // Period identifier (YYYY-MM-DD for day, YYYY-MM for month, etc.)
  revenue: number; // Total revenue for this period
  count: number; // Number of payments in this period
};

/**
 * Response from revenue report endpoint
 * Used in GET /api/v1/revenue
 */
export type RevenueReportResponse = {
  totalRevenue: number; // Total revenue across all periods
  period: "day" | "week" | "month"; // Grouping period
  breakdown: RevenueBreakdownItem[]; // Revenue breakdown by period
};

