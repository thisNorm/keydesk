import { Helmet } from "react-helmet";
import { Link, useSearch } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

/**
 * This is the page that shows up when a user's invitation
 * to join a project/organization on Infisical has expired
 * or when the user is already a member of the organization
 */
export const RequestNewInvitePage = () => {
  const { reason } = useSearch({ from: "/_restrict-login-signup/requestnewinvite" });
  const isAlreadyMember = reason === "already_member";

  return (
    <AuthPageLayout variant="focused">
      <Helmet>
        <title>{isAlreadyMember ? "이미 가입한 회원" : "새 초대 요청"}</title>
        <link rel="icon" href="/keydesk.svg" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2 text-center">
          <CardTitle>{isAlreadyMember ? "이미 수락한 초대" : "초대가 만료되었습니다."}</CardTitle>
          <CardDescription>
            {isAlreadyMember ? "이미 이 조직의 회원입니다." : "관리자에게 새 초대를 요청하세요."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="project" size="lg" isFullWidth>
            <Link to="/login">로그인으로 이동</Link>
          </Button>
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
