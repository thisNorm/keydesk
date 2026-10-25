import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useNavigate } from "@tanstack/react-router";
import { t } from "i18next";
import { CircleXIcon } from "lucide-react";

import { MfaEnrollment } from "@app/components/mfa/MfaEnrollment";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Alert,
  AlertDescription,
  Button,
  CardContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useClientResendDelay,
  VerificationCodeForm,
  VerificationCodeHeader,
  VerificationCodeResend
} from "@app/components/v3";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useActivateMfa, useLogoutUser, useSendMfaToken } from "@app/hooks/api";
import {
  checkUserTotpMfa,
  checkUserWebAuthnMfa,
  verifyMfaToken,
  verifyRecoveryCode
} from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { useGenerateAuthenticationOptions, useVerifyAuthentication } from "@app/hooks/api/webauthn";

import { RecoveryCodesStep } from "../mfa/setup";
import { AuthPageLayout } from "./AuthPageLayout";
import { AuthPagePanel } from "./AuthPagePanel";
import { waitForMinimumAuthVerificationLoading } from "./authTiming";

const MAX_MFA_ATTEMPTS = 5;
const CLIENT_RESEND_DELAY_SECONDS = 20;

type Props = {
  successCallback: () => void | Promise<void>;
  closeMfa?: () => void;
  email: string;
  method: MfaMethod;
  onChangeAccount?: () => void | Promise<void>;
};

