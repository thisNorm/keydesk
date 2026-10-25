import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LucideIcon } from "lucide-react";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS } from "@app/components/mfa/setup";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button
} from "@app/components/v3";
import { userKeys } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { useGetUserTotpConfiguration } from "@app/hooks/api/users";
import { useGetWebAuthnCredentials } from "@app/hooks/api/webauthn";

import { MethodSetupDialog } from "./MethodSetupDialog";
import { PasskeyManagerDialog } from "./PasskeyManagerDialog";
import { useRemoveTotp } from "./useRemoveTotp";

type MethodRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  badge: React.ReactNode;
  action: React.ReactNode;
};

const MethodRow = ({ icon: Icon, title, description, badge, action }: MethodRowProps) => (
  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]">
    <Icon className="row-span-2 row-start-1 size-6 text-muted" />
    <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-2">
      <p className="text-sm text-foreground">{title}</p>
      {badge}
    </div>
    <p className="col-start-2 row-start-2 text-sm text-muted">{description}</p>
    <div className="col-start-2 row-start-3 justify-self-end sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
      {action}
    </div>
  </div>
);

export const MfaMethodsCard = () => {
  const queryClient = useQueryClient();
  const { data: totpConfiguration } = useGetUserTotpConfiguration();
  const { data: webAuthnData } = useGetWebAuthnCredentials();
  const webAuthnCredentials = webAuthnData?.credentials ?? [];
  const { data: serverDetails } = useFetchServerStatus();
  const { removeTotp, isBusy: isRemovingTotp } = useRemoveTotp();

  const isEmailMfaAvailable = Boolean(serverDetails?.emailConfigured);

  const [setupMethod, setSetupMethod] = useState<MfaMethod | null>(null);
  const [isPasskeyManagerOpen, setIsPasskeyManagerOpen] = useState(false);
  const [isRemoveTotpOpen, setIsRemoveTotpOpen] = useState(false);

  const isTotpConfigured = Boolean(totpConfiguration?.isVerified);
  const passkeyCount = webAuthnCredentials.length;

  // Removing weakens a login second factor, so it goes through the step-up MFA
  // challenge; the dialog stays open until the challenge completes and the removal
  // succeeds.
  const handleRemoveTotp = () => removeTotp(() => setIsRemoveTotpOpen(false));

  return (
    <section aria-label="2단계 인증 방식">
      <div className="divide-y divide-border">
        <MethodRow
          icon={MFA_METHOD_ICONS[MfaMethod.EMAIL]}
          title={MFA_METHOD_LABELS[MfaMethod.EMAIL]}
          description={
            isEmailMfaAvailable
              ? "계정 이메일로 일회용 코드를 받아 로그인을 완료하세요."
              : "이 서버는 SMTP가 설정되지 않아 사용할 수 없습니다. 인증 앱이나 패스키를 사용하세요."
          }
          badge={
            isEmailMfaAvailable ? (
              <Badge variant="success">설정됨</Badge>
            ) : (
              <Badge variant="neutral">사용 불가</Badge>
            )
          }
          action={null}
        />

        <MethodRow
          icon={MFA_METHOD_ICONS[MfaMethod.TOTP]}
          title={MFA_METHOD_LABELS[MfaMethod.TOTP]}
          description="로그인할 때 TOTP 인증 앱에서 일회용 코드를 확인하세요."
          badge={
            isTotpConfigured ? (
              <Badge variant="success">설정됨</Badge>
            ) : (
              <Badge variant="neutral">없음</Badge>
            )
          }
          action={
            isTotpConfigured ? (
              <Button variant="outline" size="sm" onClick={() => setIsRemoveTotpOpen(true)}>
                삭제
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSetupMethod(MfaMethod.TOTP)}>
                설정
              </Button>
            )
          }
        />

        <MethodRow
          icon={MFA_METHOD_ICONS[MfaMethod.WEBAUTHN]}
          title="패스키"
          description="패스키로 Face ID, Touch ID, 보안 키 또는 기기를 사용해 로그인할 수 있습니다."
          badge={
            passkeyCount > 0 ? (
              <Badge variant="success">{`${passkeyCount}개 등록됨`}</Badge>
            ) : (
              <Badge variant="neutral">없음</Badge>
            )
          }
          action={
            <Button variant="outline" size="sm" onClick={() => setIsPasskeyManagerOpen(true)}>
              관리
            </Button>
          }
        />
      </div>

      <MethodSetupDialog
        method={setupMethod}
        onOpenChange={(isOpen) => !isOpen && setSetupMethod(null)}
        onCompleted={() => queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration })}
      />

      <PasskeyManagerDialog isOpen={isPasskeyManagerOpen} onOpenChange={setIsPasskeyManagerOpen} />

      <AlertDialog
        open={isRemoveTotpOpen}
        onOpenChange={(open) => !isRemovingTotp && setIsRemoveTotpOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>인증 앱을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              다시 2단계 인증에 사용하려면 재설정해야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRemovingTotp}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRemovingTotp}
              onClick={(event) => {
                event.preventDefault();
                handleRemoveTotp();
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
