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
import {
  ExternalInfisicalConnectionMethod,
  TExternalInfisicalConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TExternalInfisicalConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ExternalInfisical)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("올바른 URL을 입력하세요")
        .min(1, "인스턴스 URL을 입력하세요"),
      machineIdentityClientId: z
        .string()
        .trim()
        .uuid("올바른 UUID를 입력하세요")
        .min(1, "클라이언트 ID를 입력하세요"),
      machineIdentityClientSecret: z.string().trim().min(1, "클라이언트 시크릿을 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const ExternalInfisicalConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            machineIdentityClientSecret: ""
          }
        }
      : {
          app: AppConnection.ExternalInfisical,
          method: ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth
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
              <FieldLabel htmlFor="method">
                방식
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`연결 방식: ${
                      APP_CONNECTION_MAP[AppConnection.ExternalInfisical].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(ExternalInfisicalConnectionMethod).map((method) => {
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
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="instance-url">
                인스턴스 URL
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    외부 Infisical 인스턴스의 기본 URL입니다(예: https://app.infisical.com)
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="instance-url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://app.infisical.com"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.machineIdentityClientId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="machine-identity-client-id">
                머신 ID의 클라이언트 ID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    외부 Infisical 인스턴스에서 Universal Auth가 구성된 머신 ID의 클라이언트
                    ID입니다
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="machine-identity-client-id"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="머신 ID의 클라이언트 ID를 입력하세요"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.machineIdentityClientSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="machine-identity-client-secret">
                머신 ID의 클라이언트 시크릿
              </FieldLabel>
              <SecretInput
                aria-describedby={error ? "machine-identity-client-secret-error" : undefined}
                isError={Boolean(error)}
                id="machine-identity-client-secret"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="machine-identity-client-secret-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "Infisical에 연결"} />
      </form>
    </FormProvider>
  );
};
