import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { BsMicrosoftTeams } from "react-icons/bs";
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
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SecretInput
} from "@app/components/v3";
import { useUpdateServerConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

const microsoftTeamsFormSchema = z.object({
  appId: z.string(),
  clientSecret: z.string(),
  botId: z.string()
});

type TMicrosoftTeamsForm = z.infer<typeof microsoftTeamsFormSchema>;

type Props = {
  adminIntegrationsConfig?: AdminIntegrationsConfig;
};

export const MicrosoftTeamsIntegrationForm = ({ adminIntegrationsConfig }: Props) => {
  const { mutateAsync: updateAdminServerConfig } = useUpdateServerConfig();
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TMicrosoftTeamsForm>({
    resolver: zodResolver(microsoftTeamsFormSchema)
  });

  const onSubmit = async (data: TMicrosoftTeamsForm) => {
    await updateAdminServerConfig({
      microsoftTeamsAppId: data.appId,
      microsoftTeamsClientSecret: data.clientSecret,
      microsoftTeamsBotId: data.botId
    });

    createNotification({
      text: "관리자 Microsoft Teams 구성을 수정했습니다. 적용되는 데 최대 5분이 걸릴 수 있습니다.",
      type: "success"
    });
  };

  useEffect(() => {
    if (adminIntegrationsConfig) {
      setValue("appId", adminIntegrationsConfig.microsoftTeams.appId);
      setValue("clientSecret", adminIntegrationsConfig.microsoftTeams.clientSecret);
      setValue("botId", adminIntegrationsConfig.microsoftTeams.botId);
    }
  }, [adminIntegrationsConfig]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="microsoft-teams-integration"
          className="data-[state=open]:border-none"
        >
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <BsMicrosoftTeams className="text-lg" />
              <div className="text-[15px] font-medium">Microsoft Teams</div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-6">
            <div className="flex w-full flex-col gap-4">
              <div className="max-w-lg text-sm text-label">
                1단계: Microsoft Teams 봇과 Azure 리소스를 만들고 구성하세요. 자세한 내용은 아래
                문서를 확인하세요.
              </div>
              <div>
                <Button variant="neutral" asChild>
                  <a
                    href="https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    문서
                  </a>
                </Button>
              </div>
              <div className="max-w-lg text-sm text-label">
                2단계: Microsoft Teams와 연동하려면 인스턴스 전체 설정을 구성하세요. Microsoft Teams
                봇의 앱 등록 페이지에서 앱 ID와 클라이언트 시크릿을 복사하세요. 클라이언트 시크릿은
                봇의 비밀번호입니다.
              </div>
              <Controller
                control={control}
                name="appId"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="teams-app-client-id">
                      애플리케이션(클라이언트) ID
                    </FieldLabel>
                    <Input
                      id="teams-app-client-id"
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
                    <FieldLabel htmlFor="teams-client-secret">클라이언트 시크릿</FieldLabel>
                    <SecretInput
                      id="teams-client-secret"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldDescription>
                      봇 앱 등록의 Certificates &amp; secrets에서 확인할 수 있습니다.
                    </FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="botId"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="teams-app-id">Microsoft Teams 앱 ID</FieldLabel>
                    <Input
                      id="teams-app-id"
                      {...field}
                      value={field.value || ""}
                      isError={Boolean(error)}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldDescription>
                      Microsoft Teams Developer Portal의 앱 개요에서 확인할 수 있습니다.
                    </FieldDescription>
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
