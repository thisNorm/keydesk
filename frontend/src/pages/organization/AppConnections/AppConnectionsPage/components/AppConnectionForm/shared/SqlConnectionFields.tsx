import { Dispatch, SetStateAction } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  SecretInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Toggle
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";

type Props = {
  isPlatformManagedCredentials: boolean;
  selectedTabIndex: number;
  setSelectedTabIndex: Dispatch<SetStateAction<number>>;
};

const CONFIGURATION_TAB = "configuration";
const SSL_TAB = "ssl";

export const SqlConnectionFields = ({
  isPlatformManagedCredentials,
  setSelectedTabIndex,
  selectedTabIndex
}: Props) => {
  const { control, watch } = useFormContext();
  const scopeVariant = useScopeVariant();

  const sslEnabled = watch("credentials.sslEnabled");
  return (
    <>
      <Tabs
        value={selectedTabIndex === 0 ? CONFIGURATION_TAB : SSL_TAB}
        onValueChange={(value) => setSelectedTabIndex(value === CONFIGURATION_TAB ? 0 : 1)}
        className="mb-4"
      >
        <TabsList variant={scopeVariant}>
          <TabsTrigger value={CONFIGURATION_TAB}>구성</TabsTrigger>
          <TabsTrigger value={SSL_TAB}>SSL ({sslEnabled ? "켜짐" : "꺼짐"})</TabsTrigger>
        </TabsList>
        <TabsContent value={CONFIGURATION_TAB}>
          <div className="flex items-start gap-2">
            <Controller
              name="credentials.host"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel htmlFor="sql-host">호스트</FieldLabel>
                  <Input
                    id="sql-host"
                    {...field}
                    disabled={isPlatformManagedCredentials}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.database"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel htmlFor="sql-database">데이터베이스 이름</FieldLabel>
                  <Input
                    id="sql-database"
                    {...field}
                    disabled={isPlatformManagedCredentials}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="w-28">
                  <FieldLabel htmlFor="sql-port">포트</FieldLabel>
                  <Input
                    id="sql-port"
                    type="number"
                    {...field}
                    disabled={isPlatformManagedCredentials}
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
                  <FieldLabel htmlFor="sql-username">사용자 이름</FieldLabel>
                  <Input
                    id="sql-username"
                    {...field}
                    disabled={isPlatformManagedCredentials}
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
                <Field className="flex-1">
                  <FieldLabel htmlFor="app-connection-sql-connection-fields-password">
                    비밀번호
                  </FieldLabel>
                  <SecretInput
                    aria-describedby={
                      error ? "app-connection-sql-connection-fields-password-error" : undefined
                    }
                    id="app-connection-sql-connection-fields-password"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    isDisabled={isPlatformManagedCredentials}
                  />
                  <FieldError
                    id="app-connection-sql-connection-fields-password-error"
                    errors={[error]}
                  />
                </Field>
              )}
            />
          </div>
        </TabsContent>
        <TabsContent value={SSL_TAB}>
          <Controller
            name="credentials.sslEnabled"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <Field orientation="horizontal">
                  <FieldContent>
                    <Label htmlFor="ssl-enabled">SSL 사용</Label>
                  </FieldContent>
                  <Toggle
                    aria-invalid={Boolean(error)}
                    id="ssl-enabled"
                    variant={scopeVariant}
                    checked={value}
                    onCheckedChange={onChange}
                    disabled={isPlatformManagedCredentials}
                  />
                </Field>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
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
                  className="h-14 resize-none"
                  {...field}
                  disabled={isPlatformManagedCredentials || !sslEnabled}
                  isError={Boolean(error?.message)}
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
                      켜면 서버가 유효하고 신뢰할 수 있는 SSL 인증서를 제공할 때만 Keydesk가
                      연결합니다.
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    aria-invalid={Boolean(error)}
                    id="ssl-reject-unauthorized"
                    variant={scopeVariant}
                    checked={sslEnabled ? value : false}
                    onCheckedChange={onChange}
                    disabled={isPlatformManagedCredentials || !sslEnabled}
                  />
                </Field>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </TabsContent>
      </Tabs>
      {!isPlatformManagedCredentials && (
        <Controller
          name="isPlatformManagedCredentials"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="platform-managed">플랫폼 관리 인증 정보</Label>
                  <FieldDescription>
                    켜면 연결 생성 시 Keydesk가 비밀번호를 변경하고 이 앱 연결의 인증 정보를
                    관리합니다.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  aria-invalid={Boolean(error)}
                  id="platform-managed"
                  variant={scopeVariant}
                  checked={value}
                  onCheckedChange={onChange}
                  disabled={isPlatformManagedCredentials}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
    </>
  );
};
