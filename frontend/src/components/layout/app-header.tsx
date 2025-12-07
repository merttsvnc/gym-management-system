import { MobileNav } from "./mobile-nav";
import { User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";

export function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
      <MobileNav />
      <div className="flex-1">
        <h1 className="text-lg font-semibold md:hidden">Gym Admin</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{user?.email}</span>
          <span className="hidden sm:inline text-muted-foreground/60">•</span>
          <span className="hidden sm:inline">Admin</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
          <span className="sr-only">Logout</span>
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="sr-only">User menu</span>
        </Button>
      </div>
    </header>
  );
}
