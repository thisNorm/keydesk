import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
  FieldError,
  FieldLabel,
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
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { MySqlConnectionMethod, TMySqlConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PlatformManagedConfirmationModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm/shared/PlatformManagedConfirmationModal";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import {
  BaseSqlUsernameAndPasswordConnectionSchema,
  PlatformManagedNoticeBanner,
  SqlConnectionFields
} from "./shared";

type Props = {
  appConnection?: TMySqlConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MySql),
  isPlatformManagedCredentials: z.boolean().optional()
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(MySqlConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

type FormData = z.infer<typeof formSchema>;

export const MySqlConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.MySql,
      method: MySqlConnectionMethod.UsernameAndPassword,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        host: "",
        port: 3306,
        database: "default",
        username: "",
        password: "",
        sslEnabled: true,
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const { subscription } = useSubscription();
  const isPlatformManagedCredentials = appConnection?.isPlatformManagedCredentials ?? false;
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  const confirmSubmit = async (formData: FormData) => {
    if (formData.isPlatformManagedCredentials) {
      setShowConfirmation(true);
      return;
    }

    await onSubmit(formData);
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(confirmSubmit)(e);
        }}
      >
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Field className="mb-4">
                <FieldLabel>게이트웨이</FieldLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <GatewayPicker
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
                  {!isAllowed && (
                    <TooltipContent>
                      접근이 제한되었습니다. 리소스에 게이트웨이를 연결할 권한이 없습니다.
                    </TooltipContent>
                  )}
                </Tooltip>
              </Field>
            )}
          </OrgPermissionCan>
        )}
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
                    다음에 연결할 방식입니다: {APP_CONNECTION_MAP[AppConnection.MySql].name}. 이
                    필드는 생성 후 변경할 수 없습니다.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(MySqlConnectionMethod).map((method) => (
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
        <SqlConnectionFields
          isPlatformManagedCredentials={isPlatformManagedCredentials}
          selectedTabIndex={selectedTabIndex}
          setSelectedTabIndex={setSelectedTabIndex}
        />
        {isPlatformManagedCredentials ? (
          <PlatformManagedNoticeBanner />
        ) : (
          <AppConnectionFormFooter
            submitLabel={isUpdate ? "인증 정보 수정" : "데이터베이스에 연결"}
          />
        )}
      </form>
      <PlatformManagedConfirmationModal
        onConfirm={() => handleSubmit(onSubmit)()}
        onOpenChange={setShowConfirmation}
        isOpen={showConfirmation}
      />
    </FormProvider>
  );
};
