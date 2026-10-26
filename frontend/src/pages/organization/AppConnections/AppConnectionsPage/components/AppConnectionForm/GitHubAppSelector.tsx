import { useLayoutEffect, useRef, useState } from "react";
import slugify from "@sindresorhus/slugify";
import {
  ChevronLeftIcon,
  ExternalLinkIcon,
  GithubIcon,
  InfoIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList
} from "@app/components/v3/generic/Command";
import { IconButton } from "@app/components/v3/generic/IconButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";
import { InstanceIcon, OrgIcon, ProjectIcon } from "@app/components/v3/platform/ScopeIcons";
import { buildGitHubAppUrl, buildGitHubHostUrl } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { TGitHubApp, useDeleteGitHubApp } from "@app/hooks/api/gitHubApps";

const SHARED_KEY = "__shared__";

// New GitHub Apps are pre-filled with this prefix so they're easy to identify in the GitHub account.
const GITHUB_APP_NAME_PREFIX = "keydesk-";

const getAppKey = (app: TGitHubApp | null) => (app ? (app.id ?? SHARED_KEY) : null);

type Props = {
  apps: TGitHubApp[];
  isLoading: boolean;
  value: TGitHubApp | null;
  onChange: (app: TGitHubApp | null) => void;
  host?: string;
  instanceType?: "cloud" | "server";
  // Name of the gateway/pool the parent form will route the app creation through, when one is
  // selected. Surfaced in the create view so the user knows how Infisical reaches GitHub.
  gatewayLabel?: string | null;
  // Kicks off the GitHub App manifest creation flow on the parent form (redirects to GitHub).
  // Returns false when the parent form is invalid so we can return to the list view.
  onCreateApp: (params: { name: string; githubOrg: string }) => Promise<boolean> | void;
  isCreating?: boolean;
  // When set, the selector is in project scope: org apps are listed (and selectable) only for
  // users who can read org-level app connections, and are managed from the organization's App
  // Connections page; newly created apps are project-scoped.
  projectId?: string | null;
};

