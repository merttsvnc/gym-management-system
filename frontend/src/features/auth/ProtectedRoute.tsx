import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute component that redirects to /login if user is not authenticated
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
