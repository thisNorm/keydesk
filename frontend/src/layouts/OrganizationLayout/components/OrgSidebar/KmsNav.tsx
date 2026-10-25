import { FileText, Key, LayoutDashboard, Settings, Shield } from "lucide-react";

import { ProjectNavList } from "./ProjectNavLink";
import { PROJECT_ACCESS_CONTROL_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

export const KmsNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const items: NavItem[] = [
    { label: "개요", icon: LayoutDashboard, pathSuffix: "overview" },
    { label: "KMIP", icon: Key, pathSuffix: "kmip" },
    {
      label: "접근 권한",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: PROJECT_ACCESS_CONTROL_SUBMENU
    },
    { label: "감사 로그", icon: FileText, pathSuffix: "audit-logs" },
    { label: "설정", icon: Settings, pathSuffix: "settings" }
  ];
  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
