import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";

import { PasswordField } from "@app/components/auth/PasswordField";
import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  AnimatedCollapse,
  Button,
  Field,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useResetPasswordV2 } from "@app/hooks/api";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";

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

type Props = {
  verificationToken: string;
  onComplete: () => void;
  onBack: () => void;
};

export const EnterPasswordStep = ({ verificationToken, onComplete, onBack }: Props) => {
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
  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password,
    policy: config.passwordPolicy
  });
  const { mutateAsync: resetPasswordV2, isPending } = useResetPasswordV2();

  const handlePasswordReset = async ({ password: nextPassword }: FormData) => {
    const latestBreachStatus = await validatePassword(nextPassword);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "알려진 유출 기록에서 발견된 비밀번호입니다."
      });
      return;
    }

    await resetPasswordV2({
      newPassword: nextPassword,
      verificationToken
    });
    onComplete();
  };

  const isLoading = isSubmitting || isPending;
  const showDangerState = submitCount > 0;
  const isPasswordValidated = breachStatus === "safe" || breachStatus === "unavailable";
  const doPasswordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <form
      onSubmit={handleSubmit(handlePasswordReset)}
      className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-y-4"
    >
      <h1 className="bg-gradient-to-b from-foreground-inverse to-foreground-soft bg-clip-text text-center text-xl font-normal text-transparent">
        새 비밀번호 입력
      </h1>
      <p className="w-max justify-center text-center text-sm text-muted-cool">
        비밀번호를 안전한 곳에 보관하세요.
      </p>
      <div className="mt-8 w-full">
        <PasswordField
          variant="outlined"
          id="account-recovery-password"
          value={password}
          policy={config.passwordPolicy}
          breachStatus={breachStatus}
          registration={register("password")}
          error={errors.password}
          submitCount={submitCount}
        />
      </div>
      <AnimatedCollapse
        isOpen={isPasswordValidated}
        className="w-full"
        contentClassName={isPasswordValidated ? "overflow-visible" : undefined}
      >
        <Field data-invalid={showDangerState && Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="account-recovery-confirm-password">비밀번호 확인</FieldLabel>
          <InputGroup variant="outlined">
            <InputGroupInput
              {...register("confirmPassword")}
              id="account-recovery-confirm-password"
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
          <AnimatedCollapse isOpen={confirmPassword.length > 0}>
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
        isFullWidth
        isPending={isLoading}
        isDisabled={isLoading || breachStatus === "checking" || breachStatus === "breached"}
      >
        비밀번호 변경
      </Button>
      <div>
        <Button type="button" variant="ghost" className="mt-6 text-label" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          <span className="text-sm">복구 방법으로 돌아가기</span>
        </Button>
      </div>
    </form>
  );
};
