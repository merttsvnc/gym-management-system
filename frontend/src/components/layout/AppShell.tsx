import { NavLink, Outlet } from "react-router-dom"
import { cn } from "@/lib/utils"

interface AppShellProps {
  children?: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen bg-slate-950 text-slate-50">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-semibold">Gym Admin</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink
            to="/settings/tenant"
            className={(props: { isActive: boolean }) =>
              cn(
                "block px-4 py-2 rounded-md text-sm font-medium transition-colors",
                props.isActive
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )
            }
          >
            Tenant Settings
          </NavLink>
          <NavLink
            to="/settings/branches"
            className={(props: { isActive: boolean }) =>
              cn(
                "block px-4 py-2 rounded-md text-sm font-medium transition-colors",
                props.isActive
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )
            }
          >
            Branches
          </NavLink>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
          <h2 className="text-lg font-semibold">Settings</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  )
}

