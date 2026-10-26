import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { MongoDBConnectionMethod, TMongoDBConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TMongoDBConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MongoDB)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(MongoDBConnectionMethod.UsernameAndPassword),
    credentials: z.object({
      host: z.string().trim().min(1, "호스트를 입력하세요"),
      port: z.coerce.number().default(27017),
      username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
      password: z.string().trim().min(1, "비밀번호를 입력하세요"),
      database: z.string().trim().min(1, "데이터베이스를 입력하세요"),
      tlsEnabled: z.boolean().default(false),
      tlsRejectUnauthorized: z.boolean().default(true),
      tlsCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const CONFIGURATION_TAB = "configuration";
const TLS_TAB = "tls";

export const MongoDBConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.MongoDB,
      method: MongoDBConnectionMethod.UsernameAndPassword,
      credentials: {
        host: "",
        port: 27017,
        username: "",
        password: "",
        database: "",
        tlsEnabled: false,
        tlsRejectUnauthorized: true,
        tlsCertificate: undefined
      }
    }
  });

  const { handleSubmit, watch, control } = form;
  const scopeVariant = useScopeVariant();

  const tlsEnabled = watch("credentials.tlsEnabled");

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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.MongoDB].name}. 이
                    필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(MongoDBConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Tabs
          value={selectedTabIndex === 0 ? CONFIGURATION_TAB : TLS_TAB}
          onValueChange={(val) => setSelectedTabIndex(val === CONFIGURATION_TAB ? 0 : 1)}
          className="mb-4"
        >
          <TabsList variant={scopeVariant}>
            <TabsTrigger value={CONFIGURATION_TAB}>구성</TabsTrigger>
            <TabsTrigger value={TLS_TAB}>TLS ({tlsEnabled ? "켜짐" : "꺼짐"})</TabsTrigger>
          </TabsList>
          <TabsContent value={CONFIGURATION_TAB}>
            <div className="flex items-start gap-2">
              <Controller
                name="credentials.host"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="mongo-host">호스트</FieldLabel>
                    <Input id="mongo-host" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.database"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="mongo-database">데이터베이스</FieldLabel>
                    <Input id="mongo-database" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.port"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="w-28">
                    <FieldLabel htmlFor="mongo-port">포트</FieldLabel>
                    <Input
                      id="mongo-port"
                      type="number"
                      {...field}
                      isError={Boolean(error?.message)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </div>
            <div className="mt-4 flex items-start gap-2">
              <Controller
                name="credentials.username"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="mongo-username">사용자 이름</FieldLabel>
                    <Input id="mongo-username" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.password"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="app-connection-mongo-db-password">비밀번호</FieldLabel>
                    <SecretInput
                      aria-describedby={
                        error ? "app-connection-mongo-db-password-error" : undefined
                      }
                      id="app-connection-mongo-db-password"
                      isError={Boolean(error)}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                    />
                    <FieldError id="app-connection-mongo-db-password-error" errors={[error]} />
                  </Field>
                )}
              />
            </div>
          </TabsContent>
          <TabsContent value={TLS_TAB}>
            <Controller
              name="credentials.tlsEnabled"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="tls-enabled">TLS 사용</Label>
                    </FieldContent>
                    <Toggle
                      aria-invalid={Boolean(error)}
                      id="tls-enabled"
                      variant={scopeVariant}
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.tlsCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className={tlsEnabled ? "mb-4" : "mb-4 opacity-50"}>
                  <FieldLabel htmlFor="tls-certificate">
                    TLS 인증서 <span className="text-muted">(선택 사항)</span>
                  </FieldLabel>
                  <TextArea
                    id="tls-certificate"
                    className="h-14 resize-none"
                    {...field}
                    disabled={!tlsEnabled}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.tlsRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className={tlsEnabled ? undefined : "opacity-50"}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="tls-reject-unauthorized">신뢰할 수 없는 인증서 거부</Label>
                      <FieldDescription>
                        켜면 서버가 유효하고 신뢰할 수 있는 TLS 인증서를 제공할 때만 Keydesk가
                        연결합니다.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle
                      aria-invalid={Boolean(error)}
                      id="tls-reject-unauthorized"
                      variant={scopeVariant}
                      checked={tlsEnabled ? value : false}
                      onCheckedChange={onChange}
                      disabled={!tlsEnabled}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
        </Tabs>

        <AppConnectionFormFooter
          submitLabel={isUpdate ? "인증 정보 수정" : "데이터베이스에 연결"}
        />
      </form>
    </FormProvider>
  );
};
