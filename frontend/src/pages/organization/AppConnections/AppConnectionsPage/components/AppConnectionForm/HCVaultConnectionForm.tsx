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
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { HCVaultConnectionMethod, THCVaultConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: THCVaultConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.HCVault)
});

const InstanceUrlSchema = z
  .string()
  .trim()
  .min(1, "인스턴스 URL을 입력하세요")
  .url("올바른 인스턴스 URL을 입력하세요");

const NamespaceSchema = z.string().trim().optional();

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AccessToken),
    credentials: z.object({
      instanceUrl: InstanceUrlSchema,
      namespace: NamespaceSchema,
      accessToken: z.string().trim().min(1, "액세스 토큰을 입력하세요")
    })
  }),
  rootSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AppRole),
    credentials: z.object({
      instanceUrl: InstanceUrlSchema,
      namespace: NamespaceSchema,
      roleId: z.string().trim().min(1, "역할 ID를 입력하세요"),
      secretId: z.string().trim().min(1, "시크릿 ID를 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const HCVaultConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.HCVault,
      method: HCVaultConnectionMethod.AppRole,
      gatewayId: null,
      gatewayPoolId: null
    }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const selectedMethod = watch("method");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  const { subscription } = useSubscription();

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
                      APP_CONNECTION_MAP[AppConnection.HCVault].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(HCVaultConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
                        {method === HCVaultConnectionMethod.AppRole ? " (Recommended)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
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
        <Controller
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-instance-url">
                인스턴스 URL
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    HashiCorp Vault 인스턴스가 호스팅되는 URL입니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-instance-url"
                {...field}
                placeholder="https://vault.example.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.namespace"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-namespace">
                네임스페이스 <span className="text-muted">(선택 사항)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    직접 호스팅하는 클러스터나 엔터프라이즈 클러스터에는 네임스페이스가 없을 수
                    있습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-namespace"
                {...field}
                placeholder="admin"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {selectedMethod === HCVaultConnectionMethod.AccessToken ? (
          <Controller
            name="credentials.accessToken"
            control={control}
            shouldUnregister
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="app-connection-hcvault-access-token">액세스 토큰</FieldLabel>
                <SecretInput
                  aria-describedby={error ? "app-connection-hcvault-access-token-error" : undefined}
                  id="app-connection-hcvault-access-token"
                  isError={Boolean(error)}
                  {...field}
                />
                <FieldError id="app-connection-hcvault-access-token-error" errors={[error]} />
              </Field>
            )}
          />
        ) : (
          <>
            <Controller
              name="credentials.roleId"
              control={control}
              shouldUnregister
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials-role-id">역할 ID</FieldLabel>
                  <Input
                    id="credentials-role-id"
                    {...field}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.secretId"
              control={control}
              shouldUnregister
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="app-connection-hcvault-secret-id">시크릿 ID</FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "app-connection-hcvault-secret-id-error" : undefined}
                    id="app-connection-hcvault-secret-id"
                    isError={Boolean(error)}
                    {...field}
                  />
                  <FieldError id="app-connection-hcvault-secret-id-error" errors={[error]} />
                </Field>
              )}
            />
          </>
        )}
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "인증 정보 수정" : "Hashicorp Vault에 연결"}
        />
      </form>
    </FormProvider>
  );
};
