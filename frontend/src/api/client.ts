import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosError,
} from "axios";
import { toast } from "sonner";
import { toApiError } from "@/types/error";
import {
  handleBillingError,
  shouldSkipBillingToast,
} from "@/lib/api-error-handler";

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
 * Safe storage access helper with sessionStorage fallback
 * In incognito/private mode, localStorage often fails but sessionStorage works
 */
function getStorageItem(key: string): string | null {
  // Try localStorage first
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
  } catch {
    console.warn("⚠️ localStorage access denied, trying sessionStorage");
  }

  // Fallback to sessionStorage (works better in incognito mode)
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return sessionStorage.getItem(key);
    }
  } catch {
    console.warn("⚠️ sessionStorage also denied");
  }

  return null;
}

/**
 * Request interceptor: Adds Authorization header if token exists
 * Reads JWT token from localStorage gymms_auth (single source of truth)
 */
axiosInstance.interceptors.request.use((config) => {
  // Read token from gymms_auth (single source of truth)
  const authDataStr = getStorageItem("gymms_auth");
  if (authDataStr) {
    try {
      const authData = JSON.parse(authDataStr);
      const token = authData?.accessToken;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Invalid JSON in gymms_auth, ignore
      if (import.meta.env.DEV) {
        console.warn("⚠️ Invalid auth data in localStorage");
      }
    }
  } else if (import.meta.env.DEV) {
    console.warn(
      '⚠️ No auth data found. API requests may fail. Check localStorage for "gymms_auth"',
    );
  }
  return config;
});

/**
 * Response interceptor: Handles errors globally
 * - Centralized 401 handling: auto-logout and redirect
 * - Billing status error handling: detect via error code, redirect to /billing-locked
 * - Show toast notifications for non-401/non-billing errors
 * - Convert AxiosError to ApiError
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Convert AxiosError to ApiError
    const apiError = toApiError(error);

    // Centralized 401 handling: logout and redirect
    if (error.response?.status === 401) {
      // Clear auth tokens from both localStorage and sessionStorage
      try {
        localStorage.removeItem("gymms_auth");
      } catch {
        console.warn("⚠️ Could not clear auth tokens from localStorage");
      }

      try {
        sessionStorage.removeItem("gymms_auth");
      } catch {
        console.warn("⚠️ Could not clear auth tokens from sessionStorage");
      }

      // Dispatch custom event for components listening
      window.dispatchEvent(new Event("auth:logout"));

      // Redirect to login (only if not already on login page to prevent infinite loops)
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      // Don't show toast for 401 errors as user is being redirected
      // Return early to prevent toast notification
      return Promise.reject(apiError);
    } else if (error.response?.status === 403) {
      // Handle billing status errors (403 Forbidden)
      // Detection is done ONLY via structured error code in handleBillingError
      // No message text parsing - error code is authoritative
      // Pass both axios error (for direct response.data.code access) and apiError (for consistency)
      handleBillingError(apiError);
      return Promise.reject(apiError);
    }

    // Show toast for other errors (if not skipped)
    if (!apiError.skipGlobalToast && !shouldSkipBillingToast(apiError)) {
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
    }

    // Rethrow ApiError
    return Promise.reject(apiError);
  },
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
    config?: AxiosRequestConfig & { tenantId?: string },
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
    config?: AxiosRequestConfig & { tenantId?: string },
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
    config?: AxiosRequestConfig & { tenantId?: string },
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
    config?: AxiosRequestConfig & { tenantId?: string },
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
