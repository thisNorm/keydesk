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
import { OCIConnectionMethod, TOCIConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TOCIConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OCI)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(OCIConnectionMethod.AccessKey),
    credentials: z.object({
      userOcid: z
        .string()
        .trim()
        .min(1, "사용자 OCID를 입력하세요")
        .regex(/^ocid1\.user\.oc1\.\..+$/, "올바른 사용자 OCID 형식을 입력하세요"),
      tenancyOcid: z
        .string()
        .trim()
        .min(1, "테넌시 OCID를 입력하세요")
        .regex(/^ocid1\.tenancy\.oc1\.\..+$/, "올바른 테넌시 OCID 형식을 입력하세요"),
      region: z.string().trim().min(1, "리전을 입력하세요"),
      fingerprint: z.string().trim().min(1, "지문을 입력하세요"),
      privateKey: z.string().trim().min(1, "개인 키를 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const OCIConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.OCI,
      method: OCIConnectionMethod.AccessKey
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
              <FieldLabel>
                방식
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`연결 방식: ${
                      APP_CONNECTION_MAP[AppConnection.OCI].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(OCIConnectionMethod).map((method) => {
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
          name="credentials.userOcid"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-user-ocid">
                사용자 OCID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    OCI 사용자 계정의 고유 식별자(OCID)입니다. OCI 콘솔의 Identity &gt; Domains &gt;
                    [domain] &gt; Users &gt; [user]에서 확인할 수 있습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-user-ocid"
                {...field}
                placeholder="ocid1.user.oc1..************************************************************"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.tenancyOcid"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-tenancy-ocid">
                테넌시 OCID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Oracle Cloud 테넌시의 고유 식별자(OCID)입니다. OCI 콘솔의 Administration &gt;
                    Tenancy Details에서 확인할 수 있습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-tenancy-ocid"
                {...field}
                placeholder="ocid1.tenancy.oc1..************************************************************"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.region"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-region">
                리전
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    리소스가 위치한 OCI 리전입니다(예: us-ashburn-1, eu-frankfurt-1).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-region"
                {...field}
                placeholder="us-ashburn-1"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.fingerprint"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-fingerprint">
                지문
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    OCI API 키에 연결된 공개 키의 지문입니다. OCI 사용자 설정에서 API 키를 만들면
                    생성됩니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-fingerprint"
                {...field}
                placeholder="00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.privateKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="app-connection-oci-private-key">PEM 개인 키</FieldLabel>
              <SecretInput
                aria-describedby={error ? "app-connection-oci-private-key-error" : undefined}
                id="app-connection-oci-private-key"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="app-connection-oci-private-key-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "OCI에 연결"} />
      </form>
    </FormProvider>
  );
};
