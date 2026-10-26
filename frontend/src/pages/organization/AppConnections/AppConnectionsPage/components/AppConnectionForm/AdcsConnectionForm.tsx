import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
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
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AdcsConnectionMethod, TAdcsConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAdcsConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ADCS)
});

const formSchema = z
  .discriminatedUnion("method", [
    rootSchema.extend({
      method: z.literal(AdcsConnectionMethod.UsernamePassword),
      credentials: z.object({
        host: z.string().trim().min(1, "CA 호스트를 입력하세요"),
        username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
        password: z.string().trim().min(1, "비밀번호를 입력하세요")
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

export const AdcsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.ADCS,
      method: AdcsConnectionMethod.UsernamePassword,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        host: "",
        username: "",
        password: ""
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

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
                      APP_CONNECTION_MAP[AppConnection.ADCS].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AdcsConnectionMethod).map((method) => {
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
                  {isAllowed ? (
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
                  ) : (
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
                      <TooltipContent>
                        접근이 제한되었습니다. 리소스에 게이트웨이를 연결할 권한이 없습니다.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          )}
        </OrgPermissionCan>
        <Controller
          name="credentials.host"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="ca-host">CA 호스트</FieldLabel>
              <Input
                id="ca-host"
                {...field}
                placeholder="ca01.corp.example.com"
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                게이트웨이가 CA 서버에 접근하는 데 사용할 FQDN, 호스트 이름 또는 IP 주소입니다.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
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
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "ADCS에 연결"} />
      </form>
    </FormProvider>
  );
};
