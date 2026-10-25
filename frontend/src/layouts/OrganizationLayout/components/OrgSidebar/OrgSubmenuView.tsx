import {
  AppWindow,
  ChevronLeft,
  Cog,
  KeyRound,
  Lock,
  Network,
  ShieldUser,
  SlidersHorizontal
} from "lucide-react";

import { SubOrganizationsUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SubOrgIcon } from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { OrgNavLink } from "./OrgNavLink";
import type { OrgNavItem } from "./types";

// --- Org settings submenu (secondary sidebar) ---

type OrgSettingsItem = OrgNavItem & { requiresFeature?: boolean };

export const OrgSettingsSubmenuView = ({ onBack }: { onBack: () => void }) => {
  const { isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const items: OrgSettingsItem[] = [
    {
      label: "일반",
      icon: Cog,
      pathSuffix: "settings",
      search: { selectedTab: "tab-org-general" },
      isDefaultSearch: true
    },
    {
      label: "SSO & Provisioning",
      icon: ShieldUser,
      pathSuffix: "sso",
      hidden: isSubOrganization
    },
    {
      label: "OAuth Applications",
      icon: AppWindow,
      pathSuffix: "oauth-applications",
      hidden: isSubOrganization
    },
    {
      label: "네트워크",
      icon: Network,
      pathSuffix: "networking"
    },
    {
      label: "보안",
      icon: Lock,
      pathSuffix: "settings",
      search: { selectedTab: "tab-org-security" },
      hidden: isSubOrganization
    },
    {
      label: "암호화",
      icon: KeyRound,
      pathSuffix: "settings",
      search: { selectedTab: "tab-org-encryption" }
    },
    {
      label: "Product Settings",
      icon: SlidersHorizontal,
      pathSuffix: "settings",
      search: { selectedTab: "product-settings" }
    },
    {
      label: "하위 조직",
      icon: SubOrgIcon,
      pathSuffix: "settings",
      search: { selectedTab: "tab-sub-organizations" },
      hidden: isSubOrganization,
      requiresFeature: !subscription?.subOrganization
    }
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button
          className="cursor-pointer hover:bg-foreground/[0.025]"
          type="button"
          onClick={onBack}
        >
          <ChevronLeft />
          <span>설정</span>
        </button>
      </SidebarGroupLabel>
      <SidebarMenu>
        {items
          .filter((item) => !item.hidden)
          .map((item) => (
            <OrgNavLink
              key={item.label}
              item={item}
              onClick={item.requiresFeature ? () => handlePopUpOpen("upgradePlan") : undefined}
            />
          ))}
      </SidebarMenu>
      <UpgradeGate
        paywallKey="organization.sub-organizations"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={{
          ...SubOrganizationsUpgradeIntent,
          isEnterpriseFeature: false
        }}
      />
    </SidebarGroup>
  );
};
