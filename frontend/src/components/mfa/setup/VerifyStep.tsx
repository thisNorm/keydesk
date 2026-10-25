import { useEffect, useState } from "react";
import { FingerprintIcon } from "lucide-react";
import QRCode from "qrcode";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Skeleton,
  VerificationCodeForm
} from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useEnrollMfa, useGetUserTotpRegistration } from "@app/hooks/api/users";
import { useRegisterPasskey } from "@app/hooks/api/webauthn";

type Props = {
  method: MfaMethod;
  onVerified: () => void | Promise<void>;
  variant?: React.ComponentProps<typeof Button>["variant"];
};

const TotpVerify = ({
  onVerified,
  variant
}: {
  onVerified: Props["onVerified"];
  variant: Props["variant"];
}) => {
  const [hasRegistered, setHasRegistered] = useState(false);
  const { data: registration, isPending } = useGetUserTotpRegistration({ enabled: !hasRegistered });
  const { mutateAsync: enrollMfa, isPending: isVerifying } = useEnrollMfa();
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [totp, setTotp] = useState("");
  const [verificationError, setVerificationError] = useState<string>();

  useEffect(() => {
    if (registration?.otpUrl) {
      setHasRegistered(true);
      QRCode.toDataURL(registration.otpUrl).then(setQrCodeUrl);
    }
  }, [registration?.otpUrl]);

  const manualSecret = registration?.otpUrl?.split("secret=")[1]?.split("&")[0];

  const handleVerify = async () => {
    setVerificationError(undefined);
    try {
      await enrollMfa({ method: MfaMethod.TOTP, totp: totp.trim() });
      createNotification({ text: "인증 앱을 설정했습니다.", type: "success" });
      await onVerified();
    } catch {
      // The mutation's global error handler already surfaces the (more detailed)
      // failure toast; keep a local signal so the manual Retry action appears.
      setVerificationError("올바르지 않은 코드입니다. 다시 시도하세요.");
    }
  };

  if (isPending) {
    return (
      <div className="space-y-4" aria-label="인증 앱 설정을 불러오는 중">
        <Skeleton className="mx-auto h-44 w-44" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        인증 앱에서 QR 코드를 스캔한 후 표시되는 6자리 코드를 입력하세요.
      </p>
      <div className="flex items-center justify-center rounded-lg bg-white p-4">
        {qrCodeUrl ? (
          <img src={qrCodeUrl} alt="인증 앱 등록 QR 코드" className="h-44 w-44" />
        ) : (
          <div className="h-44 w-44" />
        )}
      </div>
      {manualSecret && (
        <p className="text-xs text-muted">
          스캔할 수 없다면 이 키를 직접 입력하세요:{" "}
          <code className="rounded border border-border bg-container px-2 py-0.5 font-mono text-foreground">
            {manualSecret}
          </code>
        </p>
      )}
      <VerificationCodeForm
        name="totp-enrollment-code"
        value={totp}
        onChange={(value, reason) => {
          setTotp(value.replace(/\D/g, "").slice(0, 6));
          if (reason === "input") setVerificationError(undefined);
        }}
        onSubmit={handleVerify}
        submitVariant={variant}
        isPending={isVerifying}
        error={verificationError}
      />
    </div>
  );
};

const WebAuthnVerify = ({
  onVerified,
  variant
}: {
  onVerified: Props["onVerified"];
  variant: Props["variant"];
}) => {
  const { registerPasskey, isRegistering } = useRegisterPasskey();
  const { mutateAsync: enrollMfa } = useEnrollMfa();
  const [name, setName] = useState("");

  const handleRegister = async () => {
    const ok = await registerPasskey(name, async (registrationResponse, resolvedName) => {
      await enrollMfa({
        method: MfaMethod.WEBAUTHN,
        registrationResponse,
        name: resolvedName
      });
    });
    if (ok) {
      await onVerified();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Face ID, Touch ID, 보안 키 또는 기기로 패스키를 등록하세요. 나중에 구분할 수 있도록 이름을
        지정할 수 있습니다.
      </p>
      <Field>
        <FieldLabel htmlFor="mfa-passkey-name">패스키 이름</FieldLabel>
        <Input
          id="mfa-passkey-name"
          variant="outlined"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="선택"
        />
        <FieldDescription>기기를 구분할 수 있는 이름을 사용하세요.</FieldDescription>
      </Field>
      <Button variant={variant} isPending={isRegistering} onClick={handleRegister}>
        <FingerprintIcon /> 패스키 등록
      </Button>
    </div>
  );
};

export const VerifyStep = ({ method, onVerified, variant = "project" }: Props) => {
  if (method === MfaMethod.TOTP) return <TotpVerify onVerified={onVerified} variant={variant} />;
  return <WebAuthnVerify onVerified={onVerified} variant={variant} />;
};
