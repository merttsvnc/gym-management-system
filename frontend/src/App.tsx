import { Routes, Route, Navigate } from "react-router-dom"
import { AppShell } from "./components/layout/AppShell"
import { TenantSettingsPage } from "./pages/TenantSettingsPage"
import { BranchesPage } from "./pages/BranchesPage"

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/settings/tenant" element={<TenantSettingsPage />} />
        <Route path="/settings/branches" element={<BranchesPage />} />
        <Route path="/" element={<Navigate to="/settings/tenant" replace />} />
      </Routes>
    </AppShell>
  )
}

export default App
