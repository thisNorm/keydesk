import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects, useSubscription } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  SMB_DOMAIN_REGEX,
  SMB_HOSTNAME_REGEX,
  SMB_USERNAME_REGEX,
  SMB_VALIDATION_LIMITS,
  validateSmbPassword
} from "@app/helpers/smb";
import { SmbConnectionMethod, TSmbConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSmbConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.SMB),
  method: z.literal(SmbConnectionMethod.Credentials),
  credentials: z.object({
    host: z
      .string()
      .trim()
      .min(1, "호스트를 입력하세요")
      .max(SMB_VALIDATION_LIMITS.MAX_HOST_LENGTH, "호스트가 너무 깁니다")
      .refine((val) => SMB_HOSTNAME_REGEX.test(val), {
        message: "호스트에는 영문자, 숫자, 점, 하이픈만 사용할 수 있습니다"
      })
      .refine((val) => !val.startsWith("-") && !val.startsWith("."), {
        message: "호스트는 하이픈이나 점으로 시작할 수 없습니다"
      }),
    port: z.coerce.number().int().min(1).max(65535, "포트는 1~65535 사이여야 합니다"),
    domain: z
      .string()
      .trim()
      .max(SMB_VALIDATION_LIMITS.MAX_DOMAIN_LENGTH, "도메인이 너무 깁니다")
      .refine((val) => val === "" || SMB_DOMAIN_REGEX.test(val), {
        message: "도메인에는 영문자, 숫자, 점, 하이픈, 밑줄만 사용할 수 있습니다"
      })
      .refine((val) => val === "" || (!val.startsWith("-") && !val.startsWith(".")), {
        message: "도메인은 하이픈이나 점으로 시작할 수 없습니다"
      })
      .optional(),
    username: z
      .string()
      .trim()
      .min(1, "사용자 이름을 입력하세요")
      .max(SMB_VALIDATION_LIMITS.MAX_ADMIN_USERNAME_LENGTH, "사용자 이름이 너무 깁니다")
      .refine((val) => SMB_USERNAME_REGEX.test(val), {
        message: "사용자 이름에는 영문자, 숫자, 밑줄, 하이픈, 점만 사용할 수 있습니다"
      })
      .refine((val) => !val.startsWith("-") && !val.startsWith(".") && !val.endsWith("."), {
        message: "사용자 이름은 하이픈이나 점으로 시작할 수 없으며 점으로 끝날 수 없습니다"
      }),
    password: z
      .string()
      .min(1, "비밀번호를 입력하세요")
      .refine((val) => validateSmbPassword(val), {
        message: "비밀번호에는 세미콜론, 공백, 따옴표, 파이프를 사용할 수 없습니다"
      })
  })
});

type FormData = z.infer<typeof formSchema>;

export const SmbConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            password: ""
          }
        }
      : {
          app: AppConnection.SMB,
          method: SmbConnectionMethod.Credentials,
          gatewayId: null,
          gatewayPoolId: null,
          credentials: {
            host: "",
            port: 445,
            domain: "",
            username: "",
            password: ""
          }
        }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const { subscription } = useSubscription();

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => {
              const picker = (
                <div>
                  <GatewayPicker
                    isDisabled={!isAllowed}
                    value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                    onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                      setValue("gatewayId", newGwId, { shouldDirty: true });
                      setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                    }}
                  />
                </div>
              );

              return (
                <Field className="mb-4">
                  <FieldLabel htmlFor="gateway">게이트웨이</FieldLabel>
                  {isAllowed ? (
                    picker
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>{picker}</TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        접근이 제한되었습니다. 리소스에 게이트웨이를 연결할 권한이 없습니다.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </Field>
              );
            }}
          </OrgPermissionCan>
        )}
        <Controller
          name="credentials.host"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="host">호스트</FieldLabel>
              <Input
                id="host"
                {...field}
                placeholder="Windows 서버의 호스트 이름 또는 IP 주소"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.port"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="port">포트</FieldLabel>
              <Input
                id="port"
                type="number"
                value={value}
                onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 445)}
                placeholder="445"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.domain"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="domain">
                도메인 <span className="text-muted">(선택 사항)</span>
              </FieldLabel>
              <Input
                id="domain"
                {...field}
                placeholder="예: MYDOMAIN(도메인에 가입된 서버)"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.username"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="username">사용자 이름</FieldLabel>
              <Input
                id="username"
                {...field}
                placeholder="관리자"
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
                id="password"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="password-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={
            isUpdate ? "인증 정보 수정" : `연결 대상: ${APP_CONNECTION_MAP[AppConnection.SMB].name}`
          }
        />
      </form>
    </FormProvider>
  );
};
