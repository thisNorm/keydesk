import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Blocks, CreditCard, FileText, KeyRound, Settings, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { OrgIcon, SidebarCollapsibleGroup, SubOrgIcon } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { OrgNavList } from "./OrgNavLink";
import { OrgSettingsSubmenuView } from "./OrgSubmenuView";
import type { OrgNavGroup } from "./types";

// --- Org nav ---

export const OrgNav = () => {
  const { currentOrg, isRootOrganization } = useOrganization();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // /settings, /sso, /networking and /oauth-applications all live under the settings submenu.
  const isOnSettingsArea =
    /\/organizations\/[^/]+\/(settings|sso|networking|oauth-applications)(\/|$)/.test(pathname);
  const [showSettings, setShowSettings] = useState(isOnSettingsArea);

  useEffect(() => {
    setShowSettings(isOnSettingsArea);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenSettings = () => {
    setShowSettings(true);
    // Already on a settings-area URL (e.g. after collapsing via "< Settings"):
    // re-navigating would push a duplicate same-URL history entry, so just
    // re-expand the sub-nav.
    if (isOnSettingsArea) return;
    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { selectedTab: "" }
    });
  };

  const groups: OrgNavGroup[] = [
    {
      label: "일반",
      collapsible: false,
      items: [
        {
          label: "내 API 보관함",
          icon: KeyRound,
          pathSuffix: "api-vault"
        },
        {
          label: "전체 프로젝트",
          icon: isRootOrganization ? OrgIcon : SubOrgIcon,
          pathSuffix: "projects"
        },
        {
          label: "연동",
          icon: Blocks,
          pathSuffix: "integrations",
          // Keep highlighted on the app-connections OAuth/manifest callback pages
          activeMatch: /organizations\/[^/]+\/app-connections/
        }
      ]
    },
    {
      label: "관리",
      items: [
        {
          label: "접근 권한",
          icon: Shield,
          pathSuffix: "access-management",
          activeMatch: /organizations\/[^/]+\/(members|identities|groups|roles)/
        },
        {
          label: "사용량 및 결제",
          icon: CreditCard,
          pathSuffix: "billing",
          hidden: !isRootOrganization
        },
        { label: "감사 로그", icon: FileText, pathSuffix: "audit-logs" },
        { label: "설정", icon: Settings, pathSuffix: "settings", opensSubmenu: true }
      ]
    }
  ];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showSettings ? (
        <motion.div
          key="submenu"
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 30, opacity: 0 }}
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          <OrgSettingsSubmenuView onBack={() => setShowSettings(false)} />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -30, opacity: 0 }}
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          {groups.map((group) => (
            <SidebarCollapsibleGroup
              key={group.label}
              label={group.label}
              collapsible={group.collapsible}
              defaultOpen={group.defaultOpen}
            >
              <OrgNavList items={group.items} onOpenSubmenu={handleOpenSettings} />
            </SidebarCollapsibleGroup>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
