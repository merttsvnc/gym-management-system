import { Routes, Route, Navigate } from "react-router-dom"
import { AppShell } from "./components/layout/AppShell"
import { TenantSettingsPage } from "./pages/TenantSettingsPage"
import { BranchesPage } from "./pages/BranchesPage"
import { LoginPage } from "./pages/LoginPage"
import { ProtectedRoute } from "./features/auth/ProtectedRoute"

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/settings/tenant" element={<TenantSettingsPage />} />
        <Route path="/settings/branches" element={<BranchesPage />} />
        <Route path="/" element={<Navigate to="/settings/tenant" replace />} />
      </Route>
    </Routes>
  )
}

export default App
