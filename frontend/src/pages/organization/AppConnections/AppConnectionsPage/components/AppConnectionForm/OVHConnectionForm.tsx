import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldDescription,
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
  OVHConnectionMethod,
  TOvhConnection
} from "@app/hooks/api/appConnections/types/ovh-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TOvhConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OVH)
});

const pemPrivateKey = z
  .string()
  .trim()
  .min(1, "개인 키를 입력하세요")
  .refine((val) => val.startsWith("-----BEGIN "), {
    message: "개인 키는 PEM 형식이어야 합니다(-----BEGIN ...-----로 시작)"
  });

const pemCertificate = z
  .string()
  .trim()
  .min(1, "인증서를 입력하세요")
  .refine((val) => val.startsWith("-----BEGIN CERTIFICATE-----"), {
    message: "인증서는 PEM 형식이어야 합니다(-----BEGIN CERTIFICATE-----로 시작)"
  });

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(OVHConnectionMethod.Certificate),
    credentials: z.object({
      privateKey: pemPrivateKey,
      certificate: pemCertificate,
      okmsDomain: z.string().trim().min(1, "OKMS 도메인을 입력하세요"),
      okmsId: z.string().trim().min(1, "OKMS ID를 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const OVHConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            privateKey: "",
            certificate: ""
          }
        }
      : {
          app: AppConnection.OVH,
          method: OVHConnectionMethod.Certificate,
          credentials: {
            privateKey: "",
            certificate: "",
            okmsDomain: "",
            okmsId: ""
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
          render={({ field }) => (
            <input type="hidden" {...field} value={OVHConnectionMethod.Certificate} />
          )}
        />
        <Controller
          name="credentials.privateKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="private-key">
                개인 키(PEM)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    -----BEGIN/END PRIVATE KEY----- 표시를 포함하여 OVH OKMS에서 발급한 PEM 형식의
                    개인 키를 붙여 넣으세요.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <SecretInput
                aria-describedby={error ? "private-key-error" : undefined}
                id="private-key"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="private-key-error" errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.certificate"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="certificate">
                인증서(PEM)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    -----BEGIN/END CERTIFICATE----- 표시를 포함하여 OVH OKMS에서 발급한 PEM 형식의
                    공개 인증서를 붙여 넣으세요.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <SecretInput
                aria-describedby={error ? "certificate-error" : undefined}
                id="certificate"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="certificate-error" errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.okmsDomain"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="okms-domain">
                OKMS 도메인
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    OKMS 기본 URL입니다(예: &apos;https://ca-east-bhs.okms.ovh.net&apos;).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="okms-domain"
                {...field}
                placeholder="https://ca-east-bhs.okms.ovh.net"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.okmsId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="okms-id">OKMS ID</FieldLabel>
              <Input
                id="okms-id"
                {...field}
                placeholder="your-okms-instance-id"
                isError={Boolean(error?.message)}
              />
              {!error && (
                <FieldDescription>
                  OVH Control Panel에서 확인할 수 있는 OKMS 인스턴스 식별자입니다.
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "OVH에 연결"} />
      </form>
    </FormProvider>
  );
};
