import { useState } from "react";

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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { useRevokeMySessions } from "@app/hooks/api";

import { SessionsTable } from "./SessionsTable";

export const SessionsSection = () => {
  const [isRevokeAllOpen, setIsRevokeAllOpen] = useState(false);
  const { mutateAsync, isPending } = useRevokeMySessions();

  const onRevokeAllSessionsClick = async () => {
    try {
      await mutateAsync();
      setIsRevokeAllOpen(false);
      window.location.href = "/login";
    } catch {
      // MutationCache.onError handles the error notification.
    }
  };

  return (
    <>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">세션</CardTitle>
          <CardDescription>
            계정에 접근할 수 있는 브라우저 및 CLI 세션을 확인하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <SessionsTable />
        </CardContent>
        <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
          <Button variant="neutral" size="sm" onClick={() => setIsRevokeAllOpen(true)}>
            모든 기기에서 로그아웃
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog
        open={isRevokeAllOpen}
        onOpenChange={(open) => !isPending && setIsRevokeAllOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>모든 기기에서 로그아웃하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              현재 세션을 포함한 모든 브라우저와 CLI에서 로그아웃됩니다. 다시 로그인해야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              isPending={isPending}
              onClick={(event) => {
                event.preventDefault();
                onRevokeAllSessionsClick();
              }}
            >
              모든 기기에서 로그아웃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
