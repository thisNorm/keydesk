import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
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
  SheetFooter,
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
import {
  APP_CONNECTION_MAP,
  getAppConnectionMethodDetails,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useScopeVariant } from "@app/hooks";
import { useGetAppConnectionOption } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AzureKeyVaultConnectionMethod,
  TAzureKeyVaultConnection
} from "@app/hooks/api/appConnections/types/azure-key-vault-connection";

import { AzureKeyVaultFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { CredentialRotationForm } from "./shared/CredentialRotationForm";
import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type ClientSecretForm = z.infer<typeof clientSecretSchema>;
type CertificateForm = z.infer<typeof certificateSchema>;

type TInputFormData = ClientSecretForm | CertificateForm;

type Props = {
  appConnection?: TAzureKeyVaultConnection;
  onSubmit: (formData: TInputFormData) => Promise<void>;
  projectId: string | undefined | null;
};

const baseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureKeyVault),
  method: z.nativeEnum(AzureKeyVaultConnectionMethod)
});

const oauthSchema = baseSchema.extend({
  tenantId: z.string().trim().min(1, "테넌트 ID를 입력하세요"),
  method: z.literal(AzureKeyVaultConnectionMethod.OAuth)
});

const clientSecretSchema = baseSchema.extend({
  method: z.literal(AzureKeyVaultConnectionMethod.ClientSecret),
  credentials: z.object({
    clientSecret: z.string().trim().min(1, "클라이언트 시크릿을 입력하세요"),
    clientId: z.string().trim().min(1, "클라이언트 ID를 입력하세요"),
    tenantId: z.string().trim().min(1, "테넌트 ID를 입력하세요"),
    clientSecretKeyId: z.string().trim().optional()
  })
});

const certificateSchema = baseSchema.extend({
  method: z.literal(AzureKeyVaultConnectionMethod.Certificate),
  credentials: z.object({
    clientId: z.string().trim().min(1, "클라이언트 ID를 입력하세요"),
    certificateBody: z.string().trim().min(1, "인증서를 입력하세요"),
    privateKey: z.string().trim().min(1, "개인 키를 입력하세요"),
    tenantId: z.string().trim().min(1, "테넌트 ID를 입력하세요")
  })
});

const formSchema = z.discriminatedUnion("method", [
  oauthSchema,
  clientSecretSchema,
  certificateSchema
]);

type FormData = z.infer<typeof formSchema>;

const getDefaultValues = (appConnection?: TAzureKeyVaultConnection): Partial<FormData> => {
  const defaultRotation = {
    rotationInterval: 30,
    rotateAtUtc: {
      hours: 0,
      minutes: 0
    }
  };

  if (!appConnection) {
    return {
      app: AppConnection.AzureKeyVault,
      method: AzureKeyVaultConnectionMethod.OAuth,
      isAutoRotationEnabled: false,
      rotation: defaultRotation,
      gatewayId: null,
      gatewayPoolId: null
    };
  }

  const base = {
    name: appConnection.name,
    description: appConnection.description,
    app: appConnection.app,
    method: appConnection.method,
    isAutoRotationEnabled: appConnection.isAutoRotationEnabled,
    rotation: appConnection.rotation ?? defaultRotation,
    gatewayId: appConnection.gatewayId,
    gatewayPoolId: appConnection.gatewayPoolId
  };
  const { credentials } = appConnection;

  switch (appConnection.method) {
    case AzureKeyVaultConnectionMethod.OAuth:
      if ("tenantId" in credentials) {
        return {
          ...base,
          method: AzureKeyVaultConnectionMethod.OAuth,
          tenantId: credentials.tenantId
        };
      }
      break;
    case AzureKeyVaultConnectionMethod.ClientSecret:
      if ("clientId" in credentials && "tenantId" in credentials) {
        return {
          ...base,
          method: AzureKeyVaultConnectionMethod.ClientSecret,
          credentials: {
            clientId: credentials.clientId,
            tenantId: credentials.tenantId,
            clientSecret: ""
          }
        };
      }
      break;
    case AzureKeyVaultConnectionMethod.Certificate:
      if ("clientId" in credentials && "tenantId" in credentials) {
        return {
          ...base,
          method: AzureKeyVaultConnectionMethod.Certificate,
          credentials: {
            clientId: credentials.clientId,
            tenantId: credentials.tenantId,
            certificateBody: "",
            privateKey: ""
          }
        };
      }
      break;
    default:
      return base;
  }

  return base;
};

