import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, X, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsNav } from "@/config/nav";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [location.pathname]);

  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 animate-in fade-in-0"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 h-full w-3/4 max-w-xs bg-background p-6 shadow-lg transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Dumbbell className="h-6 w-6" />
            <span>Gym Admin</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close menu</span>
          </Button>
        </div>

        <nav className="grid gap-2">
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
    </>
  );
}
