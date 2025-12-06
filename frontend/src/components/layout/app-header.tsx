import { MobileNav } from "./mobile-nav";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
      <MobileNav />
      <div className="flex-1">
        <h1 className="text-lg font-semibold md:hidden">Gym Admin</h1>
      </div>
      <div className="flex items-center gap-4">
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
