import { useState } from "react";
import { CircleAlertIcon, PowerIcon, ShieldCheckIcon } from "lucide-react";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS, RecoveryCodesView } from "@app/components/mfa/setup";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton
} from "@app/components/v3";
import { useGetOrganizations, useGetUser } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { useGetUserTotpConfiguration } from "@app/hooks/api/users";
import { AuthMethod } from "@app/hooks/api/users/types";
import { useGetWebAuthnCredentials } from "@app/hooks/api/webauthn";

import { MfaMethodsCard } from "./MfaMethodsCard";
import { RecoveryOptionsCard } from "./RecoveryOptionsCard";
import { useChangePreferredMfa } from "./useChangePreferredMfa";
import { useDisableMfa } from "./useDisableMfa";
import { useEnableMfa } from "./useEnableMfa";

export const MFASection = () => {
  const { data: user, isPending, isError: isUserError, refetch: refetchUser } = useGetUser();
  const { changePreferredMfa, isBusy: isChangingPreferred } = useChangePreferredMfa();
  const { isBusy: isEnabling, enableMfa } = useEnableMfa();
  const { isBusy: isDisabling, disableMfa } = useDisableMfa();
  const {
    data: totpConfiguration,
    isError: isTotpError,
    refetch: refetchTotp
  } = useGetUserTotpConfiguration();
  const {
    data: webAuthnData,
    isError: isWebAuthnError,
    refetch: refetchWebAuthn
  } = useGetWebAuthnCredentials();
  const webAuthnCredentials = webAuthnData?.credentials ?? [];
  const {
    data: organizations = [],
    isError: isOrganizationsError,
    refetch: refetchOrganizations
  } = useGetOrganizations();
  const {
    data: serverDetails,
    isError: isServerError,
    refetch: refetchServer
  } = useFetchServerStatus();

  const isMfaEnforced = organizations.some((org) => org.enforceMfa);
  const isEmailMfaAvailable = Boolean(serverDetails?.emailConfigured);

  const [isEnableOpen, setIsEnableOpen] = useState(false);
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  // Holds the fresh recovery codes returned on enable so they can be shown once.
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  // Gate closing the "save your codes" dialog until the user acknowledges they
  // saved them, since this is the only time the freshly minted codes are shown.
  const [hasAcknowledgedCodes, setHasAcknowledgedCodes] = useState(false);

  const closeRecoveryCodesDialog = () => {
    setNewRecoveryCodes(null);
    setHasAcknowledgedCodes(false);
  };

  if (isUserError || isTotpError || isWebAuthnError || isOrganizationsError || isServerError) {
    return (
      <Alert variant="danger">
        <CircleAlertIcon />
        <AlertTitle>2단계 인증 설정을 불러오지 못했습니다.</AlertTitle>
        <AlertDescription>
          <p>연결 상태를 확인하고 다시 시도하세요.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              Promise.all([
                refetchUser(),
                refetchTotp(),
                refetchWebAuthn(),
                refetchOrganizations(),
                refetchServer()
              ])
            }
          >
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isPending || !user) {
    return (
      <Card aria-label="2단계 인증 설정을 불러오는 중">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  if (user.authMethods?.includes(AuthMethod.LDAP)) {
    return (
      <Card role="region" aria-labelledby="two-factor-authentication-title">
        <CardHeader>
          <h2
            id="two-factor-authentication-title"
            className="font-alliance text-lg leading-none font-normal"
          >
            2단계 인증
          </h2>
          <CardDescription>LDAP 계정의 2단계 인증은 ID 공급자에서 관리합니다.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const availableMethods = [
    ...(isEmailMfaAvailable ? [MfaMethod.EMAIL] : []),
    ...(totpConfiguration?.isVerified ? [MfaMethod.TOTP] : []),
    ...(webAuthnCredentials.length > 0 ? [MfaMethod.WEBAUTHN] : [])
  ];

  const preferredMethod = user.selectedMfaMethod || MfaMethod.EMAIL;
  const selectedMethod = availableMethods.includes(preferredMethod)
    ? preferredMethod
    : availableMethods[0];

  const canEnable = availableMethods.length > 0;

  const hasRecoveryCodes = user.isMfaEnabled;

  const handleEnable = () => {
    if (!selectedMethod) return;
    setIsEnableOpen(false);
    enableMfa(selectedMethod, (recoveryCodes) => setNewRecoveryCodes(recoveryCodes));
  };

  // Changing the preferred method is sensitive, so it goes through the step-up MFA
  // challenge; the dropdown reflects the new value once getUser is invalidated on
  // success.
  const handlePreferredMethodChange = (method: MfaMethod) => changePreferredMfa(method);

  // Disabling is a sensitive action, so it requires a fresh MFA challenge (same
  // step-up flow as viewing recovery codes) before it goes through.
  const handleDisable = () => disableMfa(() => setIsDisableOpen(false));

  const header = (
    <CardHeader className="p-6">
      <h2
        id="two-factor-authentication-title"
        className="flex flex-wrap items-center gap-1.5 font-alliance text-lg leading-none font-normal"
      >
        Two-Factor Authentication
        {user.isMfaEnabled ? (
          <Badge variant="success">
            <ShieldCheckIcon /> 활성화됨
          </Badge>
        ) : (
          <Badge variant="danger">
            <CircleAlertIcon /> 비활성화됨
          </Badge>
        )}
      </h2>
      <CardDescription>
        {user.isMfaEnabled
          ? "인증 방식과 복구 방법을 관리하세요."
          : "로그인할 때 비밀번호 외에 추가 인증을 요청하여 계정을 보호합니다."}
      </CardDescription>
    </CardHeader>
  );

  const preferredMethodSection = (
    <section className="grid gap-4" aria-labelledby="preferred-2fa-method-title">
      <CardHeader>
        <div className="flex items-center gap-4">
          <h3
            id="preferred-2fa-method-title"
            className="shrink-0 font-alliance text-sm font-normal"
          >
            기본 2단계 인증 방식
          </h3>
          <Separator className="flex-1" />
        </div>
        <CardDescription>Infisical에 로그인할 때 먼저 사용할 방식을 설정하세요.</CardDescription>
      </CardHeader>
      <div className="max-w-xs">
        <Select
          value={selectedMethod}
          onValueChange={(value) => handlePreferredMethodChange(value as MfaMethod)}
          disabled={isChangingPreferred || availableMethods.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="방식 선택" />
          </SelectTrigger>
          <SelectContent>
            {availableMethods.map((method) => {
              const Icon = MFA_METHOD_ICONS[method];
              return (
                <SelectItem key={method} value={method}>
                  <span className="flex items-center gap-2">
                    <Icon />
                    {MFA_METHOD_LABELS[method]}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </section>
  );

  let footerDescription =
    "아래에서 인증 앱이나 패스키를 설정한 후 2단계 인증을 활성화하세요. 이 서버는 SMTP가 설정되지 않아 이메일 코드를 사용할 수 없습니다.";

  if (user.isMfaEnabled) {
    footerDescription = isMfaEnforced
      ? "조직에서 2단계 인증을 요구하므로 비활성화할 수 없습니다."
      : "비활성화하면 설정한 인증 방식은 유지되지만 복구 코드는 무효화됩니다.";
  } else if (canEnable) {
    footerDescription = "위에서 기본 인증 방식을 선택한 다음 2단계 인증을 활성화하세요.";
  }

  const footer = (
    <CardFooter className="min-h-8 flex-wrap justify-between gap-8 border-t border-neutral/15 bg-neutral/5 p-4 pl-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">{footerDescription}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {user.isMfaEnabled ? (
          <Button
            variant="danger"
            isDisabled={isMfaEnforced}
            onClick={() => setIsDisableOpen(true)}
          >
            <PowerIcon /> 2단계 인증 비활성화
          </Button>
        ) : (
          <Button
            variant="neutral"
            isDisabled={isEnabling || !canEnable}
            onClick={() => setIsEnableOpen(true)}
          >
            <ShieldCheckIcon /> 2단계 인증 활성화
          </Button>
        )}
      </div>
    </CardFooter>
  );

  return (
    <>
      <Card
        className="gap-0 overflow-hidden p-0"
        role="region"
        aria-labelledby="two-factor-authentication-title"
      >
        {header}
        <CardContent className="flex flex-col gap-6 px-6 pb-6">
          <MfaMethodsCard />
          {hasRecoveryCodes && <RecoveryOptionsCard />}
          {preferredMethodSection}
        </CardContent>
        {footer}
      </Card>

      <AlertDialog open={isEnableOpen} onOpenChange={setIsEnableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>2단계 인증을 활성화하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {MFA_METHOD_LABELS[selectedMethod]}을(를) 기본 방식으로 2단계 인증을 활성화합니다.
              다음 화면에 표시되는 복구 코드를 저장하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="neutral" isPending={isEnabling} onClick={handleEnable}>
              활성화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isDisableOpen}
        onOpenChange={(open) => !isDisabling && setIsDisableOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>2단계 인증을 비활성화하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              먼저 2단계 인증을 진행합니다. 이후 로그인할 때 추가 인증을 요청하지 않습니다. 설정한
              인증 방식은 유지되지만 현재 복구 코드는 무효화됩니다. 다시 활성화하면 새 복구 코드가
              발급됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isDisabling}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isDisabling}
              onClick={(event) => {
                event.preventDefault();
                handleDisable();
              }}
            >
              비활성화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={newRecoveryCodes !== null}
        onOpenChange={(open) => {
          if (!open && hasAcknowledgedCodes) closeRecoveryCodesDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={hasAcknowledgedCodes}
          onInteractOutside={(e) => !hasAcknowledgedCodes && e.preventDefault()}
          onEscapeKeyDown={(e) => !hasAcknowledgedCodes && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>복구 코드 저장</DialogTitle>
            <DialogDescription>
              안전한 곳에 보관하세요. 각 코드는 한 번만 사용할 수 있으며 이 화면을 닫으면 다시 볼 수
              없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            <RecoveryCodesView
              recoveryCodes={newRecoveryCodes ?? []}
              acknowledgment={{
                isAcknowledged: hasAcknowledgedCodes,
                onAcknowledgedChange: setHasAcknowledgedCodes,
                confirmLabel: "완료",
                onConfirm: closeRecoveryCodesDialog
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
