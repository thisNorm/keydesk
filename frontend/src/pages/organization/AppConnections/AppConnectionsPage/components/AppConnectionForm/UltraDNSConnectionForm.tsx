import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

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
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { TUltraDNSConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  UltraDNSConnectionMethod,
  UltraDNSEnvironment
} from "@app/hooks/api/appConnections/types/ultradns-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TUltraDNSConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.UltraDNS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(UltraDNSConnectionMethod.UsernamePassword),
    credentials: z.object({
      username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
      password: z.string().trim().min(1, "비밀번호를 입력하세요"),
      environment: z.nativeEnum(UltraDNSEnvironment)
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const UltraDNSConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.UltraDNS,
      method: UltraDNSConnectionMethod.UsernamePassword,
      credentials: {
        username: "",
        password: "",
        environment: UltraDNSEnvironment.Production
      }
    }
  });

  const { handleSubmit, control } = form;

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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.UltraDNS].name}. 이
                    필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(UltraDNSConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
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
          name="credentials.username"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="username">
                사용자 이름
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    UltraDNS는 Two Factor Mobile Authentication을 켠 사용자의 API 접근을 차단하므로
                    해당 설정을 끈 사용자를 사용하세요.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="username"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="infisical-api"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.password"
          control={control}
          shouldUnregister
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
        <Controller
          name="credentials.environment"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="environment">
                환경
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    연결할 UltraDNS API입니다. 별도의 계정과 영역을 사용하는 UltraDNS 고객 테스트
                    환경에는 테스트를 선택하세요.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="환경을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={UltraDNSEnvironment.Production}>프로덕션</SelectItem>
                  <SelectItem value={UltraDNSEnvironment.Test}>테스트</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "UltraDNS에 연결"} />
      </form>
    </FormProvider>
  );
};
