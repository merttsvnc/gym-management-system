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
  role: string = "ADMIN",
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
 * Safe storage access helpers with sessionStorage fallback
 * In incognito/private mode, localStorage often fails but sessionStorage works
 */
function safeGetItem(key: string): string | null {
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

function safeSetItem(key: string, value: string): boolean {
  // Try localStorage first
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(key, value);
      return true;
    }
  } catch {
    console.warn("⚠️ localStorage access denied, trying sessionStorage");
  }

  // Fallback to sessionStorage (works better in incognito mode)
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(key, value);
      console.log(
        "✅ Using sessionStorage as fallback (incognito mode detected)",
      );
      return true;
    }
  } catch {
    console.error("⚠️ Both localStorage and sessionStorage denied");
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
      user: {
        id: "dev-user-1",
        email: "dev@example.com",
        role: "ADMIN",
        tenantId: envTenantId, // Required field for auth validation
      },
      accessToken: token,
      refreshToken: "dev-refresh-token",
    };
    safeSetItem("gymms_auth", JSON.stringify(authData));
    return;
  }

  // Prompt user for tenantId (development only)
  if (import.meta.env.DEV) {
    const tenantId = prompt(
      "Enter a tenant ID for development (or cancel to skip):\n\n" +
        "You can find/create a tenant ID in your database.\n" +
        "Or set VITE_DEV_TENANT_ID in your .env file.",
    );

    if (tenantId && tenantId.trim()) {
      const trimmedTenantId = tenantId.trim();
      const token = generateDevToken(trimmedTenantId);
      // Store in gymms_auth format (single source of truth)
      const authData = {
        user: {
          id: "dev-user-1",
          email: "dev@example.com",
          role: "ADMIN",
          tenantId: trimmedTenantId, // Required field for auth validation
        },
        accessToken: token,
        refreshToken: "dev-refresh-token",
      };
      safeSetItem("gymms_auth", JSON.stringify(authData));
    } else {
      console.warn(
        "⚠️ No dev token set. API requests will fail with 401 Unauthorized.\n" +
          "Set VITE_DEV_TENANT_ID in your .env file or use proper login flow.",
      );
    }
  }
}
