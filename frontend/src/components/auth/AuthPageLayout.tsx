import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { Button } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { PersonalBrand } from "@app/pages/organization/ApiVaultPage/PersonalBrand";

import { AuthPageFooter } from "./AuthPageFooter";

type Props = {
  anchorBottomContent?: boolean;
  aside?: {
    eyebrow?: ReactNode;
    description?: ReactNode;
  };
  bottomContent?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  headerAction?: ReactNode;
  onDocumentationClick?: () => void;
  showFooter?: boolean;
  variant?: "focused" | "split";
};

export const AuthPageLayout = ({
  anchorBottomContent = false,
  aside,
  bottomContent,
  children,
  contentClassName,
  headerAction,
  onDocumentationClick,
  showFooter = true,
  variant = "split"
}: Props) => {
  const isSplit = variant === "split";

  return (
    <div
      className={cn(
        "min-h-screen bg-page",
        isSplit &&
          "lg:grid lg:grid-cols-[minmax(440px,44%)_minmax(0,1fr)] xl:grid-cols-[minmax(520px,40%)_minmax(0,1fr)]"
      )}
      data-variant={variant}
    >
      <section
        className={cn(
          "flex h-screen min-h-0 min-w-0 flex-col",
          anchorBottomContent ? "overflow-hidden" : "thin-scrollbar overflow-y-auto",
          isSplit && "lg:border-r lg:border-border"
        )}
      >
        <header className="relative z-10 flex h-16 w-full shrink-0 items-center justify-between px-5 sm:px-8 lg:px-10 xl:px-14">
          <Link
            to="/"
            aria-label="Keydesk 홈"
            className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PersonalBrand />
          </Link>
          {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
        </header>
        <main
          className={cn(
            "flex flex-1 px-5 pt-10 pb-26 sm:px-8 lg:px-10 xl:px-14",
            anchorBottomContent
              ? "min-h-0 thin-scrollbar overflow-x-hidden overflow-y-auto"
              : "items-center justify-center"
          )}
        >
          <div className={cn("w-full max-w-md", anchorBottomContent && "m-auto", contentClassName)}>
            {children}
          </div>
        </main>
        {(bottomContent || showFooter) && (
          <div
            className={cn(
              "relative z-10 px-5 pb-6 text-center sm:px-8 lg:px-10 xl:px-14",
              anchorBottomContent && "shrink-0 border-t border-border pt-4"
            )}
          >
            {bottomContent}
            {showFooter && <AuthPageFooter />}
          </div>
        )}
      </section>

      {isSplit && (
        <aside className="relative hidden h-screen min-w-0 overflow-hidden bg-background lg:sticky lg:top-0 lg:flex lg:flex-col">
          <div className="flex h-16 items-center justify-between gap-4 px-8 xl:px-12">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted">
              KEYDESK / PERSONAL WORKSPACE
            </span>
            <Button asChild variant="outline" size="sm">
              <a
                href="https://infisical.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={onDocumentationClick}
              >
                <BookOpen />
                Infisical 문서
              </a>
            </Button>
          </div>

          <div className="flex flex-1 items-center justify-center px-10 py-10 xl:px-20">
            <div className="w-full max-w-md">
              <p className="mb-4 text-xs text-muted">
                {aside?.eyebrow ?? "나의 개발 도구, 나의 API 기록"}
              </p>
              <h2 className="font-alliance text-2xl leading-relaxed font-normal text-foreground">
                키와 사용처를,
                <br />
                한곳에.
              </h2>
              <p className="mt-3 text-[13px] leading-7 text-label">
                {aside?.description ??
                  "어디서 발급했는지, 어떤 프로젝트에 쓰는지. 키를 다시 찾을 때 필요한 정보를 함께 기록하세요."}
              </p>
              <dl className="mt-8 divide-y divide-border border-y border-border">
                {[
                  ["01", "발급 위치", "제공사 사이트 · 관리 콘솔 · API 문서"],
                  ["02", "사용 맥락", "API 용도 · 사용 프로젝트 · 관리 메모"],
                  ["03", "관리 상태", "인증 키 · 만료일 · 요금제와 한도"]
                ].map(([number, title, description]) => (
                  <div key={number} className="flex items-start gap-4 py-4">
                    <span className="pt-0.5 font-mono text-[10px] text-muted" aria-hidden>
                      {number}
                    </span>
                    <div className="flex flex-col gap-1">
                      <dt className="text-[13px] text-foreground">{title}</dt>
                      <dd className="text-xs leading-relaxed text-muted">{description}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-8 py-6 text-[10px] text-muted xl:px-12">
            <span className="font-mono">by Norm / thisNorm</span>
            <span>Infisical 기반</span>
          </div>
        </aside>
      )}
    </div>
  );
};
