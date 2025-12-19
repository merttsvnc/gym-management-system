import axios from "axios";
import type { LoginResponse, AuthMeResponse } from "@/types/billing";
import { apiClient } from "@/api/client";
import { toApiError } from "@/types/error";

/**
 * Base URL for API endpoints
 */
const apiBaseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

/**
 * Login API function
 * POST to /api/v1/auth/login with email and password
 *
 * Returns LoginResponse with billing status included
 * Throws ApiError preserving statusCode and code from backend
 */
export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  try {
    const response = await axios.post<LoginResponse>(
      `${apiBaseURL}/auth/login`,
      { email, password },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error: unknown) {
    // Preserve all error details (statusCode, code, etc.) using toApiError
    // This ensures UI can make deterministic decisions based on backend response
    throw toApiError(error);
  }
}

/**
 * Get current user information including billing status
 * GET /api/v1/auth/me
 */
export async function getCurrentUser(): Promise<AuthMeResponse> {
  return apiClient.get<AuthMeResponse>("/auth/me");
}
