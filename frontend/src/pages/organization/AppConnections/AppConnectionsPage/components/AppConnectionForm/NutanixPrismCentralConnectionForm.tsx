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
import {
  NutanixPrismCentralConnectionMethod,
  TNutanixPrismCentralConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TNutanixPrismCentralConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.NutanixPrismCentral)
});

const credentialsBase = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "호스트 이름을 입력하세요")
    .max(512, "호스트 이름은 512자를 초과할 수 없습니다")
    .refine(
      (val) =>
        !val.includes("/") &&
        !val.includes("@") &&
        !val.includes("?") &&
        !val.includes(":") &&
        !val.includes("#"),
      { message: "호스트 이름에는 /, @, ?, :, # 문자를 사용할 수 없습니다" }
    ),
  port: z
    .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.ApiKey),
    credentials: credentialsBase.extend({
      apiKey: z
        .string()
        .trim()
        .regex(/^[0-9a-f]{32}$/, "API 키는 소문자 16진수 32자리여야 합니다")
    })
  }),
  rootSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.BasicAuth),
    credentials: credentialsBase.extend({
      username: z
        .string()
        .trim()
        .min(1, "사용자 이름을 입력하세요")
        .max(256, "사용자 이름은 256자를 초과할 수 없습니다"),
      password: z
        .string()
        .trim()
        .min(1, "비밀번호를 입력하세요")
        .max(512, "비밀번호는 512자를 초과할 수 없습니다")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const NutanixPrismCentralConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.NutanixPrismCentral,
      method: NutanixPrismCentralConnectionMethod.BasicAuth,
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

  const method = watch("method");
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
                      APP_CONNECTION_MAP[AppConnection.NutanixPrismCentral].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(NutanixPrismCentralConnectionMethod).map((m) => {
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
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Controller
                name="credentials.hostname"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="hostname">호스트 이름</FieldLabel>
                    <Input
                      id="hostname"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="예: prism.example.com"
                      isError={Boolean(error?.message)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.port"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="port">
                      포트 <span className="text-muted">(선택 사항)</span>
                    </FieldLabel>
                    <Input
                      id="port"
                      type="number"
                      placeholder="9440"
                      {...field}
                      value={field.value ?? ""}
                      className="w-24"
                      isError={Boolean(error?.message)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </div>
            {method === NutanixPrismCentralConnectionMethod.ApiKey && (
              <Controller
                name="credentials.apiKey"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="api-key">
                      API 키
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          SSL 인증서를 관리할 권한이 있는 Nutanix API 키입니다.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
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
            )}
            {method === NutanixPrismCentralConnectionMethod.BasicAuth && (
              <div className="grid grid-cols-2 gap-2">
                <Controller
                  name="credentials.username"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field className="mb-4">
                      <FieldLabel htmlFor="username">사용자 이름</FieldLabel>
                      <Input
                        id="username"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="admin"
                        isError={Boolean(error?.message)}
                      />
                      <FieldError errors={[error]} />
                    </Field>
                  )}
                />
                <Controller
                  name="credentials.password"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field className="mb-4">
                      <FieldLabel htmlFor="password">비밀번호</FieldLabel>
                      <SecretInput
                        aria-describedby={error ? "password-error" : undefined}
                        isError={Boolean(error)}
                        id="password"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                      />
                      <FieldError id="password-error" errors={[error]} />
                    </Field>
                  )}
                />
              </div>
            )}
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
                        켜면 Prism Central이 유효하고 신뢰할 수 있는 SSL 인증서를 제공할 때만
                        Keydesk가 연결합니다. 자체 서명 인증서를 사용한다면 이 옵션을 끄거나 위에 CA
                        인증서를 입력하세요.
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
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "인증 정보 수정" : "Nutanix Prism Central에 연결"}
        />
      </form>
    </FormProvider>
  );
};
