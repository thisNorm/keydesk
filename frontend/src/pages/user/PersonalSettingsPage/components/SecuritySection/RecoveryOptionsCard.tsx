import { useState } from "react";
import { EyeIcon, KeyRoundIcon, RefreshCwIcon } from "lucide-react";

import { RecoveryCodesView } from "@app/components/mfa/setup";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Separator
} from "@app/components/v3";

import { useRecoveryCodesMfa } from "./useRecoveryCodesMfa";

export const RecoveryOptionsCard = () => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [hasAcknowledgedCodes, setHasAcknowledgedCodes] = useState(false);

  const {
    isBusy,
    codes,
    isSheetOpen,
    requiresAcknowledgment,
    closeSheet,
    viewCodes,
    regenerateCodes
  } = useRecoveryCodesMfa();

  const closeCodesDialog = () => {
    closeSheet();
    setHasAcknowledgedCodes(false);
  };

  const handleRegenerate = () => {
    setIsConfirmOpen(false);
    regenerateCodes();
  };

  return (
    <section className="grid gap-4" aria-labelledby="recovery-options-title">
      <CardHeader>
        <div className="flex items-center gap-4">
          <h3 id="recovery-options-title" className="shrink-0 font-alliance text-sm font-normal">
            복구 방법
          </h3>
          <Separator className="flex-1" />
        </div>
      </CardHeader>
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]">
        <KeyRoundIcon className="row-span-2 row-start-1 size-6 text-muted" />
        <p className="col-start-2 row-start-1 text-sm text-foreground">복구 코드</p>
        <p className="col-start-2 row-start-2 text-sm text-muted">
          다른 인증 방식을 사용할 수 없을 때 복구 코드로 로그인할 수 있습니다. 각 코드는 한 번만
          사용할 수 있습니다.
        </p>
        <div className="col-start-2 row-start-3 flex flex-wrap items-center gap-2 justify-self-end sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
          <Button variant="outline" size="sm" isDisabled={isBusy} onClick={viewCodes}>
            <EyeIcon /> 보기
          </Button>
          <Button
            variant="outline"
            size="sm"
            isDisabled={isBusy}
            onClick={() => setIsConfirmOpen(true)}
          >
            <RefreshCwIcon /> 다시 생성
          </Button>
        </div>
      </div>

      <Dialog
        open={isSheetOpen}
        onOpenChange={(open) => {
          if (open) return;
          if (!requiresAcknowledgment || hasAcknowledgedCodes) closeCodesDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!requiresAcknowledgment || hasAcknowledgedCodes}
          onInteractOutside={(e) =>
            requiresAcknowledgment && !hasAcknowledgedCodes && e.preventDefault()
          }
          onEscapeKeyDown={(e) =>
            requiresAcknowledgment && !hasAcknowledgedCodes && e.preventDefault()
          }
        >
          <DialogHeader>
            <DialogTitle>복구 코드</DialogTitle>
            <DialogDescription>
              안전한 곳에 보관하세요. 각 코드는 한 번만 사용할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            <RecoveryCodesView
              recoveryCodes={codes ?? []}
              acknowledgment={
                requiresAcknowledgment
                  ? {
                      isAcknowledged: hasAcknowledgedCodes,
                      onAcknowledgedChange: setHasAcknowledgedCodes,
                      confirmLabel: "완료",
                      onConfirm: closeCodesDialog
                    }
                  : undefined
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>복구 코드를 다시 생성하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              새 복구 코드를 만들면 기존 코드는 즉시 무효화됩니다. 먼저 2단계 인증을 진행합니다. 새
              코드를 안전한 곳에 보관하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isBusy} onClick={handleRegenerate}>
              다시 생성
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
