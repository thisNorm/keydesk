import { ActivityIcon, Blocks, BookCheck, FileText, Settings, Shield } from "lucide-react";

import { ProjectIcon, SidebarCollapsibleGroup } from "@app/components/v3";

import { ProjectNavList } from "./ProjectNavLink";
import { SM_SETTINGS_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";
import { useApprovalSubmenu } from "./useApprovalSubmenu";

export const SecretManagerNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { pendingRequestsCount } = useApprovalSubmenu();

  const generalItems: NavItem[] = [
    {
      label: "시크릿",
      icon: ProjectIcon,
      pathSuffix: "overview",
      activeMatch: /\/secrets\//
    },
    {
      label: "접근 권한",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//
    },
    {
      label: "연동",
      icon: Blocks,
      pathSuffix: "integrations",
      // Keep highlighted on integration detail pages and the standalone app-connections page
      activeMatch: /\/app-connections|\/integrations\//
    },
    {
      label: "Insights",
      icon: ActivityIcon,
      pathSuffix: "insights"
    },
    {
      label: "Approvals",
      icon: BookCheck,
      pathSuffix: "approval",
      badgeCount: pendingRequestsCount || undefined
    }
  ];

  const administrationItems: NavItem[] = [
    { label: "감사 로그", icon: FileText, pathSuffix: "audit-logs" },
    { label: "설정", icon: Settings, pathSuffix: "settings", submenu: SM_SETTINGS_SUBMENU }
  ];

  return (
    <>
      <ProjectNavList items={generalItems} onSubmenuOpen={onSubmenuOpen} />
      <SidebarCollapsibleGroup label="관리">
        <ProjectNavList items={administrationItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
