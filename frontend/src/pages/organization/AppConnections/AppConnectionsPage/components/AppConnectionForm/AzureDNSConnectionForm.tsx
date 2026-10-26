import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
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
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { TAzureDNSConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AzureDNSConnectionMethod } from "@app/hooks/api/appConnections/types/azure-dns-connection";

import { CredentialRotationForm } from "./shared/CredentialRotationForm";
import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAzureDNSConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureDNS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AzureDNSConnectionMethod.ClientSecret),
    credentials: z.object({
      tenantId: z.string().trim().min(1, "테넌트 ID를 입력하세요"),
      clientId: z.string().trim().min(1, "클라이언트 ID를 입력하세요"),
      clientSecret: z.string().trim().min(1, "클라이언트 시크릿을 입력하세요"),
      subscriptionId: z.string().trim().min(1, "구독 ID를 입력하세요"),
      clientSecretKeyId: z.string().trim().optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const defaultRotation = {
  rotationInterval: 30,
  rotateAtUtc: {
    hours: 0,
    minutes: 0
  }
};

export const AzureDNSConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          isAutoRotationEnabled: appConnection.isAutoRotationEnabled,
          rotation: appConnection.rotation ?? defaultRotation
        }
      : {
          app: AppConnection.AzureDNS,
          method: AzureDNSConnectionMethod.ClientSecret,
          isAutoRotationEnabled: false,
          rotation: defaultRotation,
          credentials: {
            tenantId: "",
            clientId: "",
            clientSecret: "",
            subscriptionId: ""
          }
        }
  });

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
              <FieldLabel>
                방식
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`연결 방식: ${
                      APP_CONNECTION_MAP[AppConnection.AzureDNS].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureDNSConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
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
          name="credentials.tenantId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="tenant-id">테넌트 ID</FieldLabel>
              <Input
                id="tenant-id"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="client-id">클라이언트 ID</FieldLabel>
              <Input
                id="client-id"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="client-secret">클라이언트 시크릿</FieldLabel>
              <SecretInput
                aria-describedby={error ? "client-secret-error" : undefined}
                id="client-secret"
                isError={Boolean(error)}
                placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="client-secret-error" errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.subscriptionId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="subscription-id">구독 ID</FieldLabel>
              <Input
                id="subscription-id"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <CredentialRotationForm>
          <Controller
            name="credentials.clientSecretKeyId"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="credentials.clientSecretKeyId">
                  클라이언트 시크릿 키 ID
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      위에서 입력한 클라이언트 시크릿의 키 ID입니다. Azure Portal의 App
                      Registrations &gt; Certificates &amp; Secrets에서 확인할 수 있습니다. 교체 후
                      Keydesk가 기존 시크릿을 폐기하는 데 필요합니다.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Input
                  id="credentials.clientSecretKeyId"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </CredentialRotationForm>
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "Azure DNS에 연결"} />
      </form>
    </FormProvider>
  );
};
