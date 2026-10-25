import { useMemo, useState } from "react";
import { FieldError as ReactHookFormFieldError, UseFormRegisterReturn } from "react-hook-form";
import { Check, Eye, EyeOff, LoaderCircle, X } from "lucide-react";

import { getPasswordRequirements } from "@app/components/utilities/checks/password/passwordPolicy";
import { PasswordBreachCheckStatus } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  AnimatedCollapse,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  type InputGroupProps
} from "@app/components/v3";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";

type PasswordFieldProps = {
  id: string;
  value: string;
  policy: TPasswordPolicy;
  breachStatus: PasswordBreachCheckStatus;
  registration: UseFormRegisterReturn;
  label?: string;
  placeholder?: string;
  error?: ReactHookFormFieldError;
  submitCount: number;
  variant?: InputGroupProps["variant"];
  isRequired?: boolean;
};

export const PasswordField = ({
  id,
  value,
  policy,
  breachStatus,
  registration,
  label = "비밀번호",
  placeholder,
  error,
  submitCount,
  variant = "default",
  isRequired = false
}: PasswordFieldProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const requirements = useMemo(() => getPasswordRequirements(value, policy), [policy, value]);
  const visibleRequirements = requirements.filter(({ isMet, isPrimary }) => isPrimary || !isMet);
  const showRequirements = value.length > 0;

  const requirementsId = `${id}-requirements`;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>
        {label}
        {isRequired && (
          <span aria-hidden className="text-danger">
            *
          </span>
        )}
      </FieldLabel>
      <InputGroup variant={variant}>
        <InputGroupInput
          {...registration}
          id={id}
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
          aria-required={isRequired || undefined}
          aria-describedby={showRequirements ? requirementsId : undefined}
          onFocus={() => setIsFocused(true)}
          onBlur={(event) => {
            registration.onBlur(event);
            setIsFocused(false);
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {!showRequirements && error?.message && <FieldError>{error.message}</FieldError>}
      <AnimatedCollapse isOpen={showRequirements}>
        <div id={requirementsId} className="flex flex-col gap-1 pt-1" aria-live="polite">
          {visibleRequirements.map(({ code, isMet, message }) => (
            <div className="flex items-start gap-2 text-xs" key={code}>
              {isMet ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <X
                  className={`mt-0.5 size-3.5 shrink-0 ${
                    !isFocused && submitCount > 0 ? "text-danger" : "text-muted"
                  }`}
                />
              )}
              <span className={isMet ? "text-muted" : "text-accent"}>{message}</span>
            </div>
          ))}
          {breachStatus === "checking" && (
            <FieldDescription className="flex items-center gap-2">
              <LoaderCircle className="size-3.5 animate-spin" /> 알려진 유출 기록 확인 중…
            </FieldDescription>
          )}
          {breachStatus === "safe" && (
            <FieldDescription className="flex items-center gap-2 text-success">
              <Check className="size-3.5" /> 알려진 유출 기록에서 일치하는 비밀번호를 찾지
              못했습니다.
            </FieldDescription>
          )}
          {breachStatus === "breached" && (
            <FieldError>알려진 유출 기록에서 발견된 비밀번호입니다.</FieldError>
          )}
          {breachStatus === "unavailable" && (
            <FieldDescription>
              유출 여부를 확인할 수 없습니다. 다른 비밀번호 조건은 충족해야 합니다.
            </FieldDescription>
          )}
        </div>
      </AnimatedCollapse>
    </Field>
  );
};
