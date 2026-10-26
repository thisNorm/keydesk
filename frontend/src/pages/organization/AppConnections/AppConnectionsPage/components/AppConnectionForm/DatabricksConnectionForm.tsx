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
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DatabricksConnectionMethod,
  TDatabricksConnection
} from "@app/hooks/api/appConnections/types/databricks-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDatabricksConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Databricks)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DatabricksConnectionMethod.ServicePrincipal),
    credentials: z.object({
      workspaceUrl: z.string().url().trim().min(1, "워크스페이스 URL을 입력하세요"),
      clientId: z.string().trim().min(1, "클라이언트 ID를 입력하세요"),
      clientSecret: z.string().trim().min(1, "클라이언트 시크릿을 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DatabricksConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Databricks,
      method: DatabricksConnectionMethod.ServicePrincipal
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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.Databricks].name}.
                    이 필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(DatabricksConnectionMethod).map((method) => {
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
          name="credentials.workspaceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="workspace-url">워크스페이스 URL</FieldLabel>
              <Input
                id="workspace-url"
                {...field}
                placeholder="https://xxx-xxxxxxxx-xxx.cloud.databricks.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="client-id">클라이언트 ID</FieldLabel>
              <Input
                id="client-id"
                {...field}
                placeholder="05810c8f-c44d-4bd0-a327-aab6dd77719b"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="client-secret">클라이언트 시크릿</FieldLabel>
              <SecretInput
                aria-describedby={error ? "client-secret-error" : undefined}
                id="client-secret"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="client-secret-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "Databricks에 연결"} />
      </form>
    </FormProvider>
  );
};
