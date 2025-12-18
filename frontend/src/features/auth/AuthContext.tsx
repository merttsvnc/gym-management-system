import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
 * Safe localStorage access helpers
 */
function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(key);
    }
  } catch {
    console.warn("⚠️ localStorage access denied");
  }
  return null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(key, value);
    }
  } catch {
    console.warn("⚠️ localStorage access denied");
  }
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(key);
    }
  } catch {
    console.warn("⚠️ localStorage access denied");
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null
  );
  const [billingStatusUpdatedAt, setBillingStatusUpdatedAt] = useState<
    string | null
  >(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const navigate = useNavigate();

  // Fetch billing status from /auth/me endpoint
  const fetchBillingStatus = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await getCurrentUser();
      setBillingStatus(response.tenant.billingStatus);
      setBillingStatusUpdatedAt(response.tenant.billingStatusUpdatedAt);
    } catch (error) {
      console.error("Failed to fetch billing status:", error);
      // Don't clear auth on billing status fetch failure
      // Error handler will handle billing lock errors
    }
  }, [accessToken]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = getStorageItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const authData: AuthStorage = JSON.parse(stored);

        // Basic shape validation: ensure required fields exist
        if (!authData.user || !authData.accessToken || !authData.refreshToken) {
          throw new Error("Invalid auth data shape");
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

        // Also update the jwt_token for API client compatibility
        setStorageItem("jwt_token", authData.accessToken);
      } catch (error) {
        console.error(
          "Failed to restore auth session (corrupted data):",
          error
        );
        // Clear corrupted data and reset to logged-out state
        removeStorageItem(AUTH_STORAGE_KEY);
        removeStorageItem("jwt_token");
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        setBillingStatus(null);
        setBillingStatusUpdatedAt(null);
      }
    }
    setIsInitialized(true);
  }, []);

  // Fetch billing status on app boot (after auth is restored)
  useEffect(() => {
    if (isInitialized && accessToken && !billingStatus) {
      fetchBillingStatus();
    }
  }, [isInitialized, accessToken, billingStatus, fetchBillingStatus]);

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
          authData.billingStatusUpdatedAt = response.tenant.billingStatusUpdatedAt;
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

    window.addEventListener("auth:billing-status-changed", handleBillingStatusChanged);

    return () => {
      window.removeEventListener("auth:billing-status-changed", handleBillingStatusChanged);
    };
  }, [accessToken, refreshBillingStatus]);

  // OPTIONAL: Refresh billing status on window focus (every 5-10 minutes)
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

  const login = useCallback(async (email: string, password: string) => {
    const response: LoginResponse = await loginApi(email, password);

    // Update state
    setUser(response.user);
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
    setBillingStatus(response.tenant.billingStatus);

    // Persist to localStorage
    const authData: AuthStorage = {
      user: response.user,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      billingStatus: response.tenant.billingStatus,
    };
    setStorageItem(AUTH_STORAGE_KEY, JSON.stringify(authData));

    // Also update jwt_token for API client compatibility
    setStorageItem("jwt_token", response.accessToken);
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
    removeStorageItem("jwt_token");
    
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
