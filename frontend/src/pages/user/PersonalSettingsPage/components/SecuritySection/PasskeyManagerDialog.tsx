import { useState } from "react";
import { FingerprintIcon, PlusIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";

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
  Button,
  Field,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton
} from "@app/components/v3";
import { useGetWebAuthnCredentials, useRegisterPasskey } from "@app/hooks/api/webauthn";

import { useRemovePasskey } from "./useRemovePasskey";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PasskeyManagerDialog = ({ isOpen, onOpenChange }: Props) => {
  const { data, isPending, isError, refetch } = useGetWebAuthnCredentials();
  const credentials = data?.credentials ?? [];
  const { registerPasskey, isRegistering } = useRegisterPasskey();
  const { removePasskey, isBusy: isRemoving } = useRemovePasskey();

  const [name, setName] = useState("");
  const [credentialToRemove, setCredentialToRemove] = useState<{ id: string; name: string } | null>(
    null
  );

  const handleAdd = async () => {
    if (await registerPasskey(name)) {
      setName("");
    }
  };

  // Hardware security keys registered before the server pinned ES256/RS256 may hold an
  // EdDSA credential that FIPS instances cannot verify at sign-in. We can't inspect the
  // credential's algorithm client-side, so on FIPS instances surface a soft notice
  // whenever a security-key credential is present. Platform and phone passkeys always
  // report "internal"/"hybrid" transports and are unaffected, and non-FIPS instances
  // verify EdDSA fine.
  const hasSecurityKeyCredential =
    Boolean(data?.fipsEnabled) &&
    credentials.some(
      (credential) =>
        !credential.transports?.length ||
        !credential.transports.some(
          (transport) => transport === "internal" || transport === "hybrid"
        )
    );

  // Removing weakens a login second factor, so it goes through the step-up MFA
  // challenge; the confirm dialog stays open until the challenge completes and the
  // removal succeeds.
  const handleDelete = () => {
    if (!credentialToRemove) return;
    removePasskey(credentialToRemove.id, () => setCredentialToRemove(null));
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>패스키 관리</SheetTitle>
            <SheetDescription>
              패스키로 Face ID, Touch ID, 보안 키 또는 기기를 사용해 로그인할 수 있습니다.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
              <Field className="flex-1">
                <FieldLabel htmlFor="new-passkey-name">패스키 이름</FieldLabel>
                <Input
                  id="new-passkey-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="새 패스키 이름 (선택)"
                />
              </Field>
              <Button variant="neutral" isPending={isRegistering} onClick={handleAdd}>
                <PlusIcon /> 추가
              </Button>
            </div>

            {hasSecurityKeyCredential && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertTitle>하드웨어 보안 키를 사용하나요?</AlertTitle>
                <AlertDescription>
                  <p>
                    이전에 등록한 YubiKey 등의 보안 키는 일부 서버에서 2단계 인증에 실패하는 서명
                    방식을 사용할 수 있습니다. 보안 키 로그인이 실패하면 여기에서 키를 삭제한 후
                    다시 등록하세요.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {isPending && (
              <div className="flex flex-col gap-2" aria-label="패스키를 불러오는 중">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}
            {!isPending && isError && (
              <Alert variant="danger">
                <TriangleAlertIcon />
                <AlertTitle>패스키를 불러오지 못했습니다.</AlertTitle>
                <AlertDescription>
                  <Button size="sm" variant="outline" onClick={() => refetch()}>
                    다시 시도
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {!isPending && !isError && (
              <div className="flex flex-col gap-2">
                {credentials.length === 0 && (
                  <p className="rounded-lg border border-border bg-container p-4 text-center text-sm text-muted">
                    등록한 패스키가 없습니다.
                  </p>
                )}
                {credentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="flex flex-col items-stretch justify-between gap-3 rounded-lg border border-border bg-container p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FingerprintIcon className="text-muted" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {credential.name || "이름 없는 패스키"}
                        </p>
                        <p className="text-xs text-muted">
                          등록: {new Date(credential.createdAt).toLocaleDateString("ko-KR")}
                          {credential.lastUsedAt &&
                            ` · 최근 사용: ${new Date(credential.lastUsedAt).toLocaleDateString("ko-KR")}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      className="self-end sm:self-auto"
                      onClick={() =>
                        setCredentialToRemove({
                          id: credential.id,
                          name: credential.name || "이름 없는 패스키"
                        })
                      }
                    >
                      <TrashIcon /> 삭제
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={credentialToRemove !== null}
        onOpenChange={(open) => !open && !isRemoving && setCredentialToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>패스키를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${credentialToRemove?.name}" 패스키를 2단계 인증에 사용할 수 없게 됩니다. 언제든지 다시 등록할 수 있습니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRemoving}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
