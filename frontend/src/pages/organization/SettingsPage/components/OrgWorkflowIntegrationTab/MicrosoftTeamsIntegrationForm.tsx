import crypto from "crypto";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DialogClose,
  DialogFooter,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useScopeVariant } from "@app/hooks";
import {
  useGetMicrosoftTeamsClientId,
  useGetMicrosoftTeamsIntegrationById,
  useUpdateMicrosoftTeamsIntegration
} from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  id?: string;
  onClose: () => void;
  onBack?: () => void;
};

const microsoftTeamsFormSchema = z.object({
  slug: slugSchema({ min: 1, field: "별칭" }),
  tenantId: z
    .string()
    .min(1, { message: "테넌트 ID를 입력하세요" })
    .trim()
    .uuid("테넌트 ID는 올바른 UUID여야 합니다"),
  description: z.string().optional()
});

type TMicrosoftTeamsFormData = z.infer<typeof microsoftTeamsFormSchema>;

export const MicrosoftTeamsIntegrationForm = ({ id, onClose, onBack }: Props) => {
  const scopeVariant = useScopeVariant();
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TMicrosoftTeamsFormData>({
    resolver: zodResolver(microsoftTeamsFormSchema)
  });

  const { currentOrg } = useOrganization();
  const { data: microsoftTeamsIntegration } = useGetMicrosoftTeamsIntegrationById(id);
  const { mutateAsync: updateMicrosoftTeamsIntegration } = useUpdateMicrosoftTeamsIntegration();
  const { data: microsoftTeamsClientId } = useGetMicrosoftTeamsClientId();

  useEffect(() => {
    if (microsoftTeamsIntegration) {
      setValue("slug", microsoftTeamsIntegration.slug);
      setValue("description", microsoftTeamsIntegration.description ?? "");
      setValue("tenantId", microsoftTeamsIntegration.tenantId);
    }
  }, [microsoftTeamsIntegration]);

  const handleMicrosoftTeamsFormSubmit = async ({
    slug,
    description,
    tenantId
  }: TMicrosoftTeamsFormData) => {
    if (!microsoftTeamsClientId) {
      createNotification({
        text: "Microsoft Teams 클라이언트 ID가 설정되지 않았습니다. 인스턴스 관리자에게 문의하세요.",
        type: "error"
      });
      return;
    }

    if (id && microsoftTeamsIntegration) {
      if (!currentOrg) {
        return;
      }

      if (tenantId !== microsoftTeamsIntegration.tenantId) {
        createNotification({
          text: "테넌트 ID는 변경할 수 없습니다",
          type: "error"
        });
        return;
      }

      await updateMicrosoftTeamsIntegration({
        id,
        orgId: currentOrg.id,
        slug,
        description
      });

      createNotification({
        text: "Microsoft Teams 연동을 수정했습니다",
        type: "success"
      });

      onClose();
    } else {
      const csrfToken = crypto.randomBytes(32).toString("hex");
      localStorage.setItem("latestCSRFToken", csrfToken);

      const state = {
        redirectUri: `${window.location.origin}/organization/settings/oauth/callback`,
        tenantId,
        slug,
        description,
        csrfToken,
        clientId: microsoftTeamsClientId.clientId
      };

      const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?
      client_id=${microsoftTeamsClientId.clientId}
      &redirect_uri=${state.redirectUri}
      &response_type=code
      &response_mode=query
      &scope=https://graph.microsoft.com/.default
      &state=${encodeURIComponent(JSON.stringify(state))}
      &prompt=consent
      &admin_consent=true`;

      window.location.href = url;
    }
  };

  return (
    <form
      onSubmit={handleSubmit(handleMicrosoftTeamsFormSubmit)}
      className="flex flex-col gap-4"
      autoComplete="off"
    >
      <p className="text-xs text-muted">
        설치 전에 Microsoft Teams 테넌트에 Keydesk 봇이 설치되어 있는지 확인하세요. 다운로드 및 설치
        방법은{" "}
        <a
          className="text-org underline underline-offset-2"
          href="https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration"
          target="_blank"
          rel="noopener noreferrer"
        >
          문서
        </a>{" "}
        문서를 확인하세요.
      </p>
      <Controller
        control={control}
        name="slug"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="microsoft-teams-integration-alias">
              별칭 <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="microsoft-teams-integration-alias" isError={Boolean(error)} {...field} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      {!microsoftTeamsIntegration && (
        <Controller
          control={control}
          name="tenantId"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="microsoft-teams-integration-tenant-id">
                테넌트 ID <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="microsoft-teams-integration-tenant-id"
                isError={Boolean(error)}
                {...field}
              />
              <FieldError>{error?.message}</FieldError>
              <FieldDescription>연결할 Microsoft Teams 테넌트의 ID입니다.</FieldDescription>
            </Field>
          )}
        />
      )}
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="microsoft-teams-integration-description">설명</FieldLabel>
            <Input
              id="microsoft-teams-integration-description"
              isError={Boolean(error)}
              {...field}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      {microsoftTeamsIntegration && (
        <Field>
          <FieldLabel htmlFor="microsoft-teams-integration-tenant">
            연결된 Microsoft Teams 테넌트
          </FieldLabel>
          <Input
            id="microsoft-teams-integration-tenant"
            value={microsoftTeamsIntegration.tenantId}
            readOnly
          />
        </Field>
      )}
      <DialogFooter>
        {onBack && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}>
            <ChevronLeft />
            뒤로
          </Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            취소
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant={scopeVariant}
          isPending={isSubmitting}
          isDisabled={!isDirty || isSubmitting}
        >
          {id && microsoftTeamsIntegration ? "저장" : "Microsoft Teams 연결"}
        </Button>
      </DialogFooter>
    </form>
  );
};
