import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosError,
} from "axios";
import { toast } from "sonner";
import { toApiError } from "@/types/error";

/**
 * Base API client configuration
 */
const baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

/**
 * Creates and configures an Axios instance
 */
const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Safe localStorage access helper
 */
function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(key);
    }
  } catch {
    // localStorage access denied (incognito mode, iframe restrictions, etc.)
    console.warn("⚠️ localStorage access denied. Using fallback.");
  }
  return null;
}

/**
 * Request interceptor: Adds Authorization header if token exists
 * Reads JWT token from localStorage (set via dev token utility or auth flow)
 */
axiosInstance.interceptors.request.use((config) => {
  const token = getStorageItem("jwt_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (import.meta.env.DEV) {
    console.warn(
      '⚠️ No JWT token found. API requests may fail. Check localStorage for "jwt_token"'
    );
  }
  return config;
});

/**
 * Response interceptor: Handles errors globally
 * - Centralized 401 handling: auto-logout and redirect
 * - Show toast notifications for non-401 errors
 * - Convert AxiosError to ApiError
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Convert AxiosError to ApiError
    const apiError = toApiError(error);

    // Centralized 401 handling: logout and redirect
    if (error.response?.status === 401) {
      // Clear auth tokens
      try {
        localStorage.removeItem("gymms_auth");
        localStorage.removeItem("jwt_token");
      } catch {
        console.warn("⚠️ Could not clear auth tokens from localStorage");
      }

      // Dispatch custom event for components listening
      window.dispatchEvent(new Event("auth:logout"));

      // Redirect to login
      window.location.href = "/login";
      // Don't show toast for 401 errors as user is being redirected
    } else if (!apiError.skipGlobalToast) {
      // Show toast for non-401 errors (including network errors)
      // Skip if error handler has already shown a toast
      const message = apiError.message || "";
      
      // For 400 errors with member-related messages, skip global toast
      // Let the hook's onError handler show the specific Turkish message
      const isMemberRelatedError =
        apiError.statusCode === 400 &&
        (message.toLowerCase().includes("üye") ||
          message.toLowerCase().includes("member"));
      
      if (!isMemberRelatedError) {
        toast.error("İşlem sırasında bir hata oluştu", {
          description: message || "Beklenmeyen bir hata oluştu",
        });
      }
      // For member-related errors, skip toast here - hook will show specific message
    }

    // Rethrow ApiError
    return Promise.reject(apiError);
  }
);

/**
 * Typed API client wrapper with helper methods
 */
export const apiClient = {
  /**
   * GET request
   */
  get: <T = unknown>(
    url: string,
    config?: AxiosRequestConfig & { tenantId?: string }
  ): Promise<T> => {
    const headers: Record<string, string> = {};
    if (config?.tenantId) {
      headers["X-Tenant-Id"] = config.tenantId;
    }
    return axiosInstance
      .get<T>(url, { ...config, headers: { ...config?.headers, ...headers } })
      .then((response) => response.data);
  },

  /**
   * POST request
   */
  post: <T = unknown, B = unknown>(
    url: string,
    body?: B,
    config?: AxiosRequestConfig & { tenantId?: string }
  ): Promise<T> => {
    const headers: Record<string, string> = {};
    if (config?.tenantId) {
      headers["X-Tenant-Id"] = config.tenantId;
    }
    return axiosInstance
      .post<T>(url, body, {
        ...config,
        headers: { ...config?.headers, ...headers },
      })
      .then((response) => response.data);
  },

  /**
   * PATCH request
   */
  patch: <T = unknown, B = unknown>(
    url: string,
    body?: B,
    config?: AxiosRequestConfig & { tenantId?: string }
  ): Promise<T> => {
    const headers: Record<string, string> = {};
    if (config?.tenantId) {
      headers["X-Tenant-Id"] = config.tenantId;
    }
    return axiosInstance
      .patch<T>(url, body, {
        ...config,
        headers: { ...config?.headers, ...headers },
      })
      .then((response) => response.data);
  },

  /**
   * DELETE request
   */
  del: <T = unknown>(
    url: string,
    config?: AxiosRequestConfig & { tenantId?: string }
  ): Promise<T> => {
    const headers: Record<string, string> = {};
    if (config?.tenantId) {
      headers["X-Tenant-Id"] = config.tenantId;
    }
    return axiosInstance
      .delete<T>(url, {
        ...config,
        headers: { ...config?.headers, ...headers },
      })
      .then((response) => response.data);
  },
};
