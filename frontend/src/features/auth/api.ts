import axios from "axios";
import type { AuthResponse } from "./types";

/**
 * Base URL for auth endpoints (auth controller doesn't use /api/v1 prefix)
 */
const authBaseURL =
  import.meta.env.VITE_API_BASE_URL?.replace("/api/v1", "") ||
  "http://localhost:3000";

/**
 * Login API function
 * POST to /auth/login with email and password
 * Note: Auth endpoint is at /auth/login (not /api/v1/auth/login)
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  try {
    const response = await axios.post<AuthResponse>(
      `${authBaseURL}/auth/login`,
      { email, password },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error: unknown) {
    // Handle API errors and throw friendly messages
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error("Invalid email or password");
      }
      const message =
        error.response?.data?.message || error.message || "Failed to sign in";
      throw new Error(message);
    }
    throw new Error("Failed to sign in. Please try again.");
  }
}

