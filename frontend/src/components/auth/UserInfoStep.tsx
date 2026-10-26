import { type JSX, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";

import { captureSignupCompleted } from "@app/components/analytics/experiments/signupFlow/signupExperiment";
import { PasswordField } from "@app/components/auth/PasswordField";
import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  AnimatedCollapse,
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getHubSpotUtk } from "@app/helpers/utmTracking";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { submitSignupOnboarding, useCompleteAccountSignup } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import SecurityClient from "../utilities/SecurityClient";
import Telemetry from "../utilities/telemetry/Telemetry";
import { AuthPagePanel } from "./AuthPagePanel";

const createUserInfoFormSchema = (isInvite: boolean, passwordPolicy: TPasswordPolicy) =>
  z
    .object({
      firstName: z.string().trim().min(1, "이름을 입력하세요."),
      lastName: z.string().trim().optional(),
      organizationName: isInvite ? z.string().optional() : GenericResourceNameSchema,
      attributionSource: z.string().trim().max(512).optional(),
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "비밀번호를 다시 입력하세요.")
    })
    .refine(({ password, confirmPassword }) => password === confirmPassword, {
      message: "비밀번호가 일치하지 않습니다.",
      path: ["confirmPassword"]
    });

type UserInfoFormData = z.infer<ReturnType<typeof createUserInfoFormSchema>>;

interface UserInfoStepProps {
  onComplete: (orgId?: string) => void;
  email: string;
  isInvite?: boolean;
  inviteOrganizationName?: string;
}

