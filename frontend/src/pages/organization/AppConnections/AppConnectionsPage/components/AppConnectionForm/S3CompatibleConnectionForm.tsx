import { useMemo } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldDescription,
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
import { useServerConfig } from "@app/context";
import {
  APP_CONNECTION_MAP,
  getAppConnectionMethodDetails,
  getS3CompatibleProviderName
} from "@app/helpers/appConnections";
import { TS3CompatibleConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { S3CompatibleConnectionMethod } from "@app/hooks/api/appConnections/types/s3-compatible-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TS3CompatibleConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.S3Compatible)
});

const buildFormSchema = (allowedStorageHostnames: string[]) =>
  z.discriminatedUnion("method", [
    rootSchema.extend({
      method: z.literal(S3CompatibleConnectionMethod.AccessKey),
      credentials: z.object({
        endpoint: z
          .string()
          .trim()
          .min(1, "엔드포인트를 입력하세요")
          .refine(
            (endpoint) => Boolean(getS3CompatibleProviderName(endpoint, allowedStorageHostnames)),
            "버킷 이름을 제외한 지원 공급자의 S3 API 엔드포인트를 입력하세요"
          ),
        accessKeyId: z.string().trim().min(1, "액세스 키 ID를 입력하세요"),
        secretAccessKey: z.string().trim().min(1, "시크릿 액세스 키를 입력하세요"),
        region: z
          .string()
          .trim()
          .max(64, "리전은 64자를 초과할 수 없습니다")
          .regex(/^[a-zA-Z0-9_-]*$/, "리전에는 영문자, 숫자, 하이픈, 밑줄만 사용할 수 있습니다")
          .optional()
          .transform((region) => region || undefined)
      })
    })
  ]);

type FormData = z.infer<ReturnType<typeof buildFormSchema>>;

export const S3CompatibleConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { config } = useServerConfig();
  const allowedStorageHostnames = useMemo(
    () => config.allowedStorageHostnames ?? [],
    [config.allowedStorageHostnames]
  );
  const formSchema = useMemo(
    () => buildFormSchema(allowedStorageHostnames),
    [allowedStorageHostnames]
  );
  const supportedEndpoints = new Intl.ListFormat("en").format([
    "AWS S3",
    "Cloudflare R2",
    "Google Cloud Storage",
    "OCI Object Storage",
    ...allowedStorageHostnames
  ]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.S3Compatible,
      method: S3CompatibleConnectionMethod.AccessKey,
      credentials: {
        endpoint: "",
        accessKeyId: "",
        secretAccessKey: ""
      }
    }
  });

  const { handleSubmit, control, watch } = form;
  const endpointHost = getS3CompatibleProviderName(
    watch("credentials.endpoint") ?? "",
    allowedStorageHostnames
  );
  const isCustomHost = Boolean(endpointHost && allowedStorageHostnames.includes(endpointHost));

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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.S3Compatible].name}.
                    이 필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(S3CompatibleConnectionMethod).map((method) => {
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
          name="credentials.endpoint"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="endpoint">엔드포인트</FieldLabel>
              <Input
                id="endpoint"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://s3.us-east-1.amazonaws.com"
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                버킷 이름을 제외한 S3 API 엔드포인트입니다. 지원 공급자: {supportedEndpoints}.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {isCustomHost && (
          <Controller
            name="credentials.region"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="region">
                  리전 <span className="text-muted">(선택 사항)</span>
                </FieldLabel>
                <Input
                  id="region"
                  value={value ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="us-east-1"
                  isError={Boolean(error?.message)}
                />
                <FieldDescription>
                  서버에 us-east-1 이외의 리전이 필요한 경우에만 입력하세요.
                </FieldDescription>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}
        <Controller
          name="credentials.accessKeyId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="access-key-id">액세스 키 ID</FieldLabel>
              <Input
                id="access-key-id"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.secretAccessKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="secret-access-key">시크릿 액세스 키</FieldLabel>
              <SecretInput
                aria-describedby={error ? "secret-access-key-error" : undefined}
                id="secret-access-key"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="secret-access-key-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={
            isUpdate
              ? "인증 정보 수정"
              : `연결 대상: ${APP_CONNECTION_MAP[AppConnection.S3Compatible].name}`
          }
        />
      </form>
    </FormProvider>
  );
};
