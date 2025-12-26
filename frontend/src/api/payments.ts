import { apiClient } from "./client";
import type {
  Payment,
  CreatePaymentRequest,
  CorrectPaymentRequest,
  CorrectPaymentResponse,
  PaymentListQuery,
  PaymentListResponse,
  RevenueReportQuery,
  RevenueReportResponse,
} from "@/types/payment";
import type { ApiError } from "@/types/error";

/**
 * Create a new payment
 * POST /api/v1/payments
 *
 * Error handling:
 * - 400: Validation error (invalid amount, future date, etc.)
 * - 403: Member from different tenant
 * - 429: Rate limit exceeded
 */
export async function createPayment(
  payload: CreatePaymentRequest,
  tenantId: string
): Promise<Payment> {
  try {
    return await apiClient.post<Payment, CreatePaymentRequest>(
      "/payments",
      payload,
      { tenantId }
    );
  } catch (error) {
    const apiError = error as ApiError;

    // Handle 400 BadRequest (validation errors)
    if (apiError.statusCode === 400) {
      throw new Error(
        apiError.message || "Ödeme oluşturulurken doğrulama hatası oluştu"
      );
    }

    // Handle 403 Forbidden (member from different tenant)
    if (apiError.statusCode === 403) {
      throw new Error(apiError.message || "Bu üye farklı bir kiracıya ait");
    }

    // Handle 429 Too Many Requests (rate limit)
    if (apiError.statusCode === 429) {
      throw new Error(
        apiError.message ||
          "Çok fazla istek gönderildi. Lütfen birkaç dakika sonra tekrar deneyin."
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * List payments with filtering and pagination
 * GET /api/v1/payments?page=...&limit=...&memberId=...&branchId=...&paymentMethod=...&startDate=...&endDate=...&includeCorrections=...
 */
export async function getPayments(
  query: PaymentListQuery & { tenantId: string }
): Promise<PaymentListResponse> {
  const { tenantId, ...queryParams } = query;
  const searchParams = new URLSearchParams();

  if (queryParams.memberId) {
    searchParams.append("memberId", queryParams.memberId);
  }
  if (queryParams.branchId) {
    searchParams.append("branchId", queryParams.branchId);
  }
  if (queryParams.paymentMethod) {
    searchParams.append("paymentMethod", queryParams.paymentMethod);
  }
  if (queryParams.startDate) {
    searchParams.append("startDate", queryParams.startDate);
  }
  if (queryParams.endDate) {
    searchParams.append("endDate", queryParams.endDate);
  }
  if (queryParams.includeCorrections !== undefined) {
    searchParams.append(
      "includeCorrections",
      queryParams.includeCorrections.toString()
    );
  }
  if (queryParams.page !== undefined) {
    searchParams.append("page", queryParams.page.toString());
  }
  if (queryParams.limit !== undefined) {
    searchParams.append("limit", queryParams.limit.toString());
  }

  const url = `/payments${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;

  try {
    return await apiClient.get<PaymentListResponse>(url, { tenantId });
  } catch (error) {
    const apiError = error as ApiError;

    // Handle 400 BadRequest (invalid query parameters)
    if (apiError.statusCode === 400) {
      throw new Error(apiError.message || "Geçersiz sorgu parametreleri");
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Get a single payment by ID
 * GET /api/v1/payments/:id
 *
 * Error handling:
 * - 403: Payment from different tenant
 * - 404: Payment not found
 */
export async function getPaymentById(
  paymentId: string,
  tenantId: string
): Promise<Payment> {
  try {
    return await apiClient.get<Payment>(`/payments/${paymentId}`, { tenantId });
  } catch (error) {
    const apiError = error as ApiError;

    // Handle 403 Forbidden (payment from different tenant)
    if (apiError.statusCode === 403) {
      throw new Error(apiError.message || "Bu ödeme farklı bir kiracıya ait");
    }

    // Handle 404 Not Found
    if (apiError.statusCode === 404) {
      throw new Error(apiError.message || "Ödeme bulunamadı");
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Get all payments for a specific member (payment history)
 * GET /api/v1/members/:memberId/payments?startDate=...&endDate=...&page=...&limit=...
 *
 * Error handling:
 * - 403: Member from different tenant
 * - 404: Member not found
 */
export async function getMemberPayments(
  memberId: string,
  tenantId: string,
  query?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }
): Promise<PaymentListResponse> {
  const searchParams = new URLSearchParams();

  if (query?.startDate) {
    searchParams.append("startDate", query.startDate);
  }
  if (query?.endDate) {
    searchParams.append("endDate", query.endDate);
  }
  if (query?.page !== undefined) {
    searchParams.append("page", query.page.toString());
  }
  if (query?.limit !== undefined) {
    searchParams.append("limit", query.limit.toString());
  }

  const url = `/payments/members/${memberId}${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;

  try {
    return await apiClient.get<PaymentListResponse>(url, { tenantId });
  } catch (error) {
    const apiError = error as ApiError;

    // Handle 403 Forbidden (member from different tenant)
    if (apiError.statusCode === 403) {
      throw new Error(apiError.message || "Bu üye farklı bir kiracıya ait");
    }

    // Handle 404 Not Found
    if (apiError.statusCode === 404) {
      throw new Error(apiError.message || "Üye bulunamadı");
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Correct an existing payment
 * POST /api/v1/payments/:id/correct
 *
 * Error handling:
 * - 400: Validation error or payment already corrected (single-correction rule)
 * - 403: Payment from different tenant
 * - 404: Payment not found
 * - 409: Version conflict (concurrent correction attempt)
 * - 429: Rate limit exceeded
 */
export async function correctPayment(
  paymentId: string,
  payload: CorrectPaymentRequest,
  tenantId: string
): Promise<CorrectPaymentResponse> {
  try {
    return await apiClient.post<CorrectPaymentResponse, CorrectPaymentRequest>(
      `/payments/${paymentId}/correct`,
      payload,
      { tenantId }
    );
  } catch (error) {
    const apiError = error as ApiError;

    // Handle 400 BadRequest (validation errors or already corrected)
    if (apiError.statusCode === 400) {
      // Check if it's the single-correction rule violation
      const message = apiError.message || "";
      if (
        message.includes("zaten düzeltilmiş") ||
        message.includes("already corrected")
      ) {
        throw new Error(
          apiError.message ||
            "Bu ödeme zaten düzeltilmiş. Bir ödeme yalnızca bir kez düzeltilebilir."
        );
      }
      throw new Error(
        apiError.message || "Ödeme düzeltilirken doğrulama hatası oluştu"
      );
    }

    // Handle 403 Forbidden (payment from different tenant)
    if (apiError.statusCode === 403) {
      throw new Error(apiError.message || "Bu ödeme farklı bir kiracıya ait");
    }

    // Handle 404 Not Found
    if (apiError.statusCode === 404) {
      throw new Error(apiError.message || "Ödeme bulunamadı");
    }

    // Handle 409 Conflict (version mismatch - concurrent correction)
    if (apiError.statusCode === 409) {
      throw new Error(
        apiError.message ||
          "Ödeme başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin."
      );
    }

    // Handle 429 Too Many Requests (rate limit)
    if (apiError.statusCode === 429) {
      throw new Error(
        apiError.message ||
          "Çok fazla istek gönderildi. Lütfen birkaç dakika sonra tekrar deneyin."
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Get revenue report with aggregation
 * GET /api/v1/revenue?startDate=...&endDate=...&branchId=...&paymentMethod=...&groupBy=...
 *
 * Error handling:
 * - 400: Invalid query parameters
 */
export async function getRevenueReport(
  query: RevenueReportQuery & { tenantId: string }
): Promise<RevenueReportResponse> {
  const { tenantId, ...queryParams } = query;
  const searchParams = new URLSearchParams();

  searchParams.append("startDate", queryParams.startDate);
  searchParams.append("endDate", queryParams.endDate);

  if (queryParams.branchId) {
    searchParams.append("branchId", queryParams.branchId);
  }
  if (queryParams.paymentMethod) {
    searchParams.append("paymentMethod", queryParams.paymentMethod);
  }
  if (queryParams.groupBy) {
    searchParams.append("groupBy", queryParams.groupBy);
  }

  const url = `/revenue?${searchParams.toString()}`;

  try {
    return await apiClient.get<RevenueReportResponse>(url, { tenantId });
  } catch (error) {
    const apiError = error as ApiError;

    // Handle 400 BadRequest (invalid query parameters)
    if (apiError.statusCode === 400) {
      throw new Error(apiError.message || "Geçersiz sorgu parametreleri");
    }

    // Re-throw other errors
    throw error;
  }
}
