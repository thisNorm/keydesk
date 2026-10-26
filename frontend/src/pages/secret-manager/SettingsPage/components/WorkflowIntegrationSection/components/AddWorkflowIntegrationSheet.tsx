import { useState } from "react";
import { BsMicrosoftTeams, BsSlack } from "react-icons/bs";

import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetWorkspaceWorkflowIntegrationConfig } from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { WORKFLOW_INTEGRATION_PLATFORM_LABELS } from "../constants";
import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen?: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const PLATFORM_LIST = [
  {
    icon: <BsSlack className="text-lg" />,
    platform: WorkflowIntegrationPlatform.SLACK,
    title: "Slack"
  },
  {
    icon: <BsMicrosoftTeams className="text-lg" />,
    platform: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
    title: "Microsoft Teams"
  }
];

export const AddWorkflowIntegrationSheet = ({ isOpen, onOpenChange }: Props) => {
  const [selectedPlatform, setSelectedPlatform] = useState<WorkflowIntegrationPlatform | null>(
    null
  );

  const { currentProject } = useProject();
  const { data: slackConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    projectId: currentProject?.id ?? "",
    integration: WorkflowIntegrationPlatform.SLACK
  });
  const { data: microsoftTeamsConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    projectId: currentProject?.id ?? "",
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });

  const configuredPlatforms: Partial<Record<WorkflowIntegrationPlatform, boolean>> = {
    [WorkflowIntegrationPlatform.SLACK]: !!slackConfig,
    [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: !!microsoftTeamsConfig
  };

  const handleOpenChange = (state: boolean) => {
    onOpenChange(state);
    if (!state) {
      setSelectedPlatform(null);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>
              {selectedPlatform
                ? `구성할 연동: ${WORKFLOW_INTEGRATION_PLATFORM_LABELS[selectedPlatform]} 연동`
                : "워크플로 연동 추가"}
            </SheetTitle>
            <SheetDescription>
              {selectedPlatform
                ? `다음으로 알림을 보낼 이벤트를 선택하세요: ${WORKFLOW_INTEGRATION_PLATFORM_LABELS[selectedPlatform]}.`
                : "이 프로젝트의 알림을 받을 플랫폼을 선택하세요."}
            </SheetDescription>
          </SheetHeader>
          {!selectedPlatform && (
            <>
              <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
                <div className="flex items-center gap-4">
                  {PLATFORM_LIST.map(({ icon, platform, title }) => (
                    <button
                      type="button"
                      key={platform}
                      onClick={() => setSelectedPlatform(platform)}
                      className="relative flex h-28 w-36 flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-border bg-container transition-colors hover:border-project/70 hover:bg-project/10"
                    >
                      {icon}
                      <span className="text-sm">{title}</span>
                      {configuredPlatforms[platform] && (
                        <Badge
                          variant="project"
                          isFullWidth
                          className="absolute inset-x-0 bottom-0 justify-center rounded-none"
                        >
                          이미 구성됨
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <SheetFooter className="justify-end border-t">
                <SheetClose asChild>
                  <Button type="button" variant="ghost">
                    취소
                  </Button>
                </SheetClose>
              </SheetFooter>
            </>
          )}
          {selectedPlatform === WorkflowIntegrationPlatform.SLACK && (
            <SlackIntegrationForm
              onClose={() => handleOpenChange(false)}
              onBack={() => setSelectedPlatform(null)}
            />
          )}
          {selectedPlatform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
            <MicrosoftTeamsIntegrationForm
              onClose={() => handleOpenChange(false)}
              onBack={() => setSelectedPlatform(null)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
