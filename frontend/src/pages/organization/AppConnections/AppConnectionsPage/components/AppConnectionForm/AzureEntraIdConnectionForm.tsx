import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
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
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AzureEntraIdConnectionMethod,
  TAzureEntraIdConnection
} from "@app/hooks/api/appConnections/types/azure-entra-id-connection";

import { CredentialRotationForm } from "./shared/CredentialRotationForm";
import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureEntraId),
  method: z.literal(AzureEntraIdConnectionMethod.ClientSecret),
  credentials: z.object({
    tenantId: z.string().trim().min(1, "테넌트 ID를 입력하세요"),
    clientId: z.string().trim().min(1, "클라이언트 ID를 입력하세요"),
    clientSecret: z.string().trim().min(1, "클라이언트 시크릿을 입력하세요"),
    clientSecretKeyId: z.string().trim().optional()
  })
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  appConnection?: TAzureEntraIdConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

export const AzureEntraIdConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();

  const defaultRotation = {
    rotationInterval: 30,
    rotateAtUtc: {
      hours: 0,
      minutes: 0
    }
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          name: appConnection.name,
          description: appConnection.description,
          app: AppConnection.AzureEntraId,
          method: AzureEntraIdConnectionMethod.ClientSecret,
          isAutoRotationEnabled: appConnection.isAutoRotationEnabled,
          rotation: appConnection.rotation ?? defaultRotation,
          credentials: {
            tenantId: appConnection.credentials.tenantId,
            clientId: appConnection.credentials.clientId,
            clientSecret: ""
          }
        }
      : {
          app: AppConnection.AzureEntraId,
          method: AzureEntraIdConnectionMethod.ClientSecret,
          isAutoRotationEnabled: false,
          rotation: defaultRotation,
          credentials: {
            tenantId: "",
            clientId: "",
            clientSecret: ""
          }
        }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  useAppConnectionFormDirtyState(isDirty);

  const scopeVariant = useScopeVariant();

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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.AzureEntraId].name}.
                    이 필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureEntraIdConnectionMethod).map((method) => {
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
              <FieldLabel htmlFor="credentials.clientId">
                클라이언트 ID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Azure 앱 등록의 애플리케이션(클라이언트) ID입니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
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
              <FieldLabel htmlFor="credentials.clientSecret">
                클라이언트 시크릿
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Azure 앱 등록의 클라이언트 시크릿입니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
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
                      Registrations &gt; Certificates &amp; Secrets에서 확인할 수 있습니다. 교체 후
                      Keydesk가 기존 시크릿을 폐기하는 데 필요합니다.
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

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty)}
          >
            {isUpdate ? "Azure에 다시 연결" : "Azure에 연결"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
            취소
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
