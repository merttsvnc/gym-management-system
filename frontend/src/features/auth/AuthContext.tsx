import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { AuthUser, LoginResponse } from "./types";
import type { BillingStatus } from "@/types/billing";
import { login as loginApi, getCurrentUser } from "./api";
import { AuthContext, type AuthContextType } from "./context";
import { queryClient } from "@/lib/query-client";

const AUTH_STORAGE_KEY = "gymms_auth";

interface AuthStorage {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  billingStatus?: BillingStatus;
  billingStatusUpdatedAt?: string | null;
}

/**
 * Safe storage access helpers with sessionStorage fallback
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
    console.warn("⚠️ localStorage access denied");
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

function setStorageItem(key: string, value: string): void {
  // Try localStorage first
  let stored = false;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(key, value);
      stored = true;
    }
  } catch {
    console.warn("⚠️ localStorage access denied, trying sessionStorage");
  }

  // Fallback to sessionStorage (works better in incognito mode)
  if (!stored) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.setItem(key, value);
        if (import.meta.env.DEV) {
          console.log("✅ Using sessionStorage as fallback (incognito mode)");
        }
      }
    } catch {
      console.warn("⚠️ Both localStorage and sessionStorage denied");
    }
  }
}

function removeStorageItem(key: string): void {
  // Clear from both localStorage and sessionStorage
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(key);
    }
  } catch {
    console.warn("⚠️ localStorage access denied");
  }

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.removeItem(key);
    }
  } catch {
    console.warn("⚠️ sessionStorage access denied");
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null,
  );
  const [billingStatusUpdatedAt, setBillingStatusUpdatedAt] = useState<
    string | null
  >(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch billing status from /auth/me endpoint
  const fetchBillingStatus = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await getCurrentUser();
      setBillingStatus(response.tenant.billingStatus);
      setBillingStatusUpdatedAt(response.tenant.billingStatusUpdatedAt);
    } catch (error: unknown) {
      // If 401 (token invalid/expired), silently clear state
      // This is expected after logout or token expiration
      // The axios interceptor will handle redirect, we just need to clear state
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        (error as { statusCode: number }).statusCode === 401
      ) {
        // Silently clear state - 401 is expected after logout
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        setBillingStatus(null);
        setBillingStatusUpdatedAt(null);
        return;
      }

      // Log other errors (403, 500, network errors) for debugging
      console.error("Failed to fetch billing status:", error);
      // Other errors (403, 500) are handled by error handlers
    }
  }, [accessToken]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = getStorageItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const authData: AuthStorage = JSON.parse(stored);

        // Comprehensive validation: ensure required fields exist and have correct types
        if (!authData.user || typeof authData.user !== "object") {
          throw new Error(
            "Invalid auth data shape: user is missing or invalid",
          );
        }

        if (!authData.user.id || typeof authData.user.id !== "string") {
          throw new Error(
            "Invalid auth data shape: user.id is missing or invalid",
          );
        }

        if (!authData.user.email || typeof authData.user.email !== "string") {
          throw new Error(
            "Invalid auth data shape: user.email is missing or invalid",
          );
        }

        if (
          !authData.user.tenantId ||
          typeof authData.user.tenantId !== "string"
        ) {
          throw new Error(
            "Invalid auth data shape: user.tenantId is missing or invalid",
          );
        }

        if (
          !authData.accessToken ||
          typeof authData.accessToken !== "string" ||
          authData.accessToken.trim() === ""
        ) {
          throw new Error(
            "Invalid auth data shape: accessToken is missing or invalid",
          );
        }

        // refreshToken is optional - validate only if present
        if (
          authData.refreshToken !== undefined &&
          (typeof authData.refreshToken !== "string" ||
            authData.refreshToken.trim() === "")
        ) {
          throw new Error("Invalid auth data shape: refreshToken is invalid");
        }

        setUser(authData.user);
        setAccessToken(authData.accessToken);
        setRefreshToken(authData.refreshToken);

        // Restore billing status if available
        if (authData.billingStatus) {
          setBillingStatus(authData.billingStatus);
        }
        if (authData.billingStatusUpdatedAt !== undefined) {
          setBillingStatusUpdatedAt(authData.billingStatusUpdatedAt);
        }
      } catch (error) {
        console.error(
          "Failed to restore auth session (corrupted data):",
          error,
        );
        console.error("Stored data that failed validation:", stored);
        // Clear corrupted data and reset to logged-out state
        removeStorageItem(AUTH_STORAGE_KEY);
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        setBillingStatus(null);
        setBillingStatusUpdatedAt(null);
      }
    }
    setIsInitialized(true);
  }, []);

  // Listen for auth:logout event from axios interceptor
  useEffect(() => {
    const handleLogout = () => {
      // Clear state when axios interceptor detects 401 and clears localStorage
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      setBillingStatus(null);
      setBillingStatusUpdatedAt(null);
    };

    window.addEventListener("auth:logout", handleLogout);

    return () => {
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, []);

  // Fetch billing status on app boot (after auth is restored)
  // Skip if on login/signup pages to avoid unnecessary 401 errors
  useEffect(() => {
    const isAuthPage =
      location.pathname === "/login" ||
      location.pathname === "/signup" ||
      location.pathname.startsWith("/signup/");

    if (isInitialized && accessToken && !billingStatus && !isAuthPage) {
      fetchBillingStatus();
    }
  }, [
    isInitialized,
    accessToken,
    billingStatus,
    fetchBillingStatus,
    location.pathname,
  ]);

  // Refresh billing status (called on app boot, after login, optionally on focus/interval)
  const refreshBillingStatus = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await getCurrentUser();
      setBillingStatus(response.tenant.billingStatus);
      setBillingStatusUpdatedAt(response.tenant.billingStatusUpdatedAt);

      // Update localStorage
      const stored = getStorageItem(AUTH_STORAGE_KEY);
      if (stored) {
        try {
          const authData: AuthStorage = JSON.parse(stored);
          authData.billingStatus = response.tenant.billingStatus;
          authData.billingStatusUpdatedAt =
            response.tenant.billingStatusUpdatedAt;
          setStorageItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
        } catch {
          // Ignore localStorage update errors
        }
      }
    } catch (error) {
      console.error("Failed to refresh billing status:", error);
      // Error handler will handle billing lock errors
    }
  }, [accessToken]);

  // Listen for billing status change events (from error handler)
  useEffect(() => {
    const handleBillingStatusChanged = () => {
      // Refresh billing status when error handler detects mid-session change
      if (accessToken) {
        refreshBillingStatus();
      }
    };

    window.addEventListener(
      "auth:billing-status-changed",
      handleBillingStatusChanged,
    );

    return () => {
      window.removeEventListener(
        "auth:billing-status-changed",
        handleBillingStatusChanged,
      );
    };
  }, [accessToken, refreshBillingStatus]);

  // OPTIONAL: Refresh billing status on window focus (every 5-10 minutes)
  // DISABLED: This was causing infinite loops when token expired
  // The billing status is already refreshed on login and via error handlers
  // Re-enable only if needed, with proper error handling
  /*
  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let intervalId: number | null = null;

    const handleFocus = () => {
      // Refresh billing status when window regains focus
      refreshBillingStatus();
    };

    // Refresh on window focus
    window.addEventListener("focus", handleFocus);

    // OPTIONAL: Also refresh on interval (every 10 minutes)
    intervalId = window.setInterval(() => {
      refreshBillingStatus();
    }, 10 * 60 * 1000); // 10 minutes

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [accessToken, refreshBillingStatus]);
  */

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response: LoginResponse = await loginApi(email, password);

      // Log response for debugging (without sensitive data)
      console.log("Login response received:", {
        hasUser: !!response.user,
        hasAccessToken: !!response.accessToken,
        hasRefreshToken: !!response.refreshToken,
        hasTenant: !!response.tenant,
        userFields: response.user ? Object.keys(response.user) : [],
      });

      // Validate response before saving
      // Note: refreshToken is optional as backend may not return it
      if (!response.user || !response.accessToken) {
        console.error("Invalid login response - missing required fields:", {
          hasUser: !!response.user,
          hasAccessToken: !!response.accessToken,
          hasRefreshToken: !!response.refreshToken,
        });
        throw new Error("Invalid login response: missing required fields");
      }

      if (
        !response.user.id ||
        !response.user.email ||
        !response.user.tenantId
      ) {
        console.error("Invalid login response - user object incomplete:", {
          hasId: !!response.user.id,
          hasEmail: !!response.user.email,
          hasTenantId: !!response.user.tenantId,
          user: response.user,
        });
        throw new Error("Invalid login response: user object is incomplete");
      }

      // Update state
      setUser(response.user);
      setAccessToken(response.accessToken);
      // Use refreshToken if provided, otherwise use placeholder (backend doesn't currently return refresh tokens)
      const refreshTokenValue = response.refreshToken || "no-refresh-token";
      setRefreshToken(refreshTokenValue);
      setBillingStatus(response.tenant.billingStatus);

      // Persist to localStorage
      const authData: AuthStorage = {
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: refreshTokenValue,
        billingStatus: response.tenant.billingStatus,
        // billingStatusUpdatedAt is not available in LoginResponse, will be fetched later
      };
      setStorageItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    } catch (error) {
      console.error("Login function error:", error);
      // Re-throw to let LoginPage handle the error
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    // Clear state
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setBillingStatus(null);
    setBillingStatusUpdatedAt(null);

    // Clear localStorage
    removeStorageItem(AUTH_STORAGE_KEY);

    // Set flag to prevent dev token auto-creation after explicit logout
    // This flag is cleared after checking in main.tsx
    if (import.meta.env.DEV) {
      try {
        if (typeof window !== "undefined" && window.sessionStorage) {
          sessionStorage.setItem("explicit_logout", "true");
        }
      } catch {
        // Ignore sessionStorage errors
      }
    }

    // Invalidate React Query cache (including billing status cache)
    queryClient.invalidateQueries();
    queryClient.clear();

    // Navigate to login
    navigate("/login");
  }, [navigate]);

  const value: AuthContextType = {
    user,
    accessToken,
    refreshToken,
    billingStatus,
    billingStatusUpdatedAt,
    isAuthenticated: !!user && !!accessToken,
    login,
    logout,
    refreshBillingStatus,
  };

  // Don't render children until we've checked localStorage
  if (!isInitialized) {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
