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
import { AzureADCSConnectionMethod, TAzureADCSConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAzureADCSConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureADCS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AzureADCSConnectionMethod.UsernamePassword),
    credentials: z.object({
      adcsUrl: z
        .string()
        .trim()
        .min(1, "ADCS URL을 입력하세요")
        .refine((value) => value.startsWith("https://"), "ADCS URL은 HTTPS를 사용해야 합니다"),
      username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
      password: z.string().trim().min(1, "비밀번호를 입력하세요"),
      sslRejectUnauthorized: z.boolean().optional(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const AzureADCSConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.AzureADCS,
      method: AzureADCSConnectionMethod.UsernamePassword,
      name: "",
      description: "",
      credentials: {
        adcsUrl: "",
        username: "",
        password: "",
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, watch } = form;

  const scopeVariant = useScopeVariant();

  const sslEnabled = watch("credentials.adcsUrl")?.startsWith("https://") ?? false;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTab("configuration");
          handleSubmit(onSubmit)(e);
        }}
      >
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
                      APP_CONNECTION_MAP[AppConnection.AzureADCS].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureADCSConnectionMethod).map((method) => {
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
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
          <TabsList variant={scopeVariant}>
            <TabsTrigger value="configuration">구성</TabsTrigger>
            <TabsTrigger value="ssl">SSL ({sslEnabled ? "켜짐" : "꺼짐"})</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <Controller
              name="credentials.adcsUrl"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="adcs-url">ADCS URL</FieldLabel>
                  <Input
                    id="adcs-url"
                    {...field}
                    placeholder="https://your-adcs-server.com"
                    isError={Boolean(error?.message)}
                  />
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
          </TabsContent>
          <TabsContent value="ssl">
            <p className="mb-3 text-xs text-muted">HTTPS 연결을 위한 SSL 구성</p>
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
                    className="h-[3.6rem] resize-none!"
                    {...field}
                    disabled={!sslEnabled}
                    isError={Boolean(error?.message)}
                    placeholder="-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----"
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.sslRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className={sslEnabled ? undefined : "opacity-50"}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="ssl-reject-unauthorized">신뢰할 수 없는 인증서 거부</Label>
                      <FieldDescription>
                        켜면 ADCS 서버가 유효하고 신뢰할 수 있는 SSL 인증서를 제공할 때만 Keydesk가
                        연결합니다. 자체 서명 인증서를 사용하는 테스트 환경에서만 끄세요.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle
                      aria-invalid={Boolean(error)}
                      id="ssl-reject-unauthorized"
                      variant={scopeVariant}
                      checked={sslEnabled ? value : false}
                      onCheckedChange={onChange}
                      disabled={!sslEnabled}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
        </Tabs>
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "Azure ADCS에 연결"} />
      </form>
    </FormProvider>
  );
};