export const Mfa = ({ successCallback, closeMfa, email, method, onChangeAccount }: Props) => {
  const [mfaCode, setMfaCode] = useState("");
  const [showRecoveryCodeInput, setShowRecoveryCodeInput] = useState(false);
  const resendDelay = useClientResendDelay(
    method === MfaMethod.EMAIL ? CLIENT_RESEND_DELAY_SECONDS : 0
  );
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);
  const [shouldShowTotpRegistration, setShouldShowTotpRegistration] = useState(false);
  const [shouldShowWebAuthnRegistration, setShouldShowWebAuthnRegistration] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [hasSavedRecoveryCodes, setHasSavedRecoveryCodes] = useState(false);
  const wasMfaEnabledRef = useRef(true);
  const { mutateAsync: activateMfa } = useActivateMfa();
  const logout = useLogoutUser();

  const { mutateAsync: generateWebAuthnAuthenticationOptions } = useGenerateAuthenticationOptions();
  const { mutateAsync: verifyWebAuthnAuthentication } = useVerifyAuthentication();

  const sendMfaToken = useSendMfaToken();

  useEffect(() => {
    fetchUserDetails()
      .then((user) => {
        wasMfaEnabledRef.current = Boolean(user.isMfaEnabled);
      })
      .catch(() => {
        // Keep the safe default (treat as enabled) so existing codes are never rotated.
      });

    if (method === MfaMethod.TOTP) {
      checkUserTotpMfa().then((isVerified) => {
        if (!isVerified) {
          SecurityClient.setMfaToken("");
          setShouldShowTotpRegistration(true);
        }
      });
    } else if (method === MfaMethod.WEBAUTHN) {
      checkUserWebAuthnMfa().then((hasPasskeys) => {
        if (!hasPasskeys) {
          setShouldShowWebAuthnRegistration(true);
        }
      });
    }
  }, [method]);

  const getExpectedCodeLength = () => {
    // Recovery codes are account-level and 8 characters for every MFA method
    // (email, TOTP and passkeys).
    if (showRecoveryCodeInput) return 8;
    return 6;
  };

  const isCodeComplete = mfaCode.length === getExpectedCodeLength();

  const getRecoveryToggleLabel = () => {
    if (!showRecoveryCodeInput) return "복구 코드 사용";
    if (method === MfaMethod.WEBAUTHN) return "패스키 사용";
    if (method === MfaMethod.EMAIL) return "이메일 코드 사용";
    return "인증 앱 코드 사용";
  };

  const completeLogin = async () => {
    await successCallback();
    if (closeMfa) {
      closeMfa();
    }
  };

  // Runs only after MFA verification has already succeeded: the MFA token is consumed
  // and a real session token is issued. Enabling MFA + minting recovery codes is a
  // distinct follow-up step and must NOT share the verification's error handling — if
  // it fails, the user's code was still accepted, so bouncing them back to the code
  // entry (where resubmitting a consumed code can never work) or decrementing the retry
  // counter would trap them. On failure we surface a dedicated message and let them
  // proceed; recovery codes can be generated later from account security settings.
  const finalizeAfterMfaVerification = async (
    sessionToken: string,
    mfaMethod: MfaMethod,
    isRecoveryCodeFlow: boolean
  ) => {
    setTriesLeft(undefined);
    SecurityClient.setMfaToken("");
    SecurityClient.setToken(sessionToken);

    if (!isRecoveryCodeFlow && !wasMfaEnabledRef.current) {
      try {
        const { recoveryCodes } = await activateMfa({ selectedMfaMethod: mfaMethod });
        setNewRecoveryCodes(recoveryCodes);
        return;
      } catch {
        createNotification({
          text: "신원 인증은 완료했지만 2단계 인증 설정을 마치지 못했습니다. 개인 보안 설정에서 복구 코드를 설정할 수 있습니다.",
          type: "error"
        });
      }
    }

    await completeLogin();
  };

  const verifyMfa = async () => {
    if (!mfaCode.trim() || !isCodeComplete) return;

    const verificationStartedAt = Date.now();
    setIsLoading(true);

    let sessionToken: string;
    try {
      const result = showRecoveryCodeInput
        ? await verifyRecoveryCode(mfaCode.trim())
        : await verifyMfaToken({
            email,
            mfaCode: mfaCode.trim(),
            mfaMethod: method
          });
      sessionToken = result.token;
    } catch {
      if (typeof triesLeft === "number") {
        const newTriesLeft = triesLeft - 1;
        setTriesLeft(newTriesLeft);
        if (newTriesLeft <= 0) {
          createNotification({
            text: "로그인 실패가 반복되어 계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도하거나 비밀번호를 재설정하세요.",
            type: "error"
          });
          SecurityClient.setMfaToken("");
          SecurityClient.setToken("");
          SecurityClient.setSignupToken("");
          await logout.mutateAsync();
          navigate({ to: "/login" });
          return;
        }
      } else {
        setTriesLeft(MAX_MFA_ATTEMPTS - 1);
      }
      setIsLoading(false);
      return;
    }

    try {
      await waitForMinimumAuthVerificationLoading(verificationStartedAt);
      await finalizeAfterMfaVerification(sessionToken, method, showRecoveryCodeInput);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendMfaCode = async () => {
    try {
      setIsLoadingResend(true);
      await sendMfaToken.mutateAsync({ email });
      resendDelay.restartDelay();
      setIsLoadingResend(false);
    } catch (err) {
      console.error(err);
      setIsLoadingResend(false);
    }
  };

  const handleWebAuthnVerification = async () => {
    const verificationStartedAt = Date.now();
    setIsLoading(true);
    const mfaToken = getMfaTempToken();

    let sessionToken: string;
    try {
      SecurityClient.setMfaToken("");

      // Get authentication options from server
      const options = await generateWebAuthnAuthenticationOptions();

      // Prompt user to authenticate with their passkey
      const authenticationResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const result = await verifyWebAuthnAuthentication({ authenticationResponse });

      // Nothing to verify against without a session token; bail out without counting
      // this as a failed attempt.
      if (!result.sessionToken) {
        setIsLoading(false);
        return;
      }

      // Use the sessionToken to verify MFA
      SecurityClient.setMfaToken(mfaToken);
      const mfaResult = await verifyMfaToken({
        email,
        mfaCode: result.sessionToken,
        mfaMethod: MfaMethod.WEBAUTHN
      });
      sessionToken = mfaResult.token;
    } catch (error: any) {
      console.error("WebAuthn verification failed:", error);

      let errorMessage = "패스키를 인증하지 못했습니다.";
      if (error.name === "NotAllowedError") {
        errorMessage = "패스키 인증을 취소했거나 시간이 초과되었습니다.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      SecurityClient.setMfaToken(mfaToken);

      createNotification({
        text: errorMessage,
        type: "error"
      });

      if (typeof triesLeft === "number") {
        const newTriesLeft = triesLeft - 1;
        setTriesLeft(newTriesLeft);
        if (newTriesLeft <= 0) {
          createNotification({
            text: "로그인 실패가 반복되어 계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도하세요.",
            type: "error"
          });
          SecurityClient.setMfaToken("");
          SecurityClient.setToken("");
          SecurityClient.setSignupToken("");
          await logout.mutateAsync();
          navigate({ to: "/login" });
          return;
        }
      } else {
        setTriesLeft(MAX_MFA_ATTEMPTS - 1);
      }
      setIsLoading(false);
      return;
    }

    try {
      await waitForMinimumAuthVerificationLoading(verificationStartedAt);
      await finalizeAfterMfaVerification(sessionToken, MfaMethod.WEBAUTHN, false);
    } finally {
      setIsLoading(false);
    }
  };

  if (newRecoveryCodes) {
    return (
      <AuthPageLayout variant="focused" showFooter={false}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <RecoveryCodesStep
            recoveryCodes={newRecoveryCodes}
            acknowledgment={{
              isAcknowledged: hasSavedRecoveryCodes,
              onAcknowledgedChange: setHasSavedRecoveryCodes,
              confirmLabel: "계속",
              isConfirmPending: isLoading,
              labelClassName: "text-foreground-soft",
              onConfirm: async () => {
                setIsLoading(true);
                try {
                  await completeLogin();
                } finally {
                  setIsLoading(false);
                }
              }
            }}
          />
        </div>
      </AuthPageLayout>
    );
  }

  if (shouldShowTotpRegistration || shouldShowWebAuthnRegistration) {
    return (
      <AuthPageLayout variant="focused" showFooter={false} contentClassName="max-w-xl">
        <MfaEnrollment
          method={method}
          onComplete={async () => {
            setShouldShowTotpRegistration(false);
            setShouldShowWebAuthnRegistration(false);
            await successCallback();
          }}
        />
      </AuthPageLayout>
    );
  }

  let headerTitle = "2단계 인증";
  let headerDescription: string | undefined;
  let headerRecipient: string | undefined;

  if (showRecoveryCodeInput) {
    headerDescription = "백업 복구 코드 중 하나를 입력하세요.";
  } else if (method === MfaMethod.EMAIL) {
    headerTitle = String(t("mfa.step2-message"));
    headerRecipient = email;
  } else if (method === MfaMethod.TOTP) {
    headerDescription = "인증 앱에 표시된 인증 코드를 입력하세요.";
  } else if (method === MfaMethod.WEBAUTHN) {
    headerTitle = "패스키 인증";
    headerDescription = "등록한 패스키로 계속 진행하세요.";
  }

  const recoveryActions = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {showRecoveryCodeInput ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-label transition-colors duration-200 hover:text-foreground">
              복구 코드를 잃어버렸나요?
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="max-w-xs text-center text-xs">
              {isInfisicalCloud() ? (
                <>
                  <div className="mb-2">계정 복구 필요</div>
                  <div className="mb-2 text-accent">
                    계정 소유권을 증명할 자료와 함께 지원팀에 복구를 요청하세요.
                  </div>
                  <div className="mt-1">support@infisical.com</div>
                </>
              ) : (
                <>
                  <div className="mb-2">계정 복구 필요</div>
                  <div className="text-accent">
                    계정 소유권을 증명할 자료와 함께 서버 관리자에게 복구를 요청하세요.
                  </div>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        method === MfaMethod.EMAIL && (
          <VerificationCodeResend
            isResending={isLoadingResend}
            remainingSeconds={resendDelay.remainingSeconds}
            onResend={handleResendMfaCode}
          />
        )
      )}
      <button
        type="button"
        onClick={() => {
          setShowRecoveryCodeInput(!showRecoveryCodeInput);
          setMfaCode("");
        }}
        className="ml-auto cursor-pointer text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
      >
        {getRecoveryToggleLabel()}
      </button>
    </div>
  );

  return (
    <AuthPageLayout variant="focused" showFooter={false}>
      <AuthPagePanel>
        <VerificationCodeHeader
          title={headerTitle}
          recipient={headerRecipient}
          description={headerDescription}
          action={
            onChangeAccount ? (
              <button
                aria-label={`${email} 로그아웃`}
                className="shrink-0 cursor-pointer text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
                onClick={onChangeAccount}
                type="button"
              >
                로그아웃
              </button>
            ) : undefined
          }
        />
        <CardContent>
          {method === MfaMethod.WEBAUTHN && !showRecoveryCodeInput ? (
            <div className="flex flex-col gap-5">
              {typeof triesLeft === "number" && (
                <Alert variant="danger">
                  <CircleXIcon />
                  <AlertDescription>
                    {`Failed authentication. You have ${triesLeft} attempt(s) remaining.`}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                size="lg"
                onClick={handleWebAuthnVerification}
                isFullWidth
                variant="project"
                isPending={isLoading}
                isDisabled={typeof triesLeft === "number" && triesLeft <= 0}
              >
                패스키로 인증
              </Button>
              {recoveryActions}
            </div>
          ) : (
            <VerificationCodeForm
              key={showRecoveryCodeInput ? "recovery" : method}
              name="mfa-code"
              fields={showRecoveryCodeInput ? 8 : 6}
              value={mfaCode}
              onChange={setMfaCode}
              onSubmit={verifyMfa}
              isPending={isLoading}
              isDisabled={typeof triesLeft === "number" && triesLeft <= 0}
              error={
                typeof triesLeft === "number"
                  ? `Invalid code. You have ${triesLeft} attempt(s) remaining.`
                  : undefined
              }
            >
              {recoveryActions}
            </VerificationCodeForm>
          )}
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
