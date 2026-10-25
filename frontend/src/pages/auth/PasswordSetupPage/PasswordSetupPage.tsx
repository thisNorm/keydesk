import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { PasswordField } from "@app/components/auth/PasswordField";
import { createNotification } from "@app/components/notifications";
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useServerConfig } from "@app/context";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { useSetupPassword } from "@app/hooks/api/auth/queries";

const createSchema = (passwordPolicy: TPasswordPolicy) =>
  z
    .object({
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "비밀번호를 다시 입력하세요.")
    })
    .refine(({ confirmPassword, password }) => confirmPassword === password, {
      message: "비밀번호가 일치하지 않습니다.",
      path: ["confirmPassword"]
    });

type FormData = z.infer<ReturnType<typeof createSchema>>;

export const PasswordSetupPage = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { config } = useServerConfig();
  const {
    formState: { errors, isSubmitting, submitCount },
    handleSubmit,
    register,
    setError,
    watch
  } = useForm<FormData>({
    resolver: zodResolver(createSchema(config.passwordPolicy)),
    mode: "onChange",
    defaultValues: { password: "", confirmPassword: "" }
  });

  const search = useSearch({ from: ROUTE_PATHS.Auth.PasswordSetupPage.id });
  const navigate = useNavigate();
  const setupPassword = useSetupPassword();
  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password,
    policy: config.passwordPolicy
  });

  const token = search.token as string;
  const email = (search.to as string)?.replace(" ", "+").trim();

  const handleSetPassword = async ({ password: nextPassword }: FormData) => {
    const latestBreachStatus = await validatePassword(nextPassword);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "알려진 유출 기록에서 발견된 비밀번호입니다."
      });
      return;
    }

    try {
      await setupPassword.mutateAsync({ email, token, password: nextPassword });
      setIsRedirecting(true);
      createNotification({
        type: "success",
        title: "비밀번호를 설정했습니다.",
        text: "로그인 화면으로 이동 중..."
      });

      setTimeout(() => {
        window.location.href = "/login";
      }, 3000);
    } catch {
      navigate({ to: "/personal-settings" });
    }
  };

  const isLoading = isSubmitting || setupPassword.isPending || isRedirecting;
  const showDangerState = submitCount > 0;
  const isPasswordValidated = breachStatus === "safe" || breachStatus === "unavailable";
  const doPasswordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <AuthPageLayout variant="focused">
      <form className="w-full" onSubmit={handleSubmit(handleSetPassword)}>
        <AuthPagePanel>
          <CardHeader className="mb-6 gap-2">
            <CardTitle>비밀번호 설정</CardTitle>
            <CardDescription>비밀번호를 안전한 곳에 보관하세요.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PasswordField
              variant="outlined"
              id="password-setup-password"
              value={password}
              policy={config.passwordPolicy}
              breachStatus={breachStatus}
              registration={register("password")}
              error={showDangerState ? errors.password : undefined}
              submitCount={submitCount}
            />
            <AnimatedCollapse
              isOpen={isPasswordValidated}
              contentClassName={isPasswordValidated ? "overflow-visible" : undefined}
            >
              <Field data-invalid={showDangerState && Boolean(errors.confirmPassword)}>
                <FieldLabel htmlFor="password-setup-confirm-password">비밀번호 확인</FieldLabel>
                <InputGroup variant="outlined">
                  <InputGroupInput
                    {...register("confirmPassword")}
                    id="password-setup-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-invalid={showDangerState && Boolean(errors.confirmPassword)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      aria-label={
                        showConfirmPassword ? "확인 비밀번호 숨기기" : "확인 비밀번호 표시"
                      }
                    >
                      {showConfirmPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <AnimatedCollapse isOpen={confirmPassword.length > 0}>
                  <div className="flex items-start gap-2 pt-1 text-xs" aria-live="polite">
                    {doPasswordsMatch ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                    ) : (
                      <X className="mt-0.5 size-3.5 shrink-0 text-danger" />
                    )}
                    <span className={doPasswordsMatch ? "text-muted" : "text-danger"}>
                      {doPasswordsMatch
                        ? "비밀번호가 일치합니다."
                        : "비밀번호가 일치하지 않습니다."}
                    </span>
                  </div>
                </AnimatedCollapse>
                {showDangerState && errors.confirmPassword ? (
                  <FieldError>{errors.confirmPassword.message}</FieldError>
                ) : null}
              </Field>
            </AnimatedCollapse>
            <Button
              isDisabled={isLoading || breachStatus === "checking" || breachStatus === "breached"}
              variant="project"
              size="lg"
              type="submit"
              isFullWidth
              isPending={isLoading}
            >
              확인
            </Button>
          </CardContent>
        </AuthPagePanel>
      </form>
    </AuthPageLayout>
  );
};
