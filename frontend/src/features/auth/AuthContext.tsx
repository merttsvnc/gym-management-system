import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import type { AuthUser, AuthResponse } from "./types";
import { login as loginApi } from "./api";

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "gymms_auth";

interface AuthStorage {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
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
  const [isInitialized, setIsInitialized] = useState(false);
  const navigate = useNavigate();

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
      }
    }
    setIsInitialized(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response: AuthResponse = await loginApi(email, password);

    // Update state
    setUser(response.user);
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);

    // Persist to localStorage
    const authData: AuthStorage = {
      user: response.user,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    };
    setStorageItem(AUTH_STORAGE_KEY, JSON.stringify(authData));

    // Also update jwt_token for API client compatibility
    setStorageItem("jwt_token", response.accessToken);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    removeStorageItem(AUTH_STORAGE_KEY);
    removeStorageItem("jwt_token");
    navigate("/login");
  }, [navigate]);

  const value: AuthContextType = {
    user,
    accessToken,
    refreshToken,
    isAuthenticated: !!user && !!accessToken,
    login,
    logout,
  };

  // Don't render children until we've checked localStorage
  if (!isInitialized) {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
