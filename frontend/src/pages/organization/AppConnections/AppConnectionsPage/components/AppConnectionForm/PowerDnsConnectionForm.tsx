import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { TPowerDnsConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PowerDnsConnectionMethod } from "@app/hooks/api/appConnections/types/powerdns-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TPowerDnsConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.PowerDns)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(PowerDnsConnectionMethod.ApiKey),
    credentials: z.object({
      apiUrl: z
        .string()
        .trim()
        .url("올바른 API URL을 입력하세요")
        .max(512, "API URL은 512자를 초과할 수 없습니다")
        .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
          message: "API URL은 http 또는 https를 사용해야 합니다"
        })
        .refine((value) => !new URL(value).search && !new URL(value).hash, {
          message: "API URL에는 쿼리 문자열이나 프래그먼트를 포함할 수 없습니다"
        })
        .refine((value) => !/\/api(\/v\d+)?\/*$/.test(new URL(value).pathname), {
          message: "/api/v1 경로를 제외한 웹 서버 주소만 입력하세요"
        }),
      apiKey: z
        .string()
        .trim()
        .min(1, "API 키를 입력하세요")
        .max(512, "API 키는 512자를 초과할 수 없습니다"),
      serverId: z
        .string()
        .trim()
        .max(64, "서버 ID는 64자를 초과할 수 없습니다")
        .refine((value) => !value || /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value), {
          message: "서버 ID에는 영문자, 숫자, 점, 하이픈, 밑줄만 사용할 수 있습니다"
        })
        .refine((value) => !value.includes(".."), {
          message: "서버 ID에는 '..'를 사용할 수 없습니다"
        })
        .transform((value) => value || undefined)
        .optional(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .max(8192, "SSL 인증서는 8192자를 초과할 수 없습니다")
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const normalizeApiUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/api(\/v\d+)?\/*$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
};

export const PowerDnsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.PowerDns,
      method: PowerDnsConnectionMethod.ApiKey,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;
  const scopeVariant = useScopeVariant();

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => {
            const picker = (
              <GatewayPicker
                isDisabled={!isAllowed}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                  setValue("gatewayId", newGwId, { shouldDirty: true });
                  setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                }}
              />
            );

            return (
              <Field className="mb-4">
                <FieldLabel>게이트웨이</FieldLabel>
                <FieldDescription>
                  인터넷에서 PowerDNS 서버에 접근할 수 없다면 게이트웨이를 통해 요청을 전달하세요.
                </FieldDescription>
                {isAllowed ? (
                  picker
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block w-full cursor-not-allowed">{picker}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      접근이 제한되었습니다. 리소스에 게이트웨이를 연결할 권한이 없습니다.
                    </TooltipContent>
                  </Tooltip>
                )}
              </Field>
            );
          }}
        </OrgPermissionCan>
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
                      APP_CONNECTION_MAP[AppConnection.PowerDns].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(PowerDnsConnectionMethod).map((m) => {
                    return (
                      <SelectItem value={m} key={m}>
                        {getAppConnectionMethodDetails(m).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
          <TabsList variant={scopeVariant}>
            <TabsTrigger value="configuration">구성</TabsTrigger>
            <TabsTrigger value="ssl">SSL</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <Controller
              name="credentials.apiUrl"
              control={control}
              render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="api-url">API URL</FieldLabel>
                  <FieldDescription>
                    /api/v1 경로를 제외한 PowerDNS 웹 서버의 주소입니다.
                  </FieldDescription>
                  <Input
                    id="api-url"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => {
                      onChange(normalizeApiUrl(e.target.value));
                      onBlur();
                    }}
                    placeholder="https://pdns.example.com:8081"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.apiKey"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="api-key">API 키</FieldLabel>
                  <FieldDescription>PowerDNS 구성의 api-key 설정 값입니다.</FieldDescription>
                  <SecretInput
                    aria-describedby={error ? "api-key-error" : undefined}
                    isError={Boolean(error)}
                    id="api-key"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="api-key-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.serverId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="server-id">
                    서버 ID <span className="text-muted">(선택 사항)</span>
                  </FieldLabel>
                  <FieldDescription>
                    여러 PowerDNS 서버 앞에 있는 프록시로 연결하는 경우에만 입력하세요. PowerDNS
                    Authoritative Server는 항상 localhost를 반환합니다.
                  </FieldDescription>
                  <Input
                    id="server-id"
                    {...field}
                    value={field.value ?? ""}
                    placeholder="localhost"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
          <TabsContent value="ssl">
            <Controller
              name="credentials.sslCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="ssl-certificate">
                    SSL 인증서 <span className="text-muted">(선택 사항)</span>
                  </FieldLabel>
                  <TextArea
                    id="ssl-certificate"
                    className="h-[3.6rem] resize-none!"
                    {...field}
                    placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.sslRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="ssl-reject-unauthorized">신뢰할 수 없는 인증서 거부</Label>
                      <FieldDescription>
                        켜면 PowerDNS가 유효하고 신뢰할 수 있는 SSL 인증서를 제공할 때만 Keydesk가
                        연결합니다. 자체 서명 인증서를 사용한다면 이 옵션을 끄거나 위에 CA 인증서를
                        입력하세요.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle
                      aria-invalid={Boolean(error)}
                      id="ssl-reject-unauthorized"
                      variant={scopeVariant}
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
        </Tabs>
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "PowerDNS에 연결"} />
      </form>
    </FormProvider>
  );
};
