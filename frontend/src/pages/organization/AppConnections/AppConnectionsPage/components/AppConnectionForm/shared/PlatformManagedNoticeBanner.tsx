import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

export const PlatformManagedNoticeBanner = () => (
  <Alert variant="warning" className="mb-4">
    <AlertTitle>플랫폼 관리 인증 정보</AlertTitle>
    <AlertDescription>
      이 앱 연결의 인증 정보는 Keydesk에서 관리하므로 수정할 수 없습니다.
    </AlertDescription>
  </Alert>
);
