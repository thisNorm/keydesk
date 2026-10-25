import { MFA_METHOD_LABELS, VerifyStep } from "@app/components/mfa/setup";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";

type Props = {
  method: MfaMethod | null;
  onOpenChange: (isOpen: boolean) => void;
  onCompleted: () => void;
};

// Lightweight single-method setup used from the enabled view (MFA is already on
// and recovery codes already exist, so no enable/recovery steps are needed).
export const MethodSetupDialog = ({ method, onOpenChange, onCompleted }: Props) => {
  return (
    <Dialog open={Boolean(method)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {method ? `Set up ${MFA_METHOD_LABELS[method]}` : "인증 방식 설정"}
          </DialogTitle>
          <DialogDescription>이 방식을 2단계 인증으로 설정하세요.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {method && (
            <VerifyStep
              method={method}
              variant="neutral"
              onVerified={() => {
                onCompleted();
                onOpenChange(false);
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
