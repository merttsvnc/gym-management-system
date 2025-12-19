/**
 * Shared API error type for consistent error handling across the application
 */
export type ApiError = {
  statusCode: number;
  message: string;
  error?: string; // short code or title if backend returns it
  code?: string; // Structured error code (e.g., "TENANT_BILLING_LOCKED")
  details?: unknown;
  skipGlobalToast?: boolean; // If true, global error handler will skip showing toast
};

/**
 * Converts an Axios error to ApiError format
 */
export function toApiError(error: unknown): ApiError {
  // If already an ApiError, return as-is (prevent double parsing)
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    "message" in error &&
    !("response" in error)
  ) {
    return error as ApiError;
  }

  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as {
      response?: {
        status: number;
        data?: {
          statusCode?: number;
          message?: string;
          error?: string;
          code?: string; // Structured error code
          details?: unknown;
        };
      };
      message?: string;
    };

    if (axiosError.response?.data) {
      let message =
        axiosError.response.data.message ??
        axiosError.message ??
        "An error occurred";

      // Handle validation errors that come as an array of messages
      if (Array.isArray(message)) {
        message = message.join(". ");
      }

      return {
        statusCode:
          axiosError.response.data.statusCode ?? axiosError.response.status,
        message,
        error: axiosError.response.data.error,
        code: axiosError.response.data.code, // Extract structured error code
        details: axiosError.response.data.details,
      };
    }

    return {
      statusCode: axiosError.response?.status ?? 500,
      message: axiosError.message ?? "An error occurred",
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      message: error.message,
    };
  }

  return {
    statusCode: 500,
    message: "An unexpected error occurred",
  };
}
