import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
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
  DigiCertConnectionMethod,
  DigiCertRegion,
  TDigiCertConnection
} from "@app/hooks/api/appConnections/types/digicert-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDigiCertConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.DigiCert)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DigiCertConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API 키를 입력하세요"),
      region: z.nativeEnum(DigiCertRegion)
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DigiCertConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.DigiCert,
      method: DigiCertConnectionMethod.ApiKey,
      credentials: { apiKey: "", region: DigiCertRegion.US }
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
                    {`연결 방식: ${
                      APP_CONNECTION_MAP[AppConnection.DigiCert].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(DigiCertConnectionMethod).map((method) => {
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
          name="credentials.region"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="region">
                CertCentral 리전
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    API 키가 발급된 CertCentral 테넌트를 선택하세요. 미국과 유럽은 서로 독립적이므로
                    각 리전에서 발급한 키를 다른 리전에서 사용할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="region" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="리전을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={DigiCertRegion.US}>US</SelectItem>
                  <SelectItem value={DigiCertRegion.EU}>EU</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.apiKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="api-key">CertCentral API 키</FieldLabel>
              <SecretInput
                aria-describedby={
                  error ? "api-key-description api-key-error" : "api-key-description"
                }
                isError={Boolean(error)}
                id="api-key"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              {!error && (
                <FieldDescription id="api-key-description">
                  CertCentral의 Automation &gt; API Keys에서 API 키를 만드세요.
                </FieldDescription>
              )}
              <FieldError id="api-key-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "DigiCert에 연결"} />
      </form>
    </FormProvider>
  );
};
