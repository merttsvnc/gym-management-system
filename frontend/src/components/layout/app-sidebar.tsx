import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { settingsNav } from "@/config/nav";
import { Dumbbell } from "lucide-react";

export function AppSidebar({ className }: { className?: string }) {
  const location = useLocation();

  return (
    <aside className={cn("flex flex-col h-full border-r bg-card", className)}>
      <div className="h-14 flex items-center px-6 border-b">
        <Dumbbell className="h-6 w-6 mr-2" />
        <span className="font-bold text-lg">Gym Admin</span>
      </div>
      <div className="flex-1 py-4">
        <nav className="grid gap-1 px-2">
          {settingsNav.map((item, index) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <NavLink
                key={index}
                to={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:text-primary",
                  isActive
                    ? "bg-muted text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {item.title}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
