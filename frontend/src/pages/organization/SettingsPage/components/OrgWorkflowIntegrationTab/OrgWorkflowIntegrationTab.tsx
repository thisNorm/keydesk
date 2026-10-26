import { BsMicrosoftTeams, BsSlack } from "react-icons/bs";
import axios from "axios";
import { Info, MoreHorizontal, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp, useScopeVariant } from "@app/hooks";
import {
  fetchSlackReinstallUrl,
  useCheckMicrosoftTeamsIntegrationInstallationStatus,
  useDeleteMicrosoftTeamsIntegration,
  useDeleteSlackIntegration,
  useGetWorkflowIntegrations
} from "@app/hooks/api";
import {
  WorkflowIntegrationPlatform,
  WorkflowIntegrationStatus
} from "@app/hooks/api/workflowIntegrations/types";

import { AddWorkflowIntegrationForm } from "./AddWorkflowIntegrationForm";
import { IntegrationFormDetails } from "./IntegrationFormDetails";

const renderStatus = (status: WorkflowIntegrationStatus) => {
  if (status === WorkflowIntegrationStatus.Installed) {
    return <Badge variant="success">설치됨</Badge>;
  }

  if (status === WorkflowIntegrationStatus.Pending) {
    return <Badge variant="warning">대기 중</Badge>;
  }

  return <Badge variant="danger">실패</Badge>;
};

