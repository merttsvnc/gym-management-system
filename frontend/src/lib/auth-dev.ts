/**
 * Development utility for generating test JWT tokens
 *
 * The backend JwtAuthGuard accepts base64-encoded JSON tokens for testing.
 * This utility helps generate valid test tokens.
 *
 * Usage:
 * 1. Get a tenantId from your database or create one via API
 * 2. Call generateDevToken() with the tenantId
 * 3. Store the token in gymms_auth: localStorage.setItem('gymms_auth', JSON.stringify({accessToken: token, ...}))
 *
 * Note: This utility is deprecated in favor of proper login flow.
 * Use the regular login API instead of dev tokens.
 */

export interface DevTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

/**
 * Generates a base64-encoded test token for development
 *
 * @param tenantId - The tenant ID to use (required)
 * @param userId - Optional user ID (defaults to 'dev-user-1')
 * @param email - Optional email (defaults to 'dev@example.com')
 * @param role - Optional role (defaults to 'ADMIN')
 * @returns Base64-encoded token string
 */
export function generateDevToken(
  tenantId: string,
  userId: string = "dev-user-1",
  email: string = "dev@example.com",
  role: string = "ADMIN"
): string {
  const payload: DevTokenPayload = {
    userId,
    tenantId,
    email,
    role,
  };

  // Encode as base64 JSON (as expected by backend JwtAuthGuard)
  const jsonString = JSON.stringify(payload);
  // Use browser-compatible base64 encoding
  // Convert UTF-8 string to bytes, then to base64
  if (typeof window !== "undefined" && window.btoa) {
    const bytes = new TextEncoder().encode(jsonString);
    const binaryString = String.fromCharCode(...bytes);
    return window.btoa(binaryString);
  }
  // This should never happen in browser environment
  throw new Error("Base64 encoding not available in this environment");
}

/**
 * Safe localStorage access helpers
 */
function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(key);
    }
  } catch {
    // localStorage access denied
    console.warn("⚠️ localStorage access denied");
  }
  return null;
}

function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(key, value);
      return true;
    }
  } catch {
    // localStorage access denied
    console.warn("⚠️ localStorage access denied");
  }
  return false;
}

/**
 * Initializes a dev token if one doesn't exist
 *
 * This will prompt the user to enter a tenantId if no token exists.
 * For automated testing, set VITE_DEV_TENANT_ID in your .env file.
 *
 * DEPRECATED: Use proper login flow instead of dev tokens.
 */
export function initDevToken(): void {
  if (typeof window === "undefined") return;

  // Check if auth data already exists
  if (safeGetItem("gymms_auth")) {
    return;
  }

  // Try to get tenantId from environment variable
  const envTenantId = import.meta.env.VITE_DEV_TENANT_ID;

  if (envTenantId) {
    const token = generateDevToken(envTenantId);
    // Store in gymms_auth format (single source of truth)
    const authData = {
      user: { id: "dev-user-1", email: "dev@example.com", role: "ADMIN" },
      accessToken: token,
      refreshToken: "dev-refresh-token",
    };
    if (safeSetItem("gymms_auth", JSON.stringify(authData))) {
      console.log("✅ Dev token initialized with tenantId:", envTenantId);
      console.log("🔑 Token (first 50 chars):", token.substring(0, 50) + "...");
    }
    return;
  }

  // Prompt user for tenantId (development only)
  if (import.meta.env.DEV) {
    const tenantId = prompt(
      "Enter a tenant ID for development (or cancel to skip):\n\n" +
        "You can find/create a tenant ID in your database.\n" +
        "Or set VITE_DEV_TENANT_ID in your .env file."
    );

    if (tenantId && tenantId.trim()) {
      const token = generateDevToken(tenantId.trim());
      // Store in gymms_auth format (single source of truth)
      const authData = {
        user: { id: "dev-user-1", email: "dev@example.com", role: "ADMIN" },
        accessToken: token,
        refreshToken: "dev-refresh-token",
      };
      if (safeSetItem("gymms_auth", JSON.stringify(authData))) {
        console.log("✅ Dev token initialized with tenantId:", tenantId.trim());
      }
    } else {
      console.warn(
        "⚠️ No dev token set. API requests will fail with 401 Unauthorized.\n" +
          "Set VITE_DEV_TENANT_ID in your .env file or use proper login flow."
      );
    }
  }
}
