import { Routes, Route, Navigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { PanelPage } from "./pages/PanelPage";
import { TenantSettingsPage } from "./pages/TenantSettingsPage";
import { BranchesPage } from "./pages/BranchesPage";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout>
              <Outlet />
            </AppLayout>
          </ProtectedRoute>
        }
      >
        <Route path="/panel" element={<PanelPage />} />
        <Route path="/settings/tenant" element={<TenantSettingsPage />} />
        <Route path="/settings/branches" element={<BranchesPage />} />
        <Route path="/" element={<Navigate to="/panel" replace />} />
      </Route>
    </Routes>
    <Toaster richColors />
    </>
  );
}

export default App;
