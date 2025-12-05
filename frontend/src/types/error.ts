/**
 * Shared API error type for consistent error handling across the application
 */
export type ApiError = {
  statusCode: number;
  message: string;
  error?: string; // short code or title if backend returns it
  details?: unknown;
};

/**
 * Converts an Axios error to ApiError format
 */
export function toApiError(error: unknown): ApiError {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as {
      response?: {
        status: number;
        data?: {
          statusCode?: number;
          message?: string;
          error?: string;
          details?: unknown;
        };
      };
      message?: string;
    };

    if (axiosError.response?.data) {
      return {
        statusCode: axiosError.response.data.statusCode ?? axiosError.response.status,
        message: axiosError.response.data.message ?? axiosError.message ?? 'An error occurred',
        error: axiosError.response.data.error,
        details: axiosError.response.data.details,
      };
    }

    return {
      statusCode: axiosError.response?.status ?? 500,
      message: axiosError.message ?? 'An error occurred',
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
    message: 'An unexpected error occurred',
  };
}


