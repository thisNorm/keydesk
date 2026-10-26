import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Code,
  CopyButton,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
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
import { useOrganization } from "@app/context";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AwsConnectionMethod, TAwsConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAwsConnection;
  onSubmit: (formData: FormData) => Promise<void>;
  projectType?: ProjectType;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AWS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AwsConnectionMethod.AssumeRole),
    credentials: z.object({
      roleArn: z.string().trim().min(1, "역할 ARN을 입력하세요"),
      stsEndpoint: z
        .string()
        .trim()
        .url("올바른 URL을 입력하세요")
        .startsWith("https://", "HTTPS를 사용해야 합니다")
        .or(z.literal(""))
        .optional()
        .transform((val) => val || undefined)
    })
  }),
  rootSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: z.object({
      accessKeyId: z.string().trim().min(1, "액세스 키 ID를 입력하세요"),
      secretAccessKey: z.string().trim().min(1, "시크릿 액세스 키를 입력하세요")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const OrgExternalIdHint = () => {
  const { currentOrg } = useOrganization();

  return (
    <FieldDescription>
      Keydesk는 역할을 수임할 때{" "}
      <HoverCard openDelay={150} closeDelay={150}>
        <HoverCardTrigger asChild>
          <span className="cursor-help text-foreground underline decoration-muted decoration-dotted underline-offset-4">
            조직 ID
          </span>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-auto max-w-sm">
          <p className="text-xs font-medium text-foreground">외부 ID</p>
          <div className="mt-1 flex items-center gap-1">
            <span className="font-mono text-xs">{currentOrg.id}</span>
            <CopyButton value={currentOrg.id} ariaLabel="조직 ID 복사" />
          </div>
          <p className="mt-2 text-xs text-muted">
            역할의 신뢰 정책에 <Code>sts:ExternalId</Code> 조건으로 지정하세요.
          </p>
        </HoverCardContent>
      </HoverCard>{" "}
      를 외부 ID로 전송합니다.
    </FieldDescription>
  );
};

export const AwsConnectionForm = ({ appConnection, onSubmit, projectType }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.AWS,
      method: AwsConnectionMethod.AssumeRole
    }
  });

  const { handleSubmit, control, watch } = form;

  const selectedMethod = watch("method");

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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.AWS].name}. 이
                    필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AwsConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                      {method === AwsConnectionMethod.AssumeRole ? " (Recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {selectedMethod === AwsConnectionMethod.AssumeRole ? (
          <>
            <Controller
              name="credentials.roleArn"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="app-connection-aws-role-arn">역할 ARN</FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "app-connection-aws-role-arn-error" : undefined}
                    id="app-connection-aws-role-arn"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  {projectType === ProjectType.AgentVault && <OrgExternalIdHint />}
                  <FieldError id="app-connection-aws-role-arn-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.stsEndpoint"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>
                    STS 엔드포인트 URL <span className="text-muted">(선택 사항)</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        역할을 수임할 때 Keydesk가 호출할 AWS STS 엔드포인트를 지정합니다.
                        VPC(PrivateLink), GovCloud, 중국, FIPS 또는 특정 리전에 고정된 엔드포인트에
                        사용할 수 있습니다. 비워 두면 기본 AWS STS 엔드포인트를 사용합니다.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    placeholder="https://sts.amazonaws.com"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        ) : (
          <>
            <Controller
              name="credentials.accessKeyId"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>액세스 키 ID</FieldLabel>
                  <Input
                    placeholder={"*".repeat(20)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.secretAccessKey"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="app-connection-aws-secret-access-key">
                    시크릿 액세스 키
                  </FieldLabel>
                  <SecretInput
                    aria-describedby={
                      error ? "app-connection-aws-secret-access-key-error" : undefined
                    }
                    id="app-connection-aws-secret-access-key"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="app-connection-aws-secret-access-key-error" errors={[error]} />
                </Field>
              )}
            />
          </>
        )}
        <AppConnectionFormFooter submitLabel={isUpdate ? "인증 정보 수정" : "AWS에 연결"} />
      </form>
    </FormProvider>
  );
};
