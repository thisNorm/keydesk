import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  APP_CONNECTION_MAP,
  getAppConnectionMethodDetails,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useScopeVariant } from "@app/hooks";
import { useGetAppConnectionOption } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  StripeConnectionMethod,
  TStripeConnection
} from "@app/hooks/api/appConnections/types/stripe-connection";

import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TStripeConnection;
  onSubmit: (formData: FormData) => Promise<void>;
  projectId: string | undefined | null;
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Stripe),
  method: z.literal(StripeConnectionMethod.OAuth),
  credentials: z.object({
    code: z.string().min(1, "코드를 입력하세요")
  })
});

type FormData = z.infer<typeof formSchema>;

export const StripeConnectionForm = ({ appConnection, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    option: { oauthClientId, oauthAuthorizeUrl },
    isLoading
  } = useGetAppConnectionOption(AppConnection.Stripe);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    // The real code arrives from the Stripe redirect, so the form carries a placeholder to satisfy
    // the schema. This mirrors every other OAuth connection form.
    defaultValues: appConnection
      ? { ...appConnection, credentials: { code: "custom" } }
      : ({
          app: AppConnection.Stripe,
          method: StripeConnectionMethod.OAuth,
          credentials: { code: "custom" }
        } as FormData)
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  useAppConnectionFormDirtyState(isDirty);

  const isMissingConfig = !oauthClientId;

  let submitLabel = "Stripe에 연결";
  if (isRedirecting) submitLabel = "Stripe로 이동하는 중...";
  else if (isUpdate) submitLabel = "Stripe에 다시 연결";

  const onSubmit = (formData: FormData) => {
    if (!oauthClientId || !oauthAuthorizeUrl) return;

    setIsRedirecting(true);

    const state = crypto.randomBytes(16).toString("hex");

    localStorage.setItem("latestCSRFToken", state);
    localStorage.setItem(
      "stripeConnectionFormData",
      JSON.stringify({
        ...formData,
        connectionId: appConnection?.id,
        returnUrl,
        projectId
      })
    );

    // The redirect URI is taken from the origin the user is actually on rather than from config,
    // so one Stripe app serves every deployment listing that origin in its manifest.
    const oauthUrl = new URL(oauthAuthorizeUrl);
    oauthUrl.searchParams.set("client_id", oauthClientId);
    oauthUrl.searchParams.set(
      "redirect_uri",
      `${window.location.origin}/organization/app-connections/stripe/oauth/callback`
    );
    oauthUrl.searchParams.set("state", state);

    window.location.assign(oauthUrl.toString());
  };

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
                      APP_CONNECTION_MAP[AppConnection.Stripe].name
                    }. 이 필드는 생성 후 변경할 수 없습니다.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="방식을 선택하세요..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(StripeConnectionMethod).map((method) => {
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

        {!isLoading && isMissingConfig && (
          <p className="mb-4 text-sm text-danger">
            환경 변수가 구성되지 않았습니다.{" "}
            {isInfisicalCloud()
              ? "Keydesk 관리자에게 문의하세요."
              : "문서를 확인해 Stripe 연결을 구성하세요."}
          </p>
        )}

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting || isRedirecting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty) || isMissingConfig || isRedirecting}
          >
            {submitLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            isDisabled={isSubmitting || isRedirecting}
          >
            취소
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
