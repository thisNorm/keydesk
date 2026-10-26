import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
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
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects, useSubscription } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { SshConnectionMethod, TSshConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSshConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const configurationSchema = z.object({
  blockedUsers: z.string().trim().optional()
});

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.SSH),
  configuration: configurationSchema.optional()
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(SshConnectionMethod.Password),
    credentials: z.object({
      host: z.string().trim().min(1, "호스트를 입력하세요"),
      port: z.coerce.number().int().min(1).max(65535, "포트는 1~65535 사이여야 합니다"),
      username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
      password: z.string().trim().min(1, "비밀번호를 입력하세요")
    })
  }),
  rootSchema.extend({
    method: z.literal(SshConnectionMethod.SshKey),
    credentials: z.object({
      host: z.string().trim().min(1, "호스트를 입력하세요"),
      port: z.coerce.number().int().min(1).max(65535, "포트는 1~65535 사이여야 합니다"),
      username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
      privateKey: z.string().trim().min(1, "개인 키를 입력하세요"),
      passphrase: z.string().trim().optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const SshConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            ...(appConnection.method === SshConnectionMethod.Password
              ? { password: "" }
              : { privateKey: "", passphrase: "" })
          }
        }
      : {
          app: AppConnection.SSH,
          method: SshConnectionMethod.SshKey,
          gatewayId: null,
          gatewayPoolId: null,
          credentials: {
            host: "",
            port: 22,
            username: "",
            privateKey: ""
          }
        }
  });

  const { handleSubmit, control, watch, setValue } = form;

  const selectedMethod = watch("method");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const { subscription } = useSubscription();

  const handleMethodChange = (newMethod: SshConnectionMethod) => {
    const currentCredentials = form.getValues("credentials");

    if (newMethod === SshConnectionMethod.Password) {
      setValue("method", SshConnectionMethod.Password);
      setValue("credentials", {
        host: currentCredentials.host,
        port: currentCredentials.port,
        username: currentCredentials.username,
        password: ""
      });
    } else {
      setValue("method", SshConnectionMethod.SshKey);
      setValue("credentials", {
        host: currentCredentials.host,
        port: currentCredentials.port,
        username: currentCredentials.username,
        privateKey: "",
        passphrase: ""
      });
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Field className="mb-4">
                <FieldLabel>게이트웨이</FieldLabel>
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
                  {!isAllowed && (
                    <TooltipContent>
                      접근이 제한되었습니다. 리소스에 게이트웨이를 연결할 권한이 없습니다.
                    </TooltipContent>
                  )}
                </Tooltip>
              </Field>
            )}
          </OrgPermissionCan>
        )}
        <Controller
          name="method"
          control={control}
          render={({ field: { value }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                인증 방식
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    다음에 연결할 인증 방식입니다: {APP_CONNECTION_MAP[AppConnection.SSH].name}. 이
                    필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                disabled={isUpdate}
                value={value}
                onValueChange={(val) => handleMethodChange(val as SshConnectionMethod)}
              >
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(SshConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          <Controller
            name="credentials.host"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="ssh-host">호스트</FieldLabel>
                <Input
                  id="ssh-host"
                  {...field}
                  placeholder="호스트 이름 또는 IP 주소"
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
                <FieldLabel htmlFor="ssh-port">포트</FieldLabel>
                <Input
                  id="ssh-port"
                  {...field}
                  type="number"
                  placeholder="22"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <Controller
          name="credentials.username"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="ssh-username">사용자 이름</FieldLabel>
              <Input
                id="ssh-username"
                {...field}
                placeholder="SSH 사용자 이름"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {selectedMethod === SshConnectionMethod.Password ? (
          <Controller
            name="credentials.password"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="app-connection-ssh-password">비밀번호</FieldLabel>
                <SecretInput
                  aria-describedby={error ? "app-connection-ssh-password-error" : undefined}
                  id="app-connection-ssh-password"
                  isError={Boolean(error)}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
                <FieldError id="app-connection-ssh-password-error" errors={[error]} />
              </Field>
            )}
          />
        ) : (
          <>
            <Controller
              name="credentials.privateKey"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="app-connection-ssh-private-key">개인 키</FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "app-connection-ssh-private-key-error" : undefined}
                    id="app-connection-ssh-private-key"
                    isError={Boolean(error)}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  />
                  <FieldError id="app-connection-ssh-private-key-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.passphrase"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="app-connection-ssh-passphrase">
                    암호 문구 <span className="text-muted">(선택 사항)</span>
                  </FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "app-connection-ssh-passphrase-error" : undefined}
                    id="app-connection-ssh-passphrase"
                    isError={Boolean(error)}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="app-connection-ssh-passphrase-error" errors={[error]} />
                </Field>
              )}
            />
          </>
        )}
        <Controller
          name="configuration.blockedUsers"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                차단된 사용자 <span className="text-muted">(선택 사항)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    시크릿 교체 등의 작업에서 사용을 차단할 사용자 이름을 쉼표로 구분해
                    입력하세요(예: root,admin,ubuntu).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                placeholder="root,admin,ubuntu"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "SSH에 연결"} />
      </form>
    </FormProvider>
  );
};
