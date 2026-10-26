import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { PauseIcon, RefreshCwIcon, XIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";

type Props = {
  appConnection: TAppConnection;
};

export const CredentialRotationStatusBadge = ({ appConnection }: Props) => {
  const { isAutoRotationEnabled, rotation } = appConnection;

  if (!rotation) {
    return null;
  }

  if (!isAutoRotationEnabled) {
    return (
      <Badge variant="neutral">
        <PauseIcon />
        자동 교체 꺼짐
      </Badge>
    );
  }

  if (rotation.rotationStatus === AppConnectionCredentialRotationStatus.Failed) {
    let errorMessage = rotation.lastRotationMessage;
    if (rotation.lastRotationMessage) {
      try {
        errorMessage = JSON.stringify(JSON.parse(rotation.lastRotationMessage), null, 2);
      } catch {
        errorMessage = rotation.lastRotationMessage;
      }
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="danger">
            <XIcon />
            교체 실패
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm select-text">
          <div className="flex flex-col gap-2 py-1 whitespace-normal">
            <div>
              <div className="mb-2 flex self-start text-danger">
                <XIcon className="mr-1.5 ml-1 size-3 shrink-0" />
                <div className="text-xs">실패 사유</div>
              </div>
              <div className="rounded-sm bg-surface-active p-2 text-xs break-words">
                {errorMessage}
              </div>
            </div>
            {rotation.nextRotationAt && (
              <span className="text-xs text-label">
                다음 교체 시도: {format(rotation.nextRotationAt, "yyyy/MM/dd")} 시각{" "}
                {format(rotation.nextRotationAt, "HH:mm")}.
              </span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  const daysToRotation =
    (new Date(rotation.nextRotationAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={daysToRotation >= 7 ? "info" : "warning"} className="capitalize">
          <RefreshCwIcon />
          {daysToRotation < 0
            ? "교체 중"
            : `교체 예정: ${formatDistanceToNow(rotation.nextRotationAt, { addSuffix: true, locale: ko })}`}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-lg">
        <span>
          교체 예정: {format(rotation.nextRotationAt, "yyyy/MM/dd")} 시각{" "}
          {format(rotation.nextRotationAt, "HH:mm")}
        </span>{" "}
        <span className="text-label">(현지 시간)</span>
      </TooltipContent>
    </Tooltip>
  );
};
