import { Routes, Route, Navigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { PanelPage } from "./pages/PanelPage";
import { TenantSettingsPage } from "./pages/TenantSettingsPage";
import { BranchesPage } from "./pages/BranchesPage";
import { MembersPage } from "./pages/MembersPage";
import { CreateMemberPage } from "./pages/CreateMemberPage";
import { MemberDetailPage } from "./pages/MemberDetailPage";
import { EditMemberPage } from "./pages/EditMemberPage";
import { MembershipPlansPage } from "./pages/MembershipPlansPage";
import { CreatePlanPage } from "./pages/CreatePlanPage";
import { EditPlanPage } from "./pages/EditPlanPage";
import { LoginPage } from "./pages/LoginPage";
import { BillingLockedPage } from "./pages/BillingLockedPage";
import { RevenuePage } from "./pages/RevenuePage";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { BillingStatusGuard } from "./features/auth/BillingStatusGuard";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/billing-locked" element={<BillingLockedPage />} />
        <Route
          element={
            <ProtectedRoute>
              <BillingStatusGuard>
                <AppLayout>
                  <Outlet />
                </AppLayout>
              </BillingStatusGuard>
            </ProtectedRoute>
          }
        >
          <Route path="/panel" element={<PanelPage />} />
          <Route path="/dashboard" element={<Navigate to="/panel" replace />} />
          <Route path="/settings/tenant" element={<TenantSettingsPage />} />
          <Route path="/settings/branches" element={<BranchesPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/members/new" element={<CreateMemberPage />} />
          <Route path="/members/:id" element={<MemberDetailPage />} />
          <Route path="/members/:id/edit" element={<EditMemberPage />} />
          <Route path="/membership-plans" element={<MembershipPlansPage />} />
          <Route path="/membership-plans/new" element={<CreatePlanPage />} />
          <Route path="/membership-plans/:id/edit" element={<EditPlanPage />} />
          <Route path="/revenue" element={<RevenuePage />} />
          <Route path="/" element={<Navigate to="/panel" replace />} />
        </Route>
      </Routes>
      <Toaster richColors />
    </>
  );
}

export default App;
