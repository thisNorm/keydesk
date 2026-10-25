import { ComponentProps } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

import { RecoveryCodesView } from "./RecoveryCodesView";

type Props = {
  recoveryCodes: string[];
  onSaved?: () => void;
  acknowledgment?: ComponentProps<typeof RecoveryCodesView>["acknowledgment"];
};

// Shared final step of MFA setup: shows the newly minted recovery codes with a
// save prompt.
export const RecoveryCodesStep = ({ recoveryCodes, onSaved, acknowledgment }: Props) => {
  return (
    <>
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>복구 코드 저장</AlertTitle>
        <AlertDescription>
          안전한 곳에 보관하세요. 각 코드는 한 번만 사용할 수 있으며 다른 인증 방식을 사용할 수 없을
          때 로그인할 수 있습니다.
        </AlertDescription>
      </Alert>
      <RecoveryCodesView
        recoveryCodes={recoveryCodes}
        onSaved={onSaved}
        acknowledgment={acknowledgment}
      />
    </>
  );
};
