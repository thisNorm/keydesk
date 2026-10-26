import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAppConnection, useDeleteAppConnection } from "@app/hooks/api/appConnections";

type Props = {
  appConnection?: TAppConnection;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteAppConnectionModal = ({ isOpen, onOpenChange, appConnection }: Props) => {
  const deleteAppConnection = useDeleteAppConnection();

  if (!appConnection) return null;

  const { id: connectionId, name, app } = appConnection;

  const handleDeleteAppConnection = async () => {
    if (deleteAppConnection.isPending) return;

    try {
      await deleteAppConnection.mutateAsync({
        connectionId,
        app
      });

      createNotification({
        text: `연결 제거 완료: ${APP_CONNECTION_MAP[app].name} 연결`,
        type: "success"
      });

      onOpenChange(false);
    } catch {
      // Error is handled by the mutation's onError handler
    }
  };

  return (
    <AlertDialog
      isPending={deleteAppConnection.isPending}
      open={isOpen}
      confirmationValue={name}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>다음을 삭제하시겠습니까? {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>이 작업은 되돌릴 수 없습니다.</AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {appConnection.isPlatformManagedCredentials && (
          <Alert variant="warning">
            <AlertTitle>플랫폼 관리 인증 정보</AlertTitle>
            <AlertDescription>
              이 앱 연결의 인증 정보는 Keydesk에서 관리합니다. 이 연결을 삭제하면 연결된 리소스에
              영구적으로 접근하지 못할 수 있습니다.
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogConfirmationField
          onConfirm={() => {
            handleDeleteAppConnection().catch(() => undefined);
          }}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={(event) => {
              event.preventDefault();
              handleDeleteAppConnection().catch(() => undefined);
            }}
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
