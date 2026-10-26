import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import {
  AlertDescription,
  DismissableAlert,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";
import { ExternalMigrationsTab } from "@app/pages/organization/SettingsPage/components/ExternalMigrationsTab";
import { OrgWorkflowIntegrationTab } from "@app/pages/organization/SettingsPage/components/OrgWorkflowIntegrationTab";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const AppConnectionsTab = withPermission(
  () => (
    <>
      <DismissableAlert
        variant="info"
        className="mb-4"
        actionKey="app_connections_project_scope_banner_dismissed"
      >
        <InfoIcon />
        <AlertDescription>
          이제 프로젝트에서도 앱 연결을 개별적으로 만들고 관리할 수 있습니다.
        </AlertDescription>
      </DismissableAlert>
      <AppConnectionsTable />
    </>
  ),
  {
    action: OrgPermissionAppConnectionActions.Read,
    subject: OrgPermissionSubjects.AppConnections,
    accessRestrictedMode: "dialog"
  }
);

export const IntegrationsPage = () => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.IntegrationsPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const tabs = [
    {
      key: IntegrationsListPageTabs.AppConnections as string,
      label: "앱 연결",
      component: AppConnectionsTab
    },
    {
      key: "workflow-integrations",
      label: "워크플로 연동",
      component: OrgWorkflowIntegrationTab
    },
    {
      key: "external-migrations",
      label: "외부 마이그레이션",
      component: ExternalMigrationsTab
    }
  ];

  const activeTab = tabs.some((tab) => tab.key === selectedTab)
    ? selectedTab
    : IntegrationsListPageTabs.AppConnections;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/integrations",
      params: { orgId: currentOrg.id },
      search: { selectedTab: tab }
    });
  };

  return (
    <>
      <Helmet>
        <title>Keydesk | 연동</title>
        <link rel="icon" href="/keydesk.svg" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-page text-foreground-inverse">
        <div className="flex w-full max-w-8xl flex-col">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="연동"
            description="Keydesk를 외부 서비스에 연결하고 조직 전체의 연동을 관리하세요."
          />
          <Tabs value={activeTab} onValueChange={updateSelectedTab}>
            <TabsList
              variant={isSubOrganization ? "sub-org" : "org"}
              aria-label={isSubOrganization ? "하위 조직 연동 섹션" : "조직 연동 섹션"}
            >
              {tabs.map(({ key, label }) => (
                <TabsTrigger value={key} key={`tab-${key}`}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map(({ key, component: Component }) => (
              <TabsContent value={key} key={`tab-panel-${key}`}>
                <Component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </>
  );
};
