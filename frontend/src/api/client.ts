import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosError } from 'axios';
import { toApiError } from '@/types/error';

/**
 * Base API client configuration
 */
const baseURL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

/**
 * Creates and configures an Axios instance
 */
const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Adds Authorization header if token exists
 * Placeholder for future JWT auth implementation
 */
axiosInstance.interceptors.request.use((config) => {
  // TODO: Implement JWT auth when ready
  // For now, read from localStorage as placeholder
  const token = localStorage.getItem('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor: Handles errors globally
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Convert AxiosError to ApiError and rethrow
    const apiError = toApiError(error);
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
      headers['X-Tenant-Id'] = config.tenantId;
    }
    return axiosInstance
      .get<T>(url, { ...config, headers: { ...config?.headers, ...headers } })
      .then((response) => response.data)
      .catch((error) => {
        throw toApiError(error);
      });
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
      headers['X-Tenant-Id'] = config.tenantId;
    }
    return axiosInstance
      .post<T>(url, body, { ...config, headers: { ...config?.headers, ...headers } })
      .then((response) => response.data)
      .catch((error) => {
        throw toApiError(error);
      });
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
      headers['X-Tenant-Id'] = config.tenantId;
    }
    return axiosInstance
      .patch<T>(url, body, { ...config, headers: { ...config?.headers, ...headers } })
      .then((response) => response.data)
      .catch((error) => {
        throw toApiError(error);
      });
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
      headers['X-Tenant-Id'] = config.tenantId;
    }
    return axiosInstance
      .delete<T>(url, { ...config, headers: { ...config?.headers, ...headers } })
      .then((response) => response.data)
      .catch((error) => {
        throw toApiError(error);
      });
  },
};

