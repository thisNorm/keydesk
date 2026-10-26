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
import { TWinRMConnection, WinRMConnectionMethod } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TWinRMConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.WinRM)
});

const formSchema = z
  .discriminatedUnion("method", [
    rootSchema.extend({
      method: z.literal(WinRMConnectionMethod.UsernamePassword),
      credentials: z.object({
        host: z.string().trim().min(1, "호스트를 입력하세요"),
        port: z.coerce.number().int().min(1).max(65535),
        username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
        password: z.string().min(1, "비밀번호를 입력하세요"),
        sslEnabled: z.boolean(),
        sslRejectUnauthorized: z.boolean(),
        sslCertificate: z.string().optional()
      })
    })
  ])
  .superRefine((data, ctx) => {
    if (!data.gatewayId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "게이트웨이를 선택하세요",
        path: ["gatewayId"]
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

export const WinRMConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.WinRM,
      method: WinRMConnectionMethod.UsernamePassword,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        host: "",
        port: 5985,
        username: "",
        password: "",
        sslEnabled: false,
        sslRejectUnauthorized: true,
        sslCertificate: ""
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const sslEnabled = watch("credentials.sslEnabled");

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
                      APP_CONNECTION_MAP[AppConnection.WinRM].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(WinRMConnectionMethod).map((method) => {
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
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Controller
              name="gatewayId"
              control={control}
              render={({ fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>게이트웨이</FieldLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <GatewayPicker
                          isError={Boolean(error)}
                          isRequired
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
                  <FieldDescription>
                    네트워크 내부의 게이트웨이를 통해 WinRM으로 Windows 호스트에 접근합니다.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          )}
        </OrgPermissionCan>
        <div className="grid grid-cols-3 gap-2">
          <Controller
            name="credentials.host"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="col-span-2 mb-4">
                <FieldLabel htmlFor="host">호스트</FieldLabel>
                <Input
                  id="host"
                  {...field}
                  placeholder="win01.corp.example.com"
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
                <FieldLabel htmlFor="port">포트</FieldLabel>
                <Input
                  id="port"
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Controller
            name="credentials.username"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="username">사용자 이름</FieldLabel>
                <Input
                  id="username"
                  {...field}
                  placeholder="DOMAIN\\username or user@domain.com"
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
        </div>
        <Controller
          name="credentials.sslEnabled"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mt-2 mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="ssl-enabled">SSL 사용</Label>
                  <FieldDescription>
                    HTTPS로 연결합니다. 끄면 NTLM 메시지 암호화가 적용된 HTTP를 사용하며 서버
                    인증서가 필요하지 않습니다.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  aria-invalid={Boolean(error)}
                  id="ssl-enabled"
                  checked={value}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
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
                {...field}
                disabled={!sslEnabled}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                rows={5}
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                비워 두면 시스템 신뢰 저장소로 검증합니다. 자체 서명 WinRM HTTPS 리스너를 검증하려면
                리스너 인증서를 붙여 넣으세요.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.sslRejectUnauthorized"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className={sslEnabled ? "mb-4" : "mb-4 opacity-50"}>
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="ssl-reject-unauthorized">신뢰할 수 없는 인증서 거부</Label>
                  <FieldDescription>
                    켜면 리스너가 유효하고 신뢰할 수 있는 인증서를 제공할 때만 Keydesk가 연결합니다.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  aria-invalid={Boolean(error)}
                  id="ssl-reject-unauthorized"
                  checked={sslEnabled ? value : false}
                  onCheckedChange={onChange}
                  disabled={!sslEnabled}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "인증 정보 수정" : "Windows (WinRM)에 연결"}
        />
      </form>
    </FormProvider>
  );
};
