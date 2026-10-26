import { useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useSearch } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, TerminalIcon } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import {
  Button,
  CardContent,
  CardHeader,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton
} from "@app/components/v3";
import { SecretInput } from "@app/components/v3/platform";
import { SessionStorageKeys } from "@app/const";
import { useTimedReset } from "@app/hooks";

const getTerminalCliToken = () => {
  const cliTerminalTokenInfo = sessionStorage.getItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
  if (!cliTerminalTokenInfo) return;

  const { expiry, data } = JSON.parse(cliTerminalTokenInfo);
  if (new Date() > new Date(expiry)) {
    sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
    return;
  }

  // eslint-disable-next-line
  return data as string;
};

export const CliRedirectPage = () => {
  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false
  });
  const [isTokenVisible, setIsTokenVisible] = useState(false);
  const cliToken = getTerminalCliToken();
  const { org_id: dashboardOrgId } = useSearch({ from: "/cli-redirect" });

  const copyUrlToClipboard = () => {
    if (cliToken) {
      navigator.clipboard.writeText(cliToken);
      setIsUrlCopied(true);
      sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
    }
  };

  return (
    <AuthPageLayout variant="focused">
      <Helmet>
        <title>CLI 로그인 완료 | Keydesk</title>
        <link rel="icon" href="/keydesk.svg" />
      </Helmet>
      {cliToken ? (
        <AuthPagePanel className="text-center">
          <CardHeader className="mb-6 items-center gap-2 text-center">
            <div
              aria-hidden="true"
              className="mb-4 flex size-12 items-center justify-center justify-self-center rounded-lg bg-card text-foreground/80"
            >
              <KeyRoundIcon className="size-5" strokeWidth={1.75} />
            </div>
            <CardTitle className="justify-center text-center font-alliance text-2xl font-normal">
              CLI에 연결하지 못했습니다.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-label">
              로그인했지만 CLI에 토큰을 자동으로 전달하지 못했습니다. 아래 토큰을 복사해 CLI에
              입력하세요.
            </p>
            <InputGroup>
              <SecretInput
                variant="plain"
                value={cliToken as string}
                isVisible={isTokenVisible}
                data-slot="input-group-control"
                containerClassName="px-2.5 py-2 font-mono text-left"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={isTokenVisible ? "토큰 숨기기" : "토큰 표시"}
                  onClick={() => setIsTokenVisible((current) => !current)}
                >
                  {isTokenVisible ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <Button variant="project" size="lg" isFullWidth onClick={copyUrlToClipboard}>
              {isUrlCopied ? <CheckIcon /> : <CopyIcon />}
              클립보드에 복사
            </Button>
          </CardContent>
        </AuthPagePanel>
      ) : (
        <AuthPagePanel className="text-center">
          <CardHeader className="mb-6 items-center gap-2 text-center">
            <div
              aria-hidden="true"
              className="mb-4 flex size-12 items-center justify-center justify-self-center rounded-lg bg-card text-foreground/80"
            >
              <TerminalIcon className="size-5" strokeWidth={1.75} />
            </div>
            <CardTitle className="justify-center text-center font-alliance text-2xl font-normal">
              터미널로 돌아가세요.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-label">CLI에 로그인했습니다.</p>
            {dashboardOrgId && (
              <Button asChild variant="outline" className="self-center">
                <Link to="/organizations/$orgId/api-vault" params={{ orgId: dashboardOrgId }}>
                  Keydesk 보관함 열기
                </Link>
              </Button>
            )}
          </CardContent>
        </AuthPagePanel>
      )}
    </AuthPageLayout>
  );
};
