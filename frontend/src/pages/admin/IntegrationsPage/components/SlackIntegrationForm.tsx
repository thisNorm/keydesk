import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { BsSlack } from "react-icons/bs";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput
} from "@app/components/v3";
import { useUpdateServerConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

const getCustomSlackAppCreationUrl = () =>
  `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(
    JSON.stringify({
      display_information: {
        name: "Keydesk",
        description: "Slack에서 Keydesk의 실시간 업데이트 받기",
        background_color: "#c2d62b",
        long_description: `자체 호스팅 Keydesk 인스턴스와 Slack 워크스페이스를 연결하는 앱입니다.
        - 알림: Keydesk 프로젝트의 시크릿과 팀 구성 변경 등 주요 이벤트를 지정한 Slack 채널에서 확인합니다.
        - 설정: 알림을 보낼 이벤트와 채널을 팀에 맞게 선택합니다.
        - 협업: 프로젝트의 주요 변경 사항을 팀과 공유합니다.`
      },
      features: {
        app_home: {
          home_tab_enabled: false,
          messages_tab_enabled: false,
          messages_tab_read_only_enabled: true
        },
        bot_user: {
          display_name: "Keydesk",
          always_online: true
        }
      },
      oauth_config: {
        redirect_urls: [`${window.origin}/api/v1/workflow-integrations/slack/oauth_redirect`],
        scopes: {
          bot: ["chat:write.public", "chat:write", "channels:read", "groups:read"]
        }
      },
      settings: {
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false
      }
    })
  )}`;

const slackFormSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string()
});

type TSlackForm = z.infer<typeof slackFormSchema>;

type Props = {
  adminIntegrationsConfig?: AdminIntegrationsConfig;
};

export const SlackIntegrationForm = ({ adminIntegrationsConfig }: Props) => {
  const { mutateAsync: updateAdminServerConfig } = useUpdateServerConfig();
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TSlackForm>({
    resolver: zodResolver(slackFormSchema)
  });

  const onSubmit = async (data: TSlackForm) => {
    await updateAdminServerConfig({
      slackClientId: data.clientId,
      slackClientSecret: data.clientSecret
    });

    createNotification({
      text: "관리자 Slack 구성을 수정했습니다",
      type: "success"
    });
  };

  useEffect(() => {
    if (adminIntegrationsConfig) {
      setValue("clientId", adminIntegrationsConfig.slack.clientId);
      setValue("clientSecret", adminIntegrationsConfig.slack.clientSecret);
    }
  }, [adminIntegrationsConfig]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="slack-integration" className="data-[state=open]:border-none">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <BsSlack className="text-lg" />
              <div className="text-[15px] font-medium">Slack</div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-6">
            <div className="flex w-full flex-col gap-4">
              <div className="max-w-lg text-sm text-label">1단계: Keydesk Slack 앱 만들기</div>
              <div>
                <Button
                  variant="neutral"
                  onClick={() => window.open(getCustomSlackAppCreationUrl())}
                >
                  Slack 앱 만들기
                </Button>
              </div>
              <div className="max-w-lg text-sm text-label">
                2단계: Slack과 연동하려면 인스턴스 전체 설정을 구성하세요. 사용자 지정 Slack 앱의
                App Credentials 페이지에서 값을 복사하세요.
              </div>
              <Controller
                control={control}
                name="clientId"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="slack-client-id">클라이언트 ID</FieldLabel>
                    <Input
                      id="slack-client-id"
                      {...field}
                      value={field.value || ""}
                      isError={Boolean(error)}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="clientSecret"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="slack-client-secret">클라이언트 시크릿</FieldLabel>
                    <SecretInput
                      id="slack-client-secret"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <div>
                <Button
                  variant="neutral"
                  type="submit"
                  isPending={isSubmitting}
                  isDisabled={!isDirty}
                >
                  저장
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </form>
  );
};
