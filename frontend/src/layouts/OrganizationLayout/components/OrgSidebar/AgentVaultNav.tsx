import { Braces, FileText, IdCard, Info, Package, Server, Settings, Shield } from "lucide-react";

import { useAgentVaultIntro } from "@app/components/agent-vault/AgentVaultIntro";
import {
  SidebarCollapsibleGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import { useProjectPermission, useSubscription } from "@app/context";
import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";
import {
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const AgentVaultNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { hasProjectRole } = useProjectPermission();
  const { setOpen: setIsIntroOpen } = useAgentVaultIntro();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  const { data: sessionLogState } = useGetAgentVaultSessionLogSettings(isAdmin);
  const sessionLogSettings = sessionLogState?.settings ?? null;
  const { data: sessionLogHealth } = useGetAgentVaultSessionLogHealth(isAdmin);
  const { subscription } = useSubscription();

  const accessItems: NavItem[] = [
    { label: "세션", icon: IdCard, pathSuffix: "sessions" },
    { label: "Access Bundles", icon: Package, pathSuffix: "access-bundles" },
    { label: "Variables", icon: Braces, pathSuffix: "variables", hidden: !isAdmin }
  ];

  const infrastructureItems: NavItem[] = [
    { label: "Proxies", icon: Server, pathSuffix: "proxies" }
  ];

  let settingsAlert: NavItem["alertVariant"];
  if (sessionLogHealth?.connectionError) settingsAlert = "danger";
  else if (
    (sessionLogSettings && !sessionLogSettings.enabled) ||
    isAgentVaultSessionLogBlockedByPlan(sessionLogSettings, subscription)
  )
    settingsAlert = "warning";

  const administrationItems: NavItem[] = isAdmin
    ? [
        {
          label: "접근 권한",
          icon: Shield,
          pathSuffix: "access-management",
          activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
        },
        { label: "감사 로그", icon: FileText, pathSuffix: "audit-logs" },
        { label: "설정", icon: Settings, pathSuffix: "settings", alertVariant: settingsAlert }
      ]
    : [];

  return (
    <>
      <ProjectNavList items={accessItems} onSubmenuOpen={onSubmenuOpen} />
      <SidebarCollapsibleGroup label="Infrastructure">
        <ProjectNavList items={infrastructureItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      {administrationItems.length > 0 && (
        <SidebarCollapsibleGroup label="관리">
          <ProjectNavList items={administrationItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
      <SidebarMenu className="mt-auto">
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            closeOnMobile
            tooltip="About Agent Vault"
            className="text-xs text-muted [&_svg]:size-3.5"
            onClick={() => setIsIntroOpen(true)}
          >
            <Info className="mb-px" />
            <span>About Agent Vault</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
};
