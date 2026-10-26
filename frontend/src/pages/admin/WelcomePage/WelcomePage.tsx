import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, KeyRound, ServerCog } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

type Props = {
  organizationId: string;
};

export const WelcomePage = ({ organizationId }: Props) => {
  const navigate = useNavigate();

  return (
    <AuthPageLayout variant="focused" contentClassName="max-w-xl">
      <Helmet>
        <title>서버 준비 완료 | Keydesk</title>
        <link rel="icon" href="/keydesk.svg" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="gap-0">
          <div className="relative mb-8 flex size-10 items-center justify-center bg-project text-black">
            <KeyRound className="size-5" />
            <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 size-2 bg-project" />
          </div>
          <CardTitle className="font-alliance text-3xl leading-tight font-normal">
            서버가 준비되었습니다.
          </CardTitle>
          <CardDescription className="mt-2 max-w-lg font-sans text-base leading-relaxed">
            이동할 화면을 선택하세요.
          </CardDescription>
        </CardHeader>

        <CardContent className="mt-8 space-y-8">
          <div className="grid gap-3">
            <button
              type="button"
              className="group grid min-h-18 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border border-project/30 bg-project/25 p-4 text-left text-foreground transition-all select-none hover:border-project/35 hover:bg-project/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              onClick={() =>
                navigate({
                  to: "/organizations/$orgId/api-vault",
                  params: { orgId: organizationId }
                })
              }
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-start gap-2">
                  <Building2 className="size-5 text-foreground" />
                  <span className="font-sans text-base font-medium text-foreground">
                    보관함 열기
                  </span>
                </span>
                <span className="block text-sm leading-relaxed text-foreground/70">
                  프로젝트를 만들고 시크릿을 보관하세요.
                </span>
              </span>
              <ArrowRight className="size-4 text-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>

            <button
              type="button"
              className="group grid min-h-18 grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
              onClick={() => navigate({ to: "/admin" })}
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-start gap-2">
                  <ServerCog className="size-5 text-foreground" />
                  <span className="font-sans text-base font-medium text-foreground">
                    서버 관리 화면 열기
                  </span>
                </span>
                <span className="block text-sm leading-relaxed text-label">
                  서버의 세부 설정을 변경하세요.
                </span>
              </span>
              <ArrowRight className="size-4 text-label transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>
          </div>

          <p className="border-t border-border pt-6 text-xs leading-relaxed text-label">
            서버 관리 화면은 나중에 상단 메뉴에서도 열 수 있습니다.
          </p>
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
