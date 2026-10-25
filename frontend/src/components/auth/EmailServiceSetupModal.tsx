import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge
} from "@app/components/v3";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

export const EmailServiceSetupModal = ({ isOpen, onOpenChange }: Props) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          이메일 서비스 미설정
          <DocumentationLinkBadge
            variant="minified"
            href="https://infisical.com/docs/self-hosting/configuration/envars#email-service"
          />
        </DialogTitle>
        <DialogDescription>
          이 작업을 실행하려면 서버 관리자가 이메일 서비스를 먼저 설정해야 합니다.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">닫기</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
