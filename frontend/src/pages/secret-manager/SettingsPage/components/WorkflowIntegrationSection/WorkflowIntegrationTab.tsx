import { Plus, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectWorkflowIntegration,
  useGetWorkspaceWorkflowIntegrationConfig
} from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { AddWorkflowIntegrationSheet } from "./components/AddWorkflowIntegrationSheet";
import { EditWorkflowIntegrationSheet } from "./components/EditWorkflowIntegrationSheet";
import { MicrosoftTeamsConfigRow } from "./components/MicrosoftTeamsConfigRow";
import { SlackConfigRow } from "./components/SlackConfigRow";
import { WORKFLOW_INTEGRATION_PLATFORM_LABELS } from "./constants";

export const WorkflowIntegrationTab = withProjectPermission(
  () => {
    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "addWorkflowIntegration",
      "removeIntegration",
      "editIntegration"
    ] as const);

    const { currentProject } = useProject();
    const { data: slackConfig, isPending: isSlackConfigLoading } =
      useGetWorkspaceWorkflowIntegrationConfig({
        projectId: currentProject?.id ?? "",
        integration: WorkflowIntegrationPlatform.SLACK
      });

    const { data: microsoftTeamsConfig, isPending: isMicrosoftTeamsConfigLoading } =
      useGetWorkspaceWorkflowIntegrationConfig({
        projectId: currentProject?.id ?? "",
        integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
      });

    const { mutateAsync: deleteIntegration } = useDeleteProjectWorkflowIntegration();

    const isConfigLoading = isSlackConfigLoading || isMicrosoftTeamsConfigLoading;
    const hasConfiguredIntegration = !!slackConfig || !!microsoftTeamsConfig;

    const removeIntegrationData = popUp.removeIntegration.data as
      | { integration: WorkflowIntegrationPlatform; integrationId: string }
      | undefined;
    const removeIntegrationLabel = removeIntegrationData
      ? WORKFLOW_INTEGRATION_PLATFORM_LABELS[removeIntegrationData.integration]
      : "workflow";

    const handleRemoveIntegration = async () => {
      if (!currentProject.id || !removeIntegrationData) {
        return;
      }

      await deleteIntegration({
        projectId: currentProject.id,
        integration: removeIntegrationData.integration,
        integrationId: removeIntegrationData.integrationId
      });

      handlePopUpClose("removeIntegration");
      createNotification({
        type: "success",
        text: `프로젝트에서 연동 제거 완료: ${removeIntegrationLabel} 연동`
      });
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>워크플로 연동</CardTitle>
          <CardDescription>
            접근 요청, 시크릿 승인 요청, 시크릿 동기화 오류 알림을 Slack 또는 Microsoft Teams로
            보내세요.
          </CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Settings}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  size="sm"
                  onClick={() => handlePopUpOpen("addWorkflowIntegration")}
                  isDisabled={!isAllowed}
                >
                  <Plus />
                  연동 추가
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isConfigLoading && !hasConfiguredIntegration ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>구성된 워크플로 연동이 없습니다</EmptyTitle>
                <EmptyDescription>
                  이 프로젝트의 알림을 Slack 또는 Microsoft Teams로 보내려면 워크플로 연동을
                  추가하세요.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/5">공급자</TableHead>
                  <TableHead>접근 요청 알림</TableHead>
                  <TableHead>시크릿 요청 알림</TableHead>
                  <TableHead>시크릿 동기화 오류 알림</TableHead>
                  <TableHead className="w-px text-right" aria-label="작업" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isConfigLoading &&
                  Array.from({ length: 2 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`workflow-integration-skeleton-${idx}`}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isConfigLoading && (
                  <>
                    <SlackConfigRow handlePopUpOpen={handlePopUpOpen} slackConfig={slackConfig} />
                    <MicrosoftTeamsConfigRow
                      handlePopUpOpen={handlePopUpOpen}
                      microsoftTeamsConfig={microsoftTeamsConfig}
                    />
                  </>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <AddWorkflowIntegrationSheet
          isOpen={popUp.addWorkflowIntegration.isOpen}
          onOpenChange={(state) => handlePopUpToggle("addWorkflowIntegration", state)}
        />
        <EditWorkflowIntegrationSheet
          isOpen={popUp.editIntegration.isOpen}
          onClose={() => handlePopUpClose("editIntegration")}
          integration={popUp.editIntegration.data?.integration}
        />
        <AlertDialog
          open={popUp.removeIntegration.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("removeIntegration", isOpen)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>
                제거 {removeIntegrationLabel} 연동을 이 프로젝트에서 제거하시겠습니까?
              </AlertDialogTitle>
              <AlertDialogDescription>
                이 프로젝트는 다음으로 알림을 보내지 않습니다: {removeIntegrationLabel}. 나중에 다시
                연동을 추가할 수 있습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction variant="danger" onClick={handleRemoveIntegration}>
                제거
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Settings,
    accessRestrictedMode: "dialog"
  }
);
