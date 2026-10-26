import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetClose,
  SheetFooter,
  Toggle
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useGetSlackIntegrationChannels,
  useGetWorkflowIntegrations,
  useGetWorkspaceWorkflowIntegrationConfig,
  useUpdateProjectWorkflowIntegrationConfig
} from "@app/hooks/api";
import {
  SlackIntegrationChannel,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";

const formSchema = z.object({
  slackIntegrationId: z.string().min(1, "Slack 연동 선택"),
  isSecretRequestNotificationEnabled: z.boolean(),
  secretRequestChannels: z.string().array(),
  isAccessRequestNotificationEnabled: z.boolean(),
  accessRequestChannels: z.string().array(),
  isSecretSyncErrorNotificationEnabled: z.boolean(),
  secretSyncErrorChannels: z.string().array()
});

type TSlackConfigForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  onBack?: () => void;
};

type TChannelsFieldProps = {
  inputId: string;
  value: string[];
  onChange: (value: string[]) => void;
  error?: { message?: string };
  channels?: SlackIntegrationChannel[];
  isLoading: boolean;
};

const ChannelsField = ({
  inputId,
  value,
  onChange,
  error,
  channels,
  isLoading
}: TChannelsFieldProps) => (
  <Field>
    <FieldLabel htmlFor={inputId}>Slack 채널</FieldLabel>
    <Combobox
      multiple
      id={inputId}
      options={channels}
      value={(channels ?? []).filter((channel) => value?.includes(channel.id))}
      onValueChange={(selected) => onChange(selected.map((channel) => channel.id))}
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.name}
      getOptionKeywords={(option) => [option.id]}
      placeholder="채널을 선택하세요..."
      isLoading={isLoading}
      isError={Boolean(error)}
    />
    <FieldError>{error?.message}</FieldError>
  </Field>
);

