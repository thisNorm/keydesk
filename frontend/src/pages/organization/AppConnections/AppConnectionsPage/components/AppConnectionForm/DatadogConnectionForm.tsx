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
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DatadogConnectionMethod,
  TDatadogConnection
} from "@app/hooks/api/appConnections/types/datadog-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDatadogConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Datadog)
});

const urlSchema = z
  .string()
  .trim()
  .url("올바른 Datadog URL을 입력하세요")
  .min(1, "URL을 입력하세요")
  .max(255);

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DatadogConnectionMethod.Token),
    credentials: z.object({
      url: urlSchema,
      token: z.string().trim().min(1, "토큰을 입력하세요")
    })
  }),
  rootSchema.extend({
    method: z.literal(DatadogConnectionMethod.ApiKey),
    credentials: z.object({
      url: urlSchema,
      apiKey: z.string().trim().min(1, "API 키를 입력하세요"),
      applicationKey: z.string().trim().min(1, "애플리케이션 키를 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DatadogConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Datadog,
      method: DatadogConnectionMethod.Token
    }
  });

  const { handleSubmit, control, watch } = form;

  const selectedMethod = watch("method");

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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.Datadog].name}. 이
                    필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(DatadogConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                      {method === DatadogConnectionMethod.Token ? " (Recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          name="credentials.url"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="url">
                Datadog URL
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    연결할 Datadog 사이트 URL입니다(예: https://api.datadoghq.com).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="url"
                {...field}
                placeholder="https://api.datadoghq.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        {selectedMethod === DatadogConnectionMethod.Token ? (
          <Controller
            name="credentials.token"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="token">서비스 액세스 토큰</FieldLabel>
                <SecretInput
                  aria-describedby={error ? "token-error" : undefined}
                  id="token"
                  isError={Boolean(error)}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
                <FieldError id="token-error" errors={[error]} />
              </Field>
            )}
          />
        ) : (
          <>
            <Controller
              name="credentials.apiKey"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="api-key">API 키</FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "api-key-error" : undefined}
                    id="api-key"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="api-key-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.applicationKey"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="application-key">애플리케이션 키</FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "application-key-error" : undefined}
                    id="application-key"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="application-key-error" errors={[error]} />
                </Field>
              )}
            />
          </>
        )}

        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "Datadog에 연결"} />
      </form>
    </FormProvider>
  );
};
