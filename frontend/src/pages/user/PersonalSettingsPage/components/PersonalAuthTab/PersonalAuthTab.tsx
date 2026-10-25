import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button, Card, Skeleton } from "@app/components/v3";
import { useGetUser } from "@app/hooks/api";
import { AuthMethod } from "@app/hooks/api/users/types";

import { AuthMethodSection } from "../AuthMethodSection";
import { ChangeEmailSection } from "../ChangeEmailSection";
import { ChangePasswordSection } from "../ChangePasswordSection";
import { MFASection } from "../SecuritySection";

export const PersonalAuthTab = () => {
  const { data: user, isPending, isError, refetch } = useGetUser();

  if (isError) {
    return (
      <Alert variant="danger">
        <AlertCircleIcon />
        <AlertTitle>인증 설정을 불러오지 못했습니다.</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isPending || !user) {
    return (
      <Card aria-label="인증 설정을 불러오는 중">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!user.authMethods.includes(AuthMethod.LDAP) && (
        <>
          <MFASection />
          <AuthMethodSection />
        </>
      )}
      <ChangePasswordSection />
      {!user.authMethods.includes(AuthMethod.LDAP) && <ChangeEmailSection />}
    </div>
  );
};