export const SlackIntegrationForm = ({ onClose, onBack }: Props) => {
  const { currentProject } = useProject();
  const { data: slackConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    projectId: currentProject?.id ?? "",
    integration: WorkflowIntegrationPlatform.SLACK
  });
  const { data: workflowIntegrations, isPending: isWorkflowIntegrationsLoading } =
    useGetWorkflowIntegrations(currentProject?.orgId);
  const { mutateAsync: updateProjectSlackConfig } = useUpdateProjectWorkflowIntegrationConfig();

  const slackIntegrations = workflowIntegrations?.filter(
    (integration) => integration.integration === WorkflowIntegrationPlatform.SLACK
  );
  const hasSlackIntegrations = !!slackIntegrations?.length;

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm<TSlackConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slackIntegrationId: "",
      isAccessRequestNotificationEnabled: false,
      accessRequestChannels: [],
      isSecretRequestNotificationEnabled: false,
      secretRequestChannels: [],
      isSecretSyncErrorNotificationEnabled: false,
      secretSyncErrorChannels: []
    }
  });

  const handleIntegrationSave = async (data: TSlackConfigForm) => {
    if (!currentProject) {
      return;
    }

    await updateProjectSlackConfig({
      ...data,
      projectId: currentProject.id,
      integration: WorkflowIntegrationPlatform.SLACK,
      integrationId: data.slackIntegrationId,
      accessRequestChannels: data.accessRequestChannels.filter(Boolean).join(", "),
      secretRequestChannels: data.secretRequestChannels.filter(Boolean).join(", "),
      secretSyncErrorChannels: data.secretSyncErrorChannels.filter(Boolean).join(", ")
    });

    createNotification({
      type: "success",
      text: "Slack 연동 설정을 저장했습니다"
    });

    onClose();
  };

  const secretRequestNotifState = watch("isSecretRequestNotificationEnabled");
  const selectedSlackIntegrationId = watch("slackIntegrationId");
  const accessRequestNotifState = watch("isAccessRequestNotificationEnabled");
  const secretSyncErrorNotifState = watch("isSecretSyncErrorNotificationEnabled");

  const { data: slackChannels, isPending: isSlackChannelsLoading } = useGetSlackIntegrationChannels(
    selectedSlackIntegrationId || undefined
  );
  const slackChannelIdToName = Object.fromEntries(
    (slackChannels || []).map((channel) => [channel.id, channel.name])
  );
  const sortedSlackChannels = slackChannels
    ?.slice()
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  useEffect(() => {
    if (slackConfig && slackConfig.integration === WorkflowIntegrationPlatform.SLACK) {
      setValue("slackIntegrationId", slackConfig.integrationId);
      setValue(
        "isSecretRequestNotificationEnabled",
        slackConfig.isSecretRequestNotificationEnabled
      );
      setValue(
        "isAccessRequestNotificationEnabled",
        slackConfig.isAccessRequestNotificationEnabled
      );
      setValue(
        "isSecretSyncErrorNotificationEnabled",
        slackConfig.isSecretSyncErrorNotificationEnabled
      );

      if (slackChannels) {
        setValue(
          "secretRequestChannels",
          (slackConfig.secretRequestChannels || "")
            .split(", ")
            .filter((channel) => channel in slackChannelIdToName)
        );
        setValue(
          "accessRequestChannels",
          (slackConfig.accessRequestChannels || "")
            .split(", ")
            .filter((channel) => channel in slackChannelIdToName)
        );
        setValue(
          "secretSyncErrorChannels",
          (slackConfig.secretSyncErrorChannels || "")
            .split(", ")
            .filter((channel) => channel in slackChannelIdToName)
        );
      }
    }
  }, [slackConfig, slackChannels]);

  return (
    <form
      onSubmit={handleSubmit(handleIntegrationSave)}
      className="flex min-h-0 flex-1 flex-col"
      autoComplete="off"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        {!isWorkflowIntegrationsLoading && !hasSlackIntegrations ? (
          <Alert>
            <Info />
            <AlertTitle>연결된 Slack 연동이 없습니다</AlertTitle>
            <AlertDescription>
              <p>프로젝트 알림을 구성하려면 먼저 조직에 Slack 워크스페이스를 연결하세요.</p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link
                  to="/organizations/$orgId/integrations"
                  params={{ orgId: currentProject.orgId }}
                  search={{ selectedTab: "workflow-integrations" }}
                >
                  조직 연동으로 이동
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Controller
            control={control}
            name="slackIntegrationId"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="slack-integration">Slack 연동</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger
                    id="slack-integration"
                    className="w-full"
                    aria-invalid={Boolean(error)}
                  >
                    <SelectValue
                      placeholder={
                        isWorkflowIntegrationsLoading ? "불러오는 중..." : "연동을 선택하세요"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {slackIntegrations?.map((slackIntegration) => (
                      <SelectItem value={slackIntegration.id} key={slackIntegration.id}>
                        {slackIntegration.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        )}
        {!!selectedSlackIntegrationId && (
          <>
            <Controller
              control={control}
              name="isSecretRequestNotificationEnabled"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center!">
                  <FieldContent>
                    <FieldTitle>시크릿 승인 요청</FieldTitle>
                    <FieldDescription>
                      시크릿 승인 요청이 생성되면 알림을 보냅니다.
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="시크릿 승인 요청 알림"
                  />
                </Field>
              )}
            />
            {secretRequestNotifState && (
              <Controller
                control={control}
                name="secretRequestChannels"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <ChannelsField
                    inputId="secret-request-channels"
                    value={value}
                    onChange={onChange}
                    error={error}
                    channels={sortedSlackChannels}
                    isLoading={isSlackChannelsLoading}
                  />
                )}
              />
            )}
            <Controller
              control={control}
              name="isAccessRequestNotificationEnabled"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center!">
                  <FieldContent>
                    <FieldTitle>접근 요청</FieldTitle>
                    <FieldDescription>접근 요청이 생성되면 알림을 보냅니다.</FieldDescription>
                  </FieldContent>
                  <Toggle
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="접근 요청 알림"
                  />
                </Field>
              )}
            />
            {accessRequestNotifState && (
              <Controller
                control={control}
                name="accessRequestChannels"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <ChannelsField
                    inputId="access-request-channels"
                    value={value}
                    onChange={onChange}
                    error={error}
                    channels={sortedSlackChannels}
                    isLoading={isSlackChannelsLoading}
                  />
                )}
              />
            )}
            <Controller
              control={control}
              name="isSecretSyncErrorNotificationEnabled"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center!">
                  <FieldContent>
                    <FieldTitle>시크릿 동기화 오류</FieldTitle>
                    <FieldDescription>시크릿 동기화에 실패하면 알림을 보냅니다.</FieldDescription>
                  </FieldContent>
                  <Toggle
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="시크릿 동기화 오류 알림"
                  />
                </Field>
              )}
            />
            {secretSyncErrorNotifState && (
              <Controller
                control={control}
                name="secretSyncErrorChannels"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <ChannelsField
                    inputId="secret-sync-error-channels"
                    value={value}
                    onChange={onChange}
                    error={error}
                    channels={sortedSlackChannels}
                    isLoading={isSlackChannelsLoading}
                  />
                )}
              />
            )}
          </>
        )}
      </div>
      <SheetFooter className="justify-end border-t">
        {onBack && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}>
            <ChevronLeft />
            뒤로
          </Button>
        )}
        <SheetClose asChild>
          <Button type="button" variant="ghost">
            취소
          </Button>
        </SheetClose>
        <Button
          type="submit"
          variant="project"
          isPending={isSubmitting}
          isDisabled={!isDirty || isSubmitting || !hasSlackIntegrations}
        >
          저장
        </Button>
      </SheetFooter>
    </form>
  );
};
