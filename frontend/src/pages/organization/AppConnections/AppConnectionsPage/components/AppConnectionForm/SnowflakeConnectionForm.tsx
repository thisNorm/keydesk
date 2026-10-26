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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SnowflakeConnectionMethod,
  TSnowflakeConnection
} from "@app/hooks/api/appConnections/types/snowflake-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSnowflakeConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Snowflake)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(SnowflakeConnectionMethod.UsernameAndToken),
    credentials: z.object({
      account: z.string().trim().min(1, "계정을 입력하세요"),
      username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
      password: z.string().trim().min(1, "프로그래밍 방식 액세스 토큰을 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const SnowflakeConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Snowflake,
      method: SnowflakeConnectionMethod.UsernameAndToken,
      credentials: {
        account: "",
        username: "",
        password: ""
      }
    }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="credentials.account"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="account">
                계정
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">Snowflake 계정 식별자입니다.</TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="account"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                isError={Boolean(error?.message)}
              />
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
                    Snowflake 인증에 사용할 로그인 이름입니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="username"
                value={value}
                onChange={(e) => onChange(e.target.value)}
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
              <FieldLabel htmlFor="password">
                프로그래밍 방식 액세스 토큰
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Snowflake 인증에 사용할 프로그래밍 방식 액세스 토큰(PAT)입니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
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

        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "Snowflake에 연결"} />
      </form>
    </FormProvider>
  );
};
