import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CopyIcon, Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useToggle } from "@app/hooks";
import { GcpConnectionMethod, TGcpConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGcpConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GCP)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
    credentials: z.object({
      serviceAccountEmail: z.string().email().trim().min(1, "서비스 계정 이메일을 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const GcpConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.GCP,
      method: GcpConnectionMethod.ServiceAccountImpersonation
    }
  });
  const { currentOrg } = useOrganization();

  const [isCopied, { timedToggle: toggleIsCopied }] = useToggle(false);
  const expectedAccountIdSuffix = currentOrg.id.split("-").slice(0, 2).join("-");

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="method">
                방식
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`연결 방식: ${
                      APP_CONNECTION_MAP[AppConnection.GCP].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GcpConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.serviceAccountEmail"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="group mb-4">
              <FieldLabel htmlFor="service-account-email">서비스 계정 이메일</FieldLabel>
              <SecretInput
                aria-describedby={
                  error
                    ? "service-account-email-description service-account-email-error"
                    : "service-account-email-description"
                }
                isError={Boolean(error)}
                id="service-account-email"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              {!error && (
                <FieldDescription id="service-account-email-description">
                  <span className="block">
                    {`서비스 계정 ID에 필요한 접미사: "${expectedAccountIdSuffix}"`}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconButton
                          variant="ghost-muted"
                          size="xs"
                          aria-label="복사"
                          onClick={() => {
                            if (isCopied) {
                              return;
                            }

                            navigator.clipboard.writeText(expectedAccountIdSuffix);

                            createNotification({
                              text: "클립보드에 복사했습니다",
                              type: "info"
                            });

                            toggleIsCopied(2000);
                          }}
                          className="ml-1"
                        >
                          {isCopied ? (
                            <CheckIcon className="size-4" />
                          ) : (
                            <CopyIcon className="size-4" />
                          )}
                        </IconButton>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">복사</TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="block">
                    예:
                    <span className="ml-1">service-account-</span>
                    <span className="font-medium">{expectedAccountIdSuffix}</span>
                    <span>@my-project.iam.gserviceaccount.com</span>
                  </span>
                </FieldDescription>
              )}
              <FieldError id="service-account-email-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "GCP에 연결"} />
      </form>
    </FormProvider>
  );
};
