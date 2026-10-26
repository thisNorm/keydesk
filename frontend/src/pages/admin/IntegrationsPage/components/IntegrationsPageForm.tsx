import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { useGetAdminIntegrationsConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

interface WorkflowTabProps {
  adminIntegrationsConfig: AdminIntegrationsConfig;
}

const WorkflowTab = ({ adminIntegrationsConfig }: WorkflowTabProps) => (
  <div className="flex flex-col gap-2">
    <SlackIntegrationForm adminIntegrationsConfig={adminIntegrationsConfig} />
    <MicrosoftTeamsIntegrationForm adminIntegrationsConfig={adminIntegrationsConfig} />
  </div>
);

export const IntegrationsPageForm = () => {
  const { data: adminIntegrationsConfig } = useGetAdminIntegrationsConfig();

  return (
    <Card className="min-h-64">
      <CardHeader>
        <CardTitle>연동</CardTitle>
        <CardDescription>타사 서비스와 연동하려면 인스턴스 전체 설정을 구성하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <WorkflowTab adminIntegrationsConfig={adminIntegrationsConfig!} />
      </CardContent>
    </Card>
  );
};
