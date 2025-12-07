import * as React from "react";
import {
  IconSettings,
  IconBuilding,
  IconHelp,
  IconLayoutDashboard,
} from "@tabler/icons-react";

import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { useAuth } from "@/features/auth/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();

  const navMain = [
    {
      title: "Panel",
      url: "/panel",
      icon: IconLayoutDashboard,
    },
    {
      title: "Genel Ayarlar",
      url: "/settings/tenant",
      icon: IconSettings,
    },
    {
      title: "Şubeler",
      url: "/settings/branches",
      icon: IconBuilding,
    },
  ];

  const navSecondary = [
    {
      title: "Yardım",
      url: "#",
      icon: IconHelp,
    },
  ];

  const userData = user
    ? {
        name: user.email.split("@")[0],
        email: user.email,
        avatar: "",
      }
    : {
        name: "Kullanıcı",
        email: "",
        avatar: "",
      };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5"
            >
              <a href="/">
                <IconBuilding className="size-5" />
                <span className="text-base font-semibold">Gym Admin</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}
