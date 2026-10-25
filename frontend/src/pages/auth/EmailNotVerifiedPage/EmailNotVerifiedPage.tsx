import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

export const EmailNotVerifiedPage = () => {
  return (
    <AuthPageLayout variant="focused">
      <Helmet>
        <title>이메일 미인증</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2 text-center">
          <CardTitle>이메일이 인증되지 않았습니다.</CardTitle>
          <CardDescription>
            Please try again. If the problem continues, contact support@infisical.com.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="project" size="lg" isFullWidth>
            <Link to="/login">로그인으로 돌아가기</Link>
          </Button>
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