export const GitHubAppSelector = ({
  apps,
  isLoading,
  value,
  onChange,
  host,
  instanceType,
  gatewayLabel,
  onCreateApp,
  isCreating,
  projectId
}: Props) => {
  // The compact picker only selects an app; creation and deletion live in the management modal
  // behind the gear button.
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create">("list");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [newAppName, setNewAppName] = useState("");
  const [newAppOrg, setNewAppOrg] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const scopeVariant = useScopeVariant();

  // Toggling `mode` unmounts the focused button (e.g. "Create new GitHub App"). If focus dropped to
  // <body>, the Dialog's focus trap would yank it to the first field at the top of the modal and
  // scroll up. Park focus on the always-mounted panel first so the trap never reacts.
  const switchMode = (next: "list" | "create") => {
    containerRef.current?.focus({ preventScroll: true });
    setMode(next);
  };

  // Once the create view is mounted, move focus to its first field (without scrolling).
  useLayoutEffect(() => {
    if (mode === "create") nameInputRef.current?.focus({ preventScroll: true });
  }, [mode]);

  const deleteGitHubApp = useDeleteGitHubApp();

  const sharedApp = apps.find((app) => app.id === null) ?? null;
  // In project scope the private list can mix both scopes: the project's own apps plus the org's,
  // when the user can read org-level app connections (the API filters org apps out otherwise).
  // Each row's scope icon tells them apart.
  const customApps = apps.filter((app) => app.id !== null);

  const resetCreate = () => {
    switchMode("list");
    setNewAppName("");
    setNewAppOrg("");
  };

  const handleManageOpenChange = (open: boolean) => {
    setIsManageOpen(open);
    if (!open) {
      setMode("list");
      setDeleteTargetId(null);
      setNewAppName("");
      setNewAppOrg("");
    }
  };

  const handleDelete = async (app: TGitHubApp) => {
    if (!app.id) return;
    try {
      await deleteGitHubApp.mutateAsync(app.id);
      createNotification({ type: "success", text: `GitHub App 삭제 완료: "${app.name}"` });
      if (getAppKey(value) === app.id) onChange(null);
      setDeleteTargetId(null);
    } catch (err) {
      createNotification({
        type: "error",
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err instanceof Error ? err.message : "GitHub App을 삭제하지 못했습니다")
      });
    }
  };

  const handleContinueCreate = async () => {
    if (!newAppName.trim()) return;
    const didRedirect = await onCreateApp({
      // Send the same slugified name shown in the URL preview so it matches GitHub's app slug.
      name: `${GITHUB_APP_NAME_PREFIX}${slugify(newAppName, { lowercase: true })}`,
      githubOrg: newAppOrg.trim()
    });
    // When the parent form is invalid the redirect is aborted; return to the list view.
    if (didRedirect === false) {
      resetCreate();
    }
  };

  // Non-interactive group label rendered between dropdown items.
  const renderPickerHeading = (label: string) => (
    <div className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted">{label}</div>
  );

  const renderPickerItem = (app: TGitHubApp) => (
    <SelectItem key={getAppKey(app)} value={getAppKey(app) as string}>
      {app.name}
    </SelectItem>
  );

  const renderCustomAppRow = (app: TGitHubApp, canDelete: boolean) => {
    const isInUse = app.connectionCount > 0;

    if (deleteTargetId === app.id) {
      return (
        <div key={app.id} className="m-1 rounded-md border border-danger/40 bg-danger/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TrashIcon className="size-4 text-danger" />
            <span>
              삭제 <span className="font-mono">{app.name}</span>?
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-accent">
            Keydesk에서 제거하고 GitHub에서 설치를 해제합니다. 앱 등록은 GitHub에서 직접 삭제할
            때까지 유지됩니다.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="ghost" size="xs" onClick={() => setDeleteTargetId(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              size="xs"
              isPending={deleteGitHubApp.isPending}
              onClick={() => handleDelete(app)}
            >
              삭제
            </Button>
          </div>
        </div>
      );
    }

    return (
      <CommandItem
        key={app.id}
        value={`${app.name} ${app.owner ?? ""} ${app.slug}`}
        className="group cursor-default"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-foreground/10">
          {app.projectId ? (
            <ProjectIcon className="size-4 text-project" />
          ) : (
            <OrgIcon className="size-4 text-org" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-foreground">{app.name}</p>
          <p className="truncate text-xs text-accent">
            {app.owner ? `${app.owner} · ` : ""}
            연결 {app.connectionCount}개
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[selected=true]:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost-muted"
                size="xs"
                aria-label="GitHub에서 열기"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    buildGitHubAppUrl(app.slug, app.host, app.instanceType ?? instanceType),
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
              >
                <ExternalLinkIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>GitHub에서 열기</TooltipContent>
          </Tooltip>
          {isInUse || !canDelete ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Native disabled buttons don't fire pointer events, so the tooltip
                    needs a focusable wrapper to open on hover/focus. */}
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                <span tabIndex={0}>
                  <IconButton variant="ghost-muted" size="xs" aria-label="앱 삭제" isDisabled>
                    <TrashIcon />
                  </IconButton>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {canDelete ? (
                  <>연결을 제거한 후 이 앱을 삭제하세요.</>
                ) : (
                  "조직 앱은 조직의 앱 연결 페이지에서만 삭제할 수 있습니다."
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost-muted"
                  size="xs"
                  aria-label="이 앱 삭제"
                  className="hover:text-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTargetId(app.id);
                  }}
                >
                  <TrashIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>이 앱 삭제</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CommandItem>
    );
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={getAppKey(value) ?? ""}
          onValueChange={(key) => {
            const app = apps.find((a) => getAppKey(a) === key);
            if (app) onChange(app);
          }}
          disabled={isLoading}
        >
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue placeholder="GitHub App 선택" />
          </SelectTrigger>
          <SelectContent position="popper">
            {sharedApp && (
              <>
                {renderPickerHeading("인스턴스")}
                {renderPickerItem(sharedApp)}
              </>
            )}
            {customApps.length > 0 && (
              <>
                {renderPickerHeading("비공개")}
                {customApps.map(renderPickerItem)}
              </>
            )}
            {!sharedApp && customApps.length === 0 && !isLoading && (
              <div className="px-4 py-6 text-center text-xs leading-relaxed text-muted">
                사용 가능한 GitHub App이 없습니다. 톱니바퀴 버튼으로 앱을 만드세요.
              </div>
            )}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="outline"
              aria-label="GitHub App 관리"
              onClick={() => setIsManageOpen(true)}
            >
              <SettingsIcon />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>GitHub App 관리</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={isManageOpen} onOpenChange={handleManageOpenChange}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            containerRef.current?.focus({ preventScroll: true });
          }}
          className="max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>GitHub App 관리</DialogTitle>
            <DialogDescription>
              연결에서 사용할 GitHub App을 만들고 확인하거나 삭제하세요.
            </DialogDescription>
          </DialogHeader>
          <div
            ref={containerRef}
            tabIndex={-1}
            className="overflow-hidden rounded-md border border-border bg-container outline-none"
          >
            {mode === "create" ? (
              <div className="p-3">
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-2 text-sm font-medium text-foreground">
                  <IconButton
                    variant="ghost-muted"
                    size="xs"
                    aria-label="목록으로"
                    onClick={resetCreate}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                  GitHub App 만들기
                </div>
                <Field className="mb-1">
                  <FieldLabel htmlFor="github-app-name">앱 이름</FieldLabel>
                  <Input
                    id="github-app-name"
                    ref={nameInputRef}
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    placeholder="deploy-bot"
                    className="font-mono"
                  />
                  <FieldDescription>
                    {`${buildGitHubHostUrl(host).replace("https://", "")}/${
                      instanceType === "server" ? "github-apps" : "apps"
                    }/`}
                    <span className="font-mono text-foreground">
                      {GITHUB_APP_NAME_PREFIX}
                      {newAppName.trim() ? slugify(newAppName, { lowercase: true }) : "your-app"}
                    </span>
                  </FieldDescription>
                </Field>
                <Field className="mt-3 mb-0">
                  <FieldLabel htmlFor="github-app-org">
                    조직
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        조직 소유의 저장소에 앱을 설치하려면 GitHub 조직 이름을 입력하세요. 비워
                        두면 개인 계정에 앱을 만듭니다.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    id="github-app-org"
                    value={newAppOrg}
                    onChange={(e) => setNewAppOrg(e.target.value)}
                    placeholder="개인 계정에 만들려면 비워 두세요"
                  />
                </Field>
                <Alert variant="info" className="mt-3">
                  <InfoIcon />
                  <AlertDescription>
                    <p>
                      앱을 만들 위치:{" "}
                      <span className="font-medium text-foreground">
                        {buildGitHubHostUrl(host).replace("https://", "")}
                      </span>
                      {gatewayLabel ? (
                        <>
                          {" "}
                          사용할 게이트웨이:{" "}
                          <span className="font-medium text-foreground">{gatewayLabel}</span>{" "}
                          gateway
                        </>
                      ) : null}
                      . 비공개 앱 설정을 완료하는 페이지로 이동합니다. 로그아웃 상태에서는 GitHub
                      설정이 실패하므로 먼저{" "}
                      <a
                        href={`${buildGitHubHostUrl(host)}/login`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        로그인
                      </a>{" "}
                      하세요.
                    </p>
                  </AlertDescription>
                </Alert>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={resetCreate}>
                    취소
                  </Button>
                  <Button
                    variant={scopeVariant}
                    size="sm"
                    isDisabled={!newAppName.trim() || isCreating}
                    isPending={isCreating}
                    onClick={handleContinueCreate}
                  >
                    <GithubIcon />
                    GitHub에서 계속
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Command className="h-auto bg-transparent">
                  <CommandList className="max-h-[360px]">
                    {sharedApp && (
                      <CommandGroup heading="인스턴스">
                        <CommandItem
                          value={`인스턴스 서버 관리자 ${sharedApp.name}`}
                          className="group cursor-default"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-foreground/10">
                            <InstanceIcon className="size-4 text-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-sm text-foreground">
                              {sharedApp.name}
                            </p>
                            <p className="truncate text-xs text-muted">
                              서버 관리자 · 연결 {sharedApp.connectionCount}개
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[selected=true]:opacity-100">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  variant="ghost-muted"
                                  size="xs"
                                  aria-label="GitHub에서 열기"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(
                                      buildGitHubAppUrl(
                                        sharedApp.slug,
                                        sharedApp.host,
                                        sharedApp.instanceType ?? instanceType
                                      ),
                                      "_blank",
                                      "noopener,noreferrer"
                                    );
                                  }}
                                >
                                  <ExternalLinkIcon />
                                </IconButton>
                              </TooltipTrigger>
                              <TooltipContent>GitHub에서 열기</TooltipContent>
                            </Tooltip>
                          </div>
                        </CommandItem>
                      </CommandGroup>
                    )}
                    <CommandGroup
                      heading={
                        <span className="flex items-center gap-2">
                          비공개
                          {customApps.length > 0 && (
                            <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] text-foreground">
                              {customApps.length}
                            </span>
                          )}
                        </span>
                      }
                    >
                      {customApps.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-foreground/10 text-accent">
                            <GithubIcon className="size-6" />
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            비공개 앱이 없습니다
                          </p>
                          <p className="max-w-[260px] text-xs leading-relaxed text-muted">
                            팀별 권한 범위를 세분화하려면 전용 GitHub App을 만드세요.
                          </p>
                        </div>
                      ) : (
                        customApps.map((app) =>
                          renderCustomAppRow(app, !projectId || app.projectId !== null)
                        )
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
                <button
                  type="button"
                  onClick={() => switchMode("create")}
                  className="group flex w-full cursor-pointer items-center gap-2.5 border-t border-border px-3 py-2.5 text-left hover:bg-foreground/5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border text-foreground">
                    <PlusIcon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">새 GitHub App 만들기</p>
                  </div>
                </button>
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">닫기</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
