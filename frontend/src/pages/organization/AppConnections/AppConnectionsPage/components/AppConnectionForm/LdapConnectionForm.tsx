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
import { OrgPermissionSubjects, useSubscription } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { DistinguishedNameRegex, UserPrincipalNameRegex } from "@app/helpers/string";
import { useScopeVariant } from "@app/hooks";
import {
  LdapConnectionMethod,
  LdapConnectionProvider,
  TLdapConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { CredentialRotationForm } from "./shared/CredentialRotationForm";
import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TLdapConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.LDAP)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(LdapConnectionMethod.SimpleBind),
    credentials: z.object({
      provider: z.nativeEnum(LdapConnectionProvider),
      url: z
        .string()
        .regex(/^ldaps?:\/\//, '"ldaps://" 또는 "ldap://"로 시작해야 합니다')
        .url()
        .trim()
        .min(1, "LDAP URL을 입력하세요"),
      dn: z
        .string()
        .trim()
        .min(1, "DN/UPN을 입력하세요")
        .refine(
          (value) => DistinguishedNameRegex.test(value) || UserPrincipalNameRegex.test(value),
          {
            message: "올바른 DN/UPN 형식을 입력하세요"
          }
        ),
      password: z.string().trim().min(1, "비밀번호를 입력하세요"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const LdapConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          isAutoRotationEnabled: appConnection.isAutoRotationEnabled ?? false,
          rotation: appConnection.rotation ?? {
            rotationInterval: 30,
            rotateAtUtc: { hours: 0, minutes: 0 }
          }
        }
      : {
          app: AppConnection.LDAP,
          method: LdapConnectionMethod.SimpleBind,
          gatewayId: null,
          gatewayPoolId: null,
          isAutoRotationEnabled: false,
          rotation: {
            rotationInterval: 30,
            rotateAtUtc: { hours: 0, minutes: 0 }
          },
          credentials: {
            provider: LdapConnectionProvider.ActiveDirectory,
            url: "",
            dn: "",
            password: "",
            sslRejectUnauthorized: true,
            sslCertificate: undefined
          }
        }
  });

  const { handleSubmit, control, setValue, watch } = form;
  const scopeVariant = useScopeVariant();

  const selectedProvider = watch("credentials.provider");
  const sslEnabled = watch("credentials.url")?.startsWith("ldaps://") ?? false;
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const { subscription } = useSubscription();

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTab("configuration");
          handleSubmit(onSubmit)(e);
        }}
      >
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Field className="mb-4">
                <FieldLabel>게이트웨이</FieldLabel>
                {isAllowed ? (
                  <GatewayPicker
                    isDisabled={!isAllowed}
                    value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                    onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                      setValue("gatewayId", newGwId, { shouldDirty: true });
                      setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                    }}
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <GatewayPicker
                          isDisabled={!isAllowed}
                          value={{
                            gatewayId: gatewayId ?? null,
                            gatewayPoolId: gatewayPoolId ?? null
                          }}
                          onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                            setValue("gatewayId", newGwId, { shouldDirty: true });
                            setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                          }}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      접근이 제한되었습니다. 리소스에 게이트웨이를 연결할 권한이 없습니다.
                    </TooltipContent>
                  </Tooltip>
                )}
              </Field>
            )}
          </OrgPermissionCan>
        )}
        <div className="grid grid-cols-2 items-center gap-2">
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
                        APP_CONNECTION_MAP[AppConnection.LDAP].name
                      }. 이 필드는 생성 후 변경할 수 없습니다.`}
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                  <SelectTrigger className="w-full" isError={Boolean(error)}>
                    <SelectValue placeholder="방식을 선택하세요..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(LdapConnectionMethod).map((method) => {
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
            name="credentials.provider"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel>LDAP 공급자</FieldLabel>
                <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                  <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                    <SelectValue placeholder="공급자를 선택하세요..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(LdapConnectionProvider).map((provider) => {
                      return (
                        <SelectItem value={provider} className="capitalize" key={provider}>
                          {provider.replace("-", " ")}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
          <TabsList variant={scopeVariant}>
            <TabsTrigger value="configuration">구성</TabsTrigger>
            <TabsTrigger value="ssl">SSL ({sslEnabled ? "켜짐" : "꺼짐"})</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <Controller
              name="credentials.url"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials-url">LDAP URL</FieldLabel>
                  <Input
                    id="credentials-url"
                    {...field}
                    placeholder="ldap://domain-or-ip:389"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <Controller
                name="credentials.dn"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="credentials-dn">바인딩 DN/UPN</FieldLabel>
                    <Input
                      id="credentials-dn"
                      {...field}
                      placeholder="CN=John,OU=Users,DC=example,DC=com"
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
                    <FieldLabel htmlFor="app-connection-ldap-password">바인딩 비밀번호</FieldLabel>
                    <SecretInput
                      aria-describedby={error ? "app-connection-ldap-password-error" : undefined}
                      id="app-connection-ldap-password"
                      isError={Boolean(error)}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                    />
                    <FieldError id="app-connection-ldap-password-error" errors={[error]} />
                  </Field>
                )}
              />
            </div>
            <CredentialRotationForm />
          </TabsContent>
          <TabsContent value="ssl">
            <p className="mb-3 text-xs text-muted">ldaps:// URL이 필요합니다</p>
            <Controller
              name="credentials.sslCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className={sslEnabled ? "mb-4" : "mb-4 opacity-50"}>
                  <FieldLabel htmlFor="ssl-certificate">
                    SSL 인증서 <span className="text-muted">(선택 사항)</span>
                  </FieldLabel>
                  <TextArea
                    id="ssl-certificate"
                    className="h-[3.6rem] resize-none!"
                    {...field}
                    disabled={!sslEnabled}
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
                <Field className={sslEnabled ? undefined : "opacity-50"}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="ssl-reject-unauthorized">신뢰할 수 없는 인증서 거부</Label>
                      <FieldDescription>
                        켜면 서버가 유효하고 신뢰할 수 있는 SSL 인증서를 제공할 때만 Keydesk가
                        연결합니다.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle
                      aria-invalid={Boolean(error)}
                      id="ssl-reject-unauthorized"
                      variant={scopeVariant}
                      checked={sslEnabled ? value : false}
                      onCheckedChange={onChange}
                      disabled={!sslEnabled}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
        </Tabs>
        <AppConnectionFormFooter
          submitLabel={
            isUpdate
              ? "인증 정보 수정"
              : `연결 대상: ${selectedProvider
                  .replace("-", " ")
                  .replace(/\b\w/g, (char) => char.toUpperCase())}`
          }
        />
      </form>
    </FormProvider>
  );
};