export default function UserInfoStep({
  onComplete,
  email,
  isInvite = false,
  inviteOrganizationName
}: UserInfoStepProps): JSX.Element {
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { config } = useServerConfig();
  const { mutateAsync: completeSignup, isPending: isLoading } = useCompleteAccountSignup();
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { dirtyFields, errors, submitCount }
  } = useForm<UserInfoFormData>({
    resolver: zodResolver(createUserInfoFormSchema(isInvite, config.passwordPolicy)),
    mode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      organizationName: "",
      attributionSource: "",
      password: "",
      confirmPassword: ""
    }
  });

  const passwordValue = watch("password");
  const { breachStatus: passwordBreachStatus, validatePassword } = usePasswordBreachCheck({
    password: passwordValue,
    policy: config.passwordPolicy
  });
  const confirmPasswordValue = watch("confirmPassword");
  const showDangerState = submitCount > 0;
  const showOrganizationNameError =
    (showDangerState || Boolean(dirtyFields.organizationName)) && Boolean(errors.organizationName);
  const doPasswordsMatch =
    confirmPasswordValue.length > 0 && passwordValue === confirmPasswordValue;
  const isPasswordValidated =
    passwordBreachStatus === "safe" || passwordBreachStatus === "unavailable";
  const canSubmit = isPasswordValidated && !isLoading;
  const normalizedInviteOrganizationName = inviteOrganizationName?.trim();
  const inviteOrganizationLabel = normalizedInviteOrganizationName || "조직";
  const stepTitle = t("signup.step3-message");
  const submitLabel = isInvite ? String(t("signup.signup")) : "계속";

  const onSubmit = async (formData: UserInfoFormData) => {
    const telemetry = new Telemetry().getInstance();

    const latestBreachStatus = await validatePassword(formData.password);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "알려진 유출 기록에서 발견된 비밀번호입니다."
      });
      return;
    }

    const attributionSource = isInvite ? undefined : formData.attributionSource || undefined;
    const response = await completeSignup({
      type: "email",
      email,
      password: formData.password,
      firstName: formData.firstName,
      lastName: formData.lastName ?? "",
      organizationName: formData.organizationName || undefined,
      attributionSource,
      hubspotUtk: getHubSpotUtk()
    });

    SecurityClient.setSignupToken("");
    SecurityClient.setToken(response.token);

    if (attributionSource) {
      submitSignupOnboarding({ attributionSource }).catch(() => {});
    }

    // The distinct id has to match the one the backend captures signup events with, which is
    // user.username: the lowercased email.
    const signupEmail = email.toLowerCase();
    telemetry.identify(signupEmail, signupEmail);

    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }
    if (!isInvite) captureSignupCompleted("email");

    const userOrgs = await fetchOrganizations();
    const orgId = userOrgs[0]?.id;

    if (orgId) {
      localStorage.setItem("orgData.id", orgId);
    }

    onComplete(orgId);
  };

  return (
    <form
      className="mx-auto flex w-full flex-col items-center justify-center"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <AuthPagePanel>
        <CardHeader className={isInvite ? "mb-6 gap-2" : "mb-4 gap-2"}>
          <CardTitle
            role="heading"
            aria-level={1}
            className="ml-0.5 min-w-0 flex-nowrap font-alliance text-2xl font-normal break-words"
          >
            {isInvite ? (
              <>
                <span className="shrink-0 bg-linear-to-b from-foreground-inverse to-foreground-soft bg-clip-text text-transparent opacity-70">
                  가입:
                </span>
                <span
                  className="min-w-0 truncate bg-linear-to-b from-foreground-inverse to-foreground-soft bg-clip-text text-transparent"
                  title={inviteOrganizationLabel}
                >
                  {inviteOrganizationLabel}
                </span>
              </>
            ) : (
              <span className="bg-linear-to-b from-foreground-inverse to-foreground-soft bg-clip-text text-transparent">
                {stepTitle}
              </span>
            )}
          </CardTitle>
          {isInvite ? (
            <CardDescription className="ml-0.5 font-sans text-base break-words text-accent">
              Keydesk 계정 설정
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={showDangerState && Boolean(errors.firstName)}>
              <FieldLabel className="sr-only" htmlFor="signup-first-name">
                이름
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("firstName")}
                id="signup-first-name"
                placeholder="이름"
                autoComplete="given-name"
                isError={showDangerState && Boolean(errors.firstName)}
              />
              {showDangerState && errors.firstName ? (
                <FieldError>{errors.firstName.message}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={showDangerState && Boolean(errors.lastName)}>
              <FieldLabel className="sr-only" htmlFor="signup-last-name">
                성
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("lastName")}
                id="signup-last-name"
                placeholder="성"
                autoComplete="family-name"
                isError={showDangerState && Boolean(errors.lastName)}
              />
              {showDangerState && errors.lastName ? (
                <FieldError>{errors.lastName.message}</FieldError>
              ) : null}
            </Field>
          </div>
          {!isInvite && (
            <Field data-invalid={showOrganizationNameError}>
              <FieldLabel className="sr-only" htmlFor="signup-organization-name">
                조직 이름
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("organizationName")}
                id="signup-organization-name"
                placeholder="조직 이름"
                maxLength={64}
                autoComplete="organization"
                isError={showOrganizationNameError}
              />
              {showOrganizationNameError && errors.organizationName ? (
                <FieldError>{errors.organizationName.message}</FieldError>
              ) : null}
            </Field>
          )}
          {!isInvite && (
            <Field>
              <FieldLabel htmlFor="signup-attribution-source">
                Keydesk를 알게 된 경로 <span className="font-normal text-muted"> (선택)</span>
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("attributionSource")}
                id="signup-attribution-source"
                autoComplete="off"
                placeholder="예: Hacker News, 지인, GitHub..."
                maxLength={512}
              />
            </Field>
          )}
          <Field className={isInvite ? undefined : "hidden"}>
            <FieldLabel className="sr-only" htmlFor="signup-email">
              이메일
            </FieldLabel>
            <Input
              variant="outlined"
              id="signup-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              readOnly
            />
          </Field>
          <PasswordField
            variant="outlined"
            id="new-password"
            value={passwordValue}
            policy={config.passwordPolicy}
            breachStatus={passwordBreachStatus}
            placeholder="••••••••"
            registration={register("password")}
            error={showDangerState ? errors.password : undefined}
            submitCount={submitCount}
          />
          <AnimatedCollapse
            isOpen={isPasswordValidated}
            contentClassName={isPasswordValidated ? "overflow-visible" : undefined}
          >
            <Field data-invalid={showDangerState && Boolean(errors.confirmPassword)}>
              <FieldLabel htmlFor="confirm-password">비밀번호 확인</FieldLabel>
              <InputGroup variant="outlined">
                <InputGroupInput
                  {...register("confirmPassword")}
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={showDangerState && Boolean(errors.confirmPassword)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    aria-label={showConfirmPassword ? "확인 비밀번호 숨기기" : "확인 비밀번호 표시"}
                  >
                    {showConfirmPassword ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <AnimatedCollapse isOpen={confirmPasswordValue.length > 0}>
                <div className="flex items-start gap-2 pt-1 text-xs" aria-live="polite">
                  {doPasswordsMatch ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ) : (
                    <X className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  )}
                  <span className={doPasswordsMatch ? "text-muted" : "text-danger"}>
                    {doPasswordsMatch ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
                  </span>
                </div>
              </AnimatedCollapse>
              {showDangerState && errors.confirmPassword ? (
                <FieldError>{errors.confirmPassword.message}</FieldError>
              ) : null}
            </Field>
          </AnimatedCollapse>
          <Button
            type="submit"
            variant="project"
            size="lg"
            isFullWidth
            isPending={isLoading}
            isDisabled={!canSubmit}
          >
            {submitLabel}
          </Button>
        </CardContent>
      </AuthPagePanel>
    </form>
  );
}
