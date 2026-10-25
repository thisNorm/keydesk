import { useState } from "react";
import { formatDistanceStrict } from "date-fns";
import { ko } from "date-fns/locale";
import { AlertCircleIcon, ServerIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGetMySessions, useRevokeMySessionById } from "@app/hooks/api";
import { formatSessionUserAgent } from "@app/lib/fn/string";

const formatLocalDateTime = (date: Date): string => {
  return date.toLocaleString("ko-KR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

export const SessionsTable = () => {
  const { data, isPending, isError, refetch } = useGetMySessions();
  const { mutateAsync: revokeMySessionById, isPending: isRevoking } = useRevokeMySessionById();
  const [sessionToRevoke, setSessionToRevoke] = useState<{
    id: string;
    ip: string;
    browser: string;
  } | null>(null);

  const handleSignOut = async (sessionId: string) => {
    try {
      await revokeMySessionById(sessionId);
      createNotification({
        text: "세션을 로그아웃했습니다.",
        type: "success"
      });
      setSessionToRevoke(null);
    } catch {
      createNotification({
        text: "세션을 로그아웃하지 못했습니다.",
        type: "error"
      });
    }
  };

  if (isError) {
    return (
      <Alert variant="danger">
        <AlertCircleIcon />
        <AlertTitle>세션을 불러오지 못했습니다.</AlertTitle>
        <AlertDescription>
          <p>연결 상태를 확인하고 다시 시도하세요.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!isPending && data?.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerIcon />
          </EmptyMedia>
          <EmptyTitle>활성 세션이 없습니다.</EmptyTitle>
          <EmptyDescription>로그인한 브라우저와 CLI 세션이 여기에 표시됩니다.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IP 및 세션 ID</TableHead>
            <TableHead>기기</TableHead>
            <TableHead>최근 접속</TableHead>
            <TableHead className="w-px">
              <span className="sr-only">작업</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending &&
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={`session-skeleton-${index + 1}`}>
                {Array.from({ length: 4 }).map((__, cellIndex) => (
                  <TableCell key={`session-skeleton-cell-${cellIndex + 1}`}>
                    <Skeleton className="h-4 w-full max-w-36" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {data?.map(({ id, createdAt, lastUsed, ip, userAgent }) => {
            const { os, browser } = formatSessionUserAgent(userAgent);
            const lastUsedDate = new Date(lastUsed);
            const createdAtDate = new Date(createdAt);

            return (
              <TableRow key={`session-${id}`}>
                <TableCell className="h-auto py-2">
                  <div className="flex min-w-44 flex-col">
                    <span className="text-sm leading-5 font-medium">{ip || "알 수 없는 IP"}</span>
                    <span
                      className="max-w-64 truncate font-mono text-xs leading-4 text-muted"
                      title={id}
                    >
                      {id}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="h-auto py-2">
                  <div className="flex flex-col">
                    <span className="text-sm leading-5 font-medium">
                      {os || "알 수 없는 운영 체제"}
                    </span>
                    <span className="text-xs leading-4 text-muted">
                      {browser || "알 수 없는 브라우저"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="h-auto py-2">
                  <div className="flex flex-col">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="w-fit cursor-help rounded-sm bg-transparent p-0 text-left text-sm leading-5 font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <time dateTime={lastUsedDate.toISOString()}>
                            {formatDistanceStrict(lastUsedDate, new Date(), {
                              addSuffix: true,
                              locale: ko
                            })}
                          </time>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{formatLocalDateTime(lastUsedDate)}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="w-fit cursor-help rounded-sm bg-transparent p-0 text-left text-xs leading-4 text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <time dateTime={createdAtDate.toISOString()}>
                            생성:{" "}
                            {formatDistanceStrict(createdAtDate, new Date(), {
                              addSuffix: true,
                              locale: ko
                            })}
                          </time>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{formatLocalDateTime(createdAtDate)}</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell className="h-auto py-2 text-right">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setSessionToRevoke({ id, ip, browser })}
                  >
                    로그아웃
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={sessionToRevoke !== null}
        onOpenChange={(open) => !open && !isRevoking && setSessionToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 세션을 로그아웃하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessionToRevoke
                ? `The ${sessionToRevoke.browser || "unknown browser"} session from ${
                    sessionToRevoke.ip || "an unknown IP"
                  } will lose access to your account.`
                : "이 세션의 계정 접근 권한이 해제됩니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRevoking}>취소</AlertDialogCancel>
            <AlertDialogAction
              isPending={isRevoking}
              onClick={(event) => {
                event.preventDefault();
                if (sessionToRevoke) handleSignOut(sessionToRevoke.id);
              }}
            >
              로그아웃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