export const AzureKeyVaultConnectionForm = ({ appConnection, onSubmit, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureKeyVault);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  useAppConnectionFormDirtyState(isDirty);

  const scopeVariant = useScopeVariant();

  const selectedMethod = watch("method");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  const { subscription } = useSubscription();

  const onSubmitHandler = async (formData: FormData) => {
    const state = crypto.randomBytes(16).toString("hex");

    switch (formData.method) {
      case AzureKeyVaultConnectionMethod.OAuth:
        setIsRedirecting(true);
        localStorage.setItem("latestCSRFToken", state);
        localStorage.setItem(
          "azureKeyVaultConnectionFormData",
          JSON.stringify({
            ...formData,
            connectionId: appConnection?.id,
            projectId,
            returnUrl
          } as AzureKeyVaultFormData)
        );
        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://vault.azure.net/.default%20openid%20offline_access&state=${state}<:>azure-key-vault`
        );
        break;
      case AzureKeyVaultConnectionMethod.ClientSecret:
        await onSubmit(formData);
        break;
      case AzureKeyVaultConnectionMethod.Certificate:
        await onSubmit(formData);
        break;
      default:
        throw new Error(`지원되지 않는 Azure 연결 방식: ${(formData as FormData).method}`);
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case AzureKeyVaultConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case AzureKeyVaultConnectionMethod.ClientSecret:
      isMissingConfig = false;
      break;
    case AzureKeyVaultConnectionMethod.Certificate:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`지원되지 않는 Azure 연결 방식: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmitHandler)}>
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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.AzureKeyVault].name}
                    . 이 필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger
                  id="method"
                  className="w-full"
                  isError={Boolean(error) || isMissingConfig}
                >
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureKeyVaultConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError>
                {!isLoading && isMissingConfig
                  ? `환경 변수가 구성되지 않았습니다. ${
                      isInfisicalCloud()
                        ? "Keydesk 관리자에게 문의하세요."
                        : `문서를 확인해 Azure 연결을 구성하세요: ${methodDetails.name} 연결입니다.`
                    }`
                  : error?.message}
              </FieldError>
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

        {selectedMethod === AzureKeyVaultConnectionMethod.OAuth && (
          <Controller
            name="tenantId"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="tenantId">
                  테넌트 ID
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      Azure Active Directory(Entra ID)의 테넌트 ID입니다.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Input
                  {...field}
                  id="tenantId"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}

        {/* Client Secret-specific fields */}
        {selectedMethod === AzureKeyVaultConnectionMethod.ClientSecret && (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.tenantId">
                    테넌트 ID
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Azure Active Directory(Entra ID)의 테넌트 ID입니다.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.tenantId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.clientId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientId">클라이언트 ID</FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.clientSecret"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientSecret">클라이언트 시크릿</FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientSecret"
                    type="password"
                    placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <CredentialRotationForm>
              <Controller
                name="credentials.clientSecretKeyId"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="credentials.clientSecretKeyId">
                      클라이언트 시크릿 키 ID
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          위에서 입력한 클라이언트 시크릿의 키 ID입니다. Azure Portal의 App
                          Registrations &gt; Certificates &amp; Secrets에서 확인할 수 있습니다. 교체
                          후 Keydesk가 기존 시크릿을 폐기하는 데 필요합니다.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="credentials.clientSecretKeyId"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </CredentialRotationForm>
          </>
        )}

        {/* Certificate-specific fields */}
        {selectedMethod === AzureKeyVaultConnectionMethod.Certificate && (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.tenantId">
                    테넌트 ID
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Azure Active Directory(Entra ID)의 테넌트 ID입니다.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.tenantId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.clientId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientId">클라이언트 ID</FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.certificateBody"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.certificateBody">
                    인증서
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Azure 앱 등록에 업로드한 PEM 형식의 공개 인증서입니다.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "credentials.certificateBody-error" : undefined}
                    id="credentials.certificateBody"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                  />
                  <FieldError id="credentials.certificateBody-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.privateKey"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.privateKey">
                    개인 키
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        인증서와 일치하는 PEM 형식의 개인 키입니다. 개인 키는 Azure로 전송되지
                        않으며 클라이언트 어설션에 로컬로 서명하는 데만 사용됩니다.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "credentials.privateKey-error" : undefined}
                    id="credentials.privateKey"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="-----BEGIN PRIVATE KEY-----..."
                  />
                  <FieldError id="credentials.privateKey-error" errors={[error]} />
                </Field>
              )}
            />
          </>
        )}

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting || isRedirecting}
            isDisabled={
              isSubmitting ||
              (!isUpdate && !isDirty && selectedMethod !== AzureKeyVaultConnectionMethod.OAuth) ||
              isMissingConfig ||
              isRedirecting
            }
          >
            {isUpdate ? "Azure에 다시 연결" : "Azure에 연결"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            isDisabled={isSubmitting || isRedirecting}
          >
            취소
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
