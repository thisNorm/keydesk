import { Helmet } from "react-helmet";
import { Link, useRouteContext } from "@tanstack/react-router";
import { MailX } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { CardContent, CardHeader, CardTitle } from "@app/components/v3";

import { SignUpPage } from "../SignUpPage/SignUpPage";

export const SignupInvitePage = () => {
  const { inviteEmail, inviteOrganizationName, error } = useRouteContext({
    from: "/_restrict-login-signup/signupinvite"
  }) as { inviteEmail?: string; inviteOrganizationName?: string; error?: string };

  if (error) {
    return (
      <AuthPageLayout variant="focused">
        <Helmet>
          <title>잘못된 초대</title>
          <link rel="icon" href="/keydesk.svg" />
        </Helmet>
        <AuthPagePanel className="text-center">
          <CardHeader className="mb-6 items-center gap-2 text-center">
            <div
              aria-hidden="true"
              className="mb-4 flex size-12 items-center justify-center justify-self-center rounded-lg bg-card text-foreground/80"
            >
              <MailX className="size-5" strokeWidth={1.75} />
            </div>
            <CardTitle className="justify-center text-center font-alliance text-2xl font-normal">
              올바르지 않은 초대입니다.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-sm text-balance text-label">조직 관리자에게 새 초대를 요청하세요.</p>
            <Link
              to="/login"
              className="self-center text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
            >
              로그인으로 돌아가기
            </Link>
          </CardContent>
        </AuthPagePanel>
      </AuthPageLayout>
    );
  }

  return (
    <SignUpPage invite={{ email: inviteEmail ?? "", organizationName: inviteOrganizationName }} />
  );
};
