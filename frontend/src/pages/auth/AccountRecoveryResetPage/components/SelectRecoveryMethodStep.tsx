import { ChevronRight, Info, KeyRound } from "lucide-react";
import { twMerge } from "tailwind-merge";

export enum RecoveryMethod {
  ChangePassword = "change-password",
  DomainOrSSOChange = "domain-or-sso-change"
}

type Props = {
  email: string;
  onSelect: (method: RecoveryMethod) => void;
  hasEmailAuthEnabled?: boolean;
};

export const SelectRecoveryMethodStep = ({ email, onSelect, hasEmailAuthEnabled }: Props) => {
  const recoveryMethods = [
    {
      method: RecoveryMethod.ChangePassword,
      label: "비밀번호 변경",
      description: "비밀번호를 잊었거나 보안을 위해 변경하려면 재설정하세요.",
      info: "이메일과 비밀번호로 로그인했다면 이 방법을 선택하세요.",
      onSelect: () => onSelect(RecoveryMethod.ChangePassword),
      isDisabled: !hasEmailAuthEnabled,
      disabledReason: "이 복구 방법을 사용하려면 이메일 로그인을 활성화해야 합니다."
    },
    {
      method: RecoveryMethod.DomainOrSSOChange,
      label: "도메인 또는 SSO 변경",
      description:
        "도메인 변경으로 Google 또는 SSO 계정에 접근할 수 없다면 이메일 로그인을 활성화해 계정을 복구하세요.",
      info: "Google로만 로그인했으며 해당 Google 계정에 접근할 수 없다면 이 방법을 선택하세요.",
      onSelect: () => onSelect(RecoveryMethod.DomainOrSSOChange),
      isDisabled: hasEmailAuthEnabled,
      disabledReason: "이미 이메일 로그인을 사용하고 있습니다."
    }
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center">
      <h1 className="mb-2 bg-gradient-to-b from-foreground-inverse to-foreground-soft bg-clip-text text-center text-2xl font-normal text-transparent">
        계정 복구
      </h1>
      <p className="mb-4 text-center text-sm text-label-cool">
        Email verified successfully for{" "}
        <span className="font-medium text-foreground-inverse">{email}</span>
      </p>
      <p className="mb-8 text-center text-sm text-muted-cool-secondary">
        계정 복구 방법을 선택하세요.
      </p>
      <div className="flex w-full flex-col gap-4">
        {recoveryMethods.map((recoveryMethod) => (
          <button
            key={recoveryMethod.method}
            type="button"
            onClick={recoveryMethod.onSelect}
            disabled={recoveryMethod.isDisabled}
            className={twMerge(
              "group w-full rounded-lg border border-border-control bg-surface-raised p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover",
              recoveryMethod.isDisabled && "cursor-not-allowed"
            )}
          >
            <div
              className={twMerge(
                "flex items-start gap-4",
                recoveryMethod.isDisabled && "opacity-50"
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-hover group-hover:bg-surface-active">
                <KeyRound className="text-lg text-label" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground-cool">{recoveryMethod.label}</span>
                </div>
                <p className="mt-1 text-sm text-muted-cool">{recoveryMethod.description}</p>
                <p className="mt-2 text-xs text-muted-cool-secondary">{recoveryMethod.info}</p>
              </div>
              <ChevronRight className="mt-3 text-muted-cool-secondary transition-transform group-hover:translate-x-1" />
            </div>
            {recoveryMethod.isDisabled && recoveryMethod.disabledReason && (
              <div className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-background" />
                <p className="text-xs text-background">{recoveryMethod.disabledReason}</p>
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="mt-6 w-full rounded-lg border border-border-control bg-surface-raised/50 p-4">
        <p className="font-medium text-label-cool">어떤 방법을 선택해야 하나요?</p>
        <p className="mt-2 text-sm text-muted-cool-secondary">
          조직의 이메일 도메인이 변경되었고 Google 로그인을 사용했다면 다음을 선택하세요:{" "}
          <span className="font-medium text-label-cool">&quot;Domain or SSO change&quot;</span>.
          비밀번호를 설정한 후 새 이메일로 로그인할 수 있습니다.
        </p>
      </div>
    </div>
  );
};
