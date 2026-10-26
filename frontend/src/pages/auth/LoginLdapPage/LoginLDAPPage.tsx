import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { createNotification } from "@app/components/notifications";
import { Button, CardContent, CardHeader, CardTitle, IconButton, Input } from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { loginLDAPRedirect } from "@app/hooks/api/auth/queries";
import { getLastLoginOrganizationSlug, useLastLogin } from "@app/hooks/useLastLogin";

export const LoginLdapPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useServerConfig();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const {
    callback_port: callbackPort,
    is_admin_login: isAdminLogin,
    organizationSlug: passedOrgSlug,
    username: passedUsername
  } = useSearch({ from: "/_restrict-login-signup/login/ldap" });

  const lastLoginSlug = getLastLoginOrganizationSlug(lastLogin) || "";

  const [organizationSlug, setOrganizationSlug] = useState(
    config.defaultAuthOrgSlug || passedOrgSlug || lastLoginSlug
  );
  const [username, setUsername] = useState(passedUsername || "");
  const [password, setPassword] = useState("");
  const isFormValid = Boolean(organizationSlug.trim() && username.trim() && password);

  const handleBackToLogin = () => navigate({ to: isAdminLogin ? "/login/admin" : "/login" });

  const handleSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { nextUrl } = await loginLDAPRedirect({
        organizationSlug,
        username,
        password,
        callbackPort
      });

      if (!nextUrl) {
        createNotification({
          text: "로그인에 실패했습니다. 이메일과 비밀번호를 확인하고 다시 시도하세요.",
          type: "error"
        });

        return;
      }

      saveLastLogin({ method: LoginMethod.LDAP, organizationSlug });

      createNotification({
        text: "로그인했습니다.",
        type: "success"
      });

      window.open(nextUrl);
      window.close();
    } catch {
      createNotification({
        text: "로그인에 실패했습니다. 이메일과 비밀번호를 확인하고 다시 시도하세요.",
        type: "error"
      });
    }
  };

  return (
    <AuthPageLayout variant="focused">
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/keydesk.svg" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <form onSubmit={handleSubmission} className="mx-auto w-full max-w-sm">
        <AuthPagePanel>
          <CardHeader className="mb-4 gap-4">
            <div className="flex items-center gap-1.5">
              <IconButton
                aria-label="로그인으로 돌아가기"
                variant="ghost-muted"
                size="xs"
                className="-ml-2"
                onClick={handleBackToLogin}
              >
                <ChevronLeft />
              </IconButton>
              <CardTitle className="ml-0.5 bg-linear-to-b from-foreground-inverse to-foreground-soft bg-clip-text font-alliance text-2xl font-normal text-transparent">
                LDAP 로그인
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!config.defaultAuthOrgSlug && !passedOrgSlug && (
              <Input
                variant="outlined"
                value={organizationSlug}
                onChange={(e) => setOrganizationSlug(e.target.value)}
                type="text"
                placeholder="조직 URL 식별자 입력..."
                required
                className="h-10"
              />
            )}
            <Input
              variant="outlined"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              autoComplete="username"
              placeholder="LDAP 사용자 이름 입력..."
              required
              disabled={passedUsername !== undefined}
              className="h-10"
            />
            <Input
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="LDAP 비밀번호 입력..."
              required
              autoComplete="current-password"
              className="h-10"
            />
            <Button type="submit" variant="project" size="lg" isFullWidth isDisabled={!isFormValid}>
              LDAP로 계속
            </Button>
          </CardContent>
        </AuthPagePanel>
      </form>
    </AuthPageLayout>
  );
};
