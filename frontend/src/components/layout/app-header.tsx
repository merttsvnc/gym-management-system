import { MobileNav } from "./mobile-nav";

export function AppHeader() {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
      <MobileNav />
      <div className="flex-1">
        <h1 className="text-lg font-semibold md:hidden">Gym Admin</h1>
      </div>
      <div className="flex items-center gap-4">
        {/* Placeholder for user menu or other header items */}
        <div className="h-8 w-8 rounded-full bg-muted" />
      </div>
    </header>
  );
}
