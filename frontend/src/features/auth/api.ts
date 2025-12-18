import axios from "axios";
import type { LoginResponse, AuthMeResponse } from "@/types/billing";
import { apiClient } from "@/api/client";

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
    // Handle API errors - throw stable error codes, not backend messages
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // Stable error code for invalid credentials
        throw new Error("INVALID_CREDENTIALS");
      }
      // Generic error for other failures (network, 5xx, etc.)
      throw new Error("LOGIN_FAILED");
    }
    // Catch-all for non-Axios errors
    throw new Error("LOGIN_FAILED");
  }
}

/**
 * Get current user information including billing status
 * GET /api/v1/auth/me
 */
export async function getCurrentUser(): Promise<AuthMeResponse> {
  return apiClient.get<AuthMeResponse>("/auth/me");
}