export const OrgWorkflowIntegrationTab = withPermission(
  () => {
    const scopeVariant = useScopeVariant();
    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "addWorkflowIntegration",
      "integrationDetails",
      "removeIntegration"
    ] as const);

    const { currentOrg } = useOrganization();
    const { data: workflowIntegrations, isPending: isWorkflowIntegrationsLoading } =
      useGetWorkflowIntegrations(currentOrg?.id);

    const { mutateAsync: deleteSlackIntegration, isPending: isDeletingSlackIntegration } =
      useDeleteSlackIntegration();
    const {
      mutateAsync: deleteMicrosoftTeamsIntegration,
      isPending: isDeletingMicrosoftTeamsIntegration
    } = useDeleteMicrosoftTeamsIntegration();
    const { mutateAsync: checkMicrosoftTeamsInstallationStatus } =
      useCheckMicrosoftTeamsIntegrationInstallationStatus();

    const isDeletingIntegration = isDeletingSlackIntegration || isDeletingMicrosoftTeamsIntegration;

    const removeIntegrationData = popUp.removeIntegration.data as
      | { id: string; slug: string; platform: WorkflowIntegrationPlatform }
      | undefined;

    const handleRemoveIntegration = async () => {
      if (!currentOrg || !removeIntegrationData) {
        return;
      }

      const { platform, id, slug } = removeIntegrationData;
      if (platform === WorkflowIntegrationPlatform.SLACK) {
        await deleteSlackIntegration({
          id,
          orgId: currentOrg?.id
        });
      }

      if (platform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS) {
        await deleteMicrosoftTeamsIntegration({
          id,
          orgId: currentOrg?.id
        });
      }

      handlePopUpClose("removeIntegration");
      createNotification({
        text: `연동 삭제 완료: "${slug}"`,
        type: "success"
      });
    };

    const triggerSlackReinstall = async (id: string) => {
      try {
        const slackReinstallUrl = await fetchSlackReinstallUrl({
          id
        });

        if (slackReinstallUrl) {
          window.location.href = slackReinstallUrl;
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          createNotification({
            text: (err.response?.data as { message: string })?.message,
            type: "error"
          });
        }
      }
    };

    const triggerMicrosoftTeamsInstallationStatusCheck = async (id: string) => {
      await checkMicrosoftTeamsInstallationStatus({
        workflowIntegrationId: id,
        orgId: currentOrg?.id
      });

      createNotification({
        text: "Microsoft Teams 테넌트에 봇을 설치했습니다",
        type: "success"
      });
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>워크플로 연동</CardTitle>
          <CardDescription>
            알림과 워크플로를 연동하려면 Keydesk를 다른 플랫폼에 연결하세요.
          </CardDescription>
          <CardAction>
            <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Settings}>
              {(isAllowed) => (
                <Button
                  variant={scopeVariant}
                  size="sm"
                  onClick={() => {
                    handlePopUpOpen("addWorkflowIntegration");
                  }}
                  isDisabled={!isAllowed}
                >
                  <Plus />
                  연동 추가
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isWorkflowIntegrationsLoading && workflowIntegrations?.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>연결된 워크플로 연동이 없습니다</EmptyTitle>
                <EmptyDescription>
                  알림과 승인 워크플로를 사용하려면 Slack 또는 Microsoft Teams를 연결하세요.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">공급자</TableHead>
                  <TableHead>별칭</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-px text-right" aria-label="작업" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isWorkflowIntegrationsLoading &&
                  Array.from({ length: 2 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`workflow-integration-skeleton-${idx}`}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isWorkflowIntegrationsLoading &&
                  workflowIntegrations?.map((workflowIntegration) => (
                    <TableRow key={workflowIntegration.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {workflowIntegration.integration === WorkflowIntegrationPlatform.SLACK ? (
                            <BsSlack />
                          ) : (
                            <BsMicrosoftTeams />
                          )}
                          <span className="capitalize">
                            {workflowIntegration.integration.replaceAll("-", " ")}
                          </span>
                          {workflowIntegration.description && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Info className="size-3.5 text-muted" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{workflowIntegration.description}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-0">
                        <p className="truncate">{workflowIntegration.slug}</p>
                      </TableCell>
                      <TableCell>{renderStatus(workflowIntegration.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                aria-label={`연동 작업: ${workflowIntegration.slug}`}
                              >
                                <MoreHorizontal />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() =>
                                  handlePopUpOpen("integrationDetails", {
                                    id: workflowIntegration.id,
                                    platform: workflowIntegration.integration
                                  })
                                }
                              >
                                <Info />
                                세부 정보 보기
                              </DropdownMenuItem>
                              {workflowIntegration.integration ===
                                WorkflowIntegrationPlatform.SLACK && (
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Create}
                                  an={OrgPermissionSubjects.Settings}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      isDisabled={!isAllowed}
                                      onClick={() => triggerSlackReinstall(workflowIntegration.id)}
                                    >
                                      <RotateCcw />
                                      다시 설치
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              )}
                              {workflowIntegration.integration ===
                                WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  an={OrgPermissionSubjects.Settings}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      isDisabled={!isAllowed}
                                      onClick={() =>
                                        triggerMicrosoftTeamsInstallationStatusCheck(
                                          workflowIntegration.id
                                        )
                                      }
                                    >
                                      <ShieldCheck />
                                      설치 상태 확인
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              )}
                              <OrgPermissionCan
                                I={OrgPermissionActions.Delete}
                                an={OrgPermissionSubjects.Settings}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    variant="danger"
                                    isDisabled={!isAllowed}
                                    onClick={() =>
                                      handlePopUpOpen("removeIntegration", {
                                        id: workflowIntegration.id,
                                        slug: workflowIntegration.slug,
                                        platform: workflowIntegration.integration
                                      })
                                    }
                                  >
                                    <Trash2 />
                                    삭제
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <AddWorkflowIntegrationForm
          isOpen={popUp.addWorkflowIntegration.isOpen}
          onToggle={(state) => handlePopUpToggle("addWorkflowIntegration", state)}
        />
        <IntegrationFormDetails
          isOpen={popUp.integrationDetails?.isOpen}
          workflowPlatform={popUp.integrationDetails?.data?.platform}
          id={popUp.integrationDetails?.data?.id}
          onOpenChange={(state) => handlePopUpToggle("integrationDetails", state)}
        />
        <ConfirmationAlertDialog
          isOpen={popUp.removeIntegration.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("removeIntegration", isOpen)}
          title={`삭제할 연동: "${removeIntegrationData?.slug ?? ""}"?`}
          description="이 연동을 사용하는 프로젝트는 더 이상 해당 연동으로 알림을 보내지 않습니다. 이 작업은 되돌릴 수 없습니다."
          confirmKey={removeIntegrationData?.slug ?? ""}
          isPending={isDeletingIntegration}
          onConfirm={handleRemoveIntegration}
        />
      </Card>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Settings,
    accessRestrictedMode: "dialog"
  }
);
