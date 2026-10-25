import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useDeleteMe } from "@app/hooks/api";

const DELETE_CONFIRMATION = "delete my account";

export const DeleteAccountSection = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const { mutateAsync: deleteUserMutateAsync, isPending } = useDeleteMe();

  const handleDeleteAccountSubmit = async () => {
    try {
      await deleteUserMutateAsync();

      createNotification({
        text: "계정을 삭제했습니다.",
        type: "success"
      });

      setIsOpen(false);
      navigate({ to: "/login" });
    } catch {
      createNotification({
        text: "계정을 삭제하지 못했습니다.",
        type: "error"
      });
    }
  };

  return (
    <>
      <Card className="gap-0 overflow-hidden border-danger/25 p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">계정 삭제</CardTitle>
          <CardDescription>
            계정을 영구 삭제하고 Infisical 접근 권한을 해제합니다. 이 작업은 되돌릴 수 없습니다.
          </CardDescription>
        </CardHeader>
        <CardFooter className="min-h-8 justify-end border-t border-danger/15 bg-danger/5 p-4">
          <Button variant="danger" size="sm" onClick={() => setIsOpen(true)}>
            <Trash2Icon />
            계정 삭제
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (isPending) return;
          setIsOpen(open);
          if (!open) setConfirmation("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>계정을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              계정이 Infisical에 영구적으로 접근할 수 없게 됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="delete-account-confirmation">
              유형 <span className="font-mono">{DELETE_CONFIRMATION}</span> to continue
            </FieldLabel>
            <Input
              id="delete-account-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
            <FieldDescription>대소문자를 구분합니다.</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isPending}
              isDisabled={confirmation !== DELETE_CONFIRMATION}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteAccountSubmit();
              }}
            >
              계정 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
