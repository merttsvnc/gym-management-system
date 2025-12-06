import { Settings, Building2 } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon?: React.ElementType;
};

export const settingsNav: NavItem[] = [
  {
    title: "Tenant Settings",
    href: "/settings/tenant",
    icon: Settings,
  },
  {
    title: "Branches",
    href: "/settings/branches",
    icon: Building2,
  },
];
