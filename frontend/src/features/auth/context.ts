import { createContext } from "react";
import type { AuthUser } from "./types";
import type { BillingStatus } from "@/types/billing";

export interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  billingStatus: BillingStatus | null;
  billingStatusUpdatedAt: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshBillingStatus: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
