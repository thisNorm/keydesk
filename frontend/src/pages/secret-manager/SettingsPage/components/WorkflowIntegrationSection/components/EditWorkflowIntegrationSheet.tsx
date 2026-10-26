import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { WORKFLOW_INTEGRATION_PLATFORM_LABELS } from "../constants";
import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen?: boolean;
  onClose: () => void;
  integration?: WorkflowIntegrationPlatform;
};

export const EditWorkflowIntegrationSheet = ({ isOpen, onClose, integration }: Props) => {
  const platformLabel = integration ? WORKFLOW_INTEGRATION_PLATFORM_LABELS[integration] : "";

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(state) => {
        if (!state) {
          onClose();
        }
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>수정 {platformLabel} 연동</SheetTitle>
            <SheetDescription>
              다음으로 알림을 보낼 이벤트를 선택하세요: {platformLabel}.
            </SheetDescription>
          </SheetHeader>
          {integration === WorkflowIntegrationPlatform.SLACK && (
            <SlackIntegrationForm onClose={onClose} />
          )}
          {integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
            <MicrosoftTeamsIntegrationForm onClose={onClose} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
