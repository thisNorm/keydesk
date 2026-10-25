import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";

import { ApiVaultEditor } from "./ApiVaultEditor";
import {
  API_STATUS_LABELS,
  type ApiExpiryFilter,
  emptyApiDraft,
  expiryDays,
  expiryLabel,
  filterApiEntries,
  safeApiUrl
} from "./apiVaultPresentation";
import type {
  ApiCredential,
  ApiVaultDraft,
  ApiVaultEntry,
  ApiVaultStatus,
  ApiVaultViewProps
} from "./apiVaultTypes";

import "./keydesk.css";

const STATUS_VARIANTS = { active: "success", paused: "warning", revoked: "neutral" } as const;

const ExpiryBadge = ({ expiresAt }: { expiresAt: string }) => {
  const days = expiryDays(expiresAt);
  let variant: "danger" | "warning" | "neutral" = "neutral";
  if (days !== undefined && days < 0) variant = "danger";
  else if (days !== undefined && days <= 30) variant = "warning";
  return <Badge variant={variant}>{expiryLabel(expiresAt)}</Badge>;
};

const InventoryRow = ({ entry, onSelect }: { entry: ApiVaultEntry; onSelect: () => void }) => {
  const website = safeApiUrl(entry.websiteUrl);

  return (
    <li className="keydesk-row" data-status={entry.status}>
      <div className="keydesk-row-identity">
        <button
          type="button"
          className="keydesk-row-title"
          onClick={onSelect}
          aria-label={`${entry.name} 상세 보기`}
        >
          {entry.name}
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="[overflow-wrap:anywhere]">{entry.provider || "제공사 미등록"}</span>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="keydesk-provider-link"
              aria-label={`${entry.provider || entry.name} 제공사 사이트, 새 탭에서 열기`}
            >
              <span className="truncate">{new URL(website).hostname}</span>
              <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden />
            </a>
          )}
        </div>
        <p className="line-clamp-2 text-[13px] leading-relaxed [overflow-wrap:anywhere] text-label">
          {entry.description || "API 용도 미등록"}
        </p>
        {entry.tags.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
            {entry.tags.slice(0, 3).map((tag) => (
              <span className="max-w-full truncate" key={tag}>
                #{tag}
              </span>
            ))}
            {entry.tags.length > 3 && <span>+{entry.tags.length - 3}</span>}
          </div>
        )}
      </div>
      <div className="keydesk-row-project flex min-w-0 flex-col gap-1.5">
        <span className="keydesk-mobile-label">사용 프로젝트</span>
        <p className="line-clamp-2 text-[13px] leading-relaxed [overflow-wrap:anywhere]">
          {entry.projects || "프로젝트 미등록"}
        </p>
        {entry.owner && <span className="truncate text-xs text-muted">{entry.owner}</span>}
      </div>
      <div className="keydesk-row-status flex flex-col items-start gap-2">
        <Badge variant={STATUS_VARIANTS[entry.status]}>
          <span className="size-1 rounded-full bg-current" aria-hidden />
          {API_STATUS_LABELS[entry.status]}
        </Badge>
        <ExpiryBadge expiresAt={entry.expiresAt} />
        {entry.expiresAt && (
          <span className="font-mono text-[10px] text-muted">{entry.expiresAt}</span>
        )}
      </div>
      <div className="keydesk-row-keys flex flex-col items-end gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-label">
          <KeyRoundIcon className="size-3" aria-hidden />
          <span className="font-mono tabular-nums">{entry.credentialLabels.length}</span>
          <span className="sr-only">개의 인증 키</span>
        </span>
        <span className="font-mono text-xs tracking-wider text-muted" aria-label="키 값 숨김">
          ••••••••
        </span>
        <Button size="xs" variant="ghost" onClick={onSelect} aria-label={`${entry.name} 상세 보기`}>
          상세
          <ArrowUpRightIcon />
        </Button>
      </div>
    </li>
  );
};

const DetailValue = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="text-[13px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
      {value || "미등록"}
    </dd>
  </div>
);

const ProviderLink = ({ label, value }: { label: string; value: string }) => {
  const href = safeApiUrl(value);
  const unavailable = value ? (
    <span>
      {value}
      <span className="mt-1 block text-xs text-warning">
        안전한 웹 주소가 아니므로 링크를 열 수 없습니다.
      </span>
    </span>
  ) : (
    "미등록"
  );
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-xs [overflow-wrap:anywhere]">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex max-w-full items-start gap-1 rounded-sm font-mono text-info underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="min-w-0 break-all">{value}</span>
            <ArrowUpRightIcon className="size-4 shrink-0" />
            <span className="sr-only">새 탭에서 열기</span>
          </a>
        ) : (
          unavailable
        )}
      </dd>
    </div>
  );
};

const Credentials = ({
  entry,
  onReadCredentials
}: Pick<ApiVaultViewProps, "onReadCredentials"> & { entry: ApiVaultEntry }) => {
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  const read = async (index: number, copy: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    const request = generation.current;
    try {
      const credentials = await onReadCredentials(entry);
      if (request !== generation.current) return;
      const credential = credentials[index];
      if (!credential || credential.label !== entry.credentialLabels[index]) {
        setMessage("키 정보가 변경되었습니다. 상세 창을 닫고 목록을 새로고침하세요.");
        return;
      }
      if (copy) {
        await navigator.clipboard.writeText(credential.value);
        if (request === generation.current) setMessage("키를 복사했습니다.");
      } else {
        setRevealed((current) => ({ ...current, [index]: credential.value }));
      }
    } catch {
      if (request === generation.current)
        setMessage(
          copy
            ? "키를 복사하지 못했습니다. 연결 상태와 클립보드 권한을 확인하세요."
            : "키를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도하세요."
        );
    } finally {
      busy.current = false;
      if (request === generation.current) setPending(false);
    }
  };

  return (
    <section
      className="keydesk-detail-section flex flex-col gap-3"
      aria-labelledby="api-detail-credentials"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="api-detail-credentials" className="text-sm">
          인증 키
        </h3>
        <ShieldCheckIcon className="size-3.5 text-muted" aria-hidden />
      </div>
      <p className="text-xs leading-relaxed text-muted">
        보기 또는 복사를 누르면 키를 불러옵니다. 상세 창을 닫으면 표시한 값이 지워집니다.
      </p>
      {entry.credentialLabels.map((label, index) => (
        <div
          key={label}
          className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs break-all">{label}</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={revealed[index] !== undefined ? `${label} 숨기기` : `${label} 보기`}
                onClick={() => {
                  if (revealed[index] !== undefined) {
                    setRevealed((current) => {
                      const next = { ...current };
                      delete next[index];
                      return next;
                    });
                  } else read(index, false);
                }}
              >
                {revealed[index] !== undefined ? <EyeOffIcon /> : <EyeIcon />}
                {revealed[index] !== undefined ? "숨기기" : "보기"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={`${label} 복사`}
                onClick={() => read(index, true)}
              >
                <CopyIcon />
                복사
              </Button>
            </div>
          </div>
          <div
            className="ph-no-capture max-h-40 overflow-y-auto rounded bg-container p-2 font-mono text-sm [overflow-wrap:anywhere] select-text"
            aria-label={`${label} 값`}
            aria-busy={pending}
          >
            {revealed[index] ?? "••••••••••••••••"}
          </div>
        </div>
      ))}
      {entry.credentialLabels.length === 0 && (
        <p className="text-sm text-muted">등록된 키가 없습니다.</p>
      )}
      <p role="status" className="text-sm leading-relaxed text-label">
        {message || (pending ? "키를 불러오는 중…" : "")}
      </p>
    </section>
  );
};

const ApiDetails = ({
  entry,
  onClose,
  onEdit,
  onDelete,
  editPending,
  onReadCredentials
}: {
  entry: ApiVaultEntry;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editPending: boolean;
} & Pick<ApiVaultViewProps, "onReadCredentials">) => (
  <Sheet
    open
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <SheetContent size="form" lang="ko" className="keydesk-sheet sm:max-w-2xl">
      <SheetHeader className="bg-card">
        <span className="font-mono text-[10px] tracking-widest text-muted">
          KEYDESK / API DETAIL
        </span>
        <SheetTitle className="pr-6 text-xl [overflow-wrap:anywhere]">{entry.name}</SheetTitle>
        <SheetDescription>{entry.provider || "제공사 미등록"}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant={STATUS_VARIANTS[entry.status]}>{API_STATUS_LABELS[entry.status]}</Badge>
          <ExpiryBadge expiresAt={entry.expiresAt} />
          {entry.tags.map((tag) => (
            <Badge variant="neutral" className="max-w-full break-all whitespace-normal" key={tag}>
              {tag}
            </Badge>
          ))}
        </div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <DetailValue label="API 용도" value={entry.description} />
          </div>
          <DetailValue label="사용 프로젝트" value={entry.projects} />
          <DetailValue label="관리자·소유자" value={entry.owner} />
        </dl>
        <Credentials entry={entry} onReadCredentials={onReadCredentials} />
        <section
          className="keydesk-detail-section flex flex-col gap-4"
          aria-labelledby="api-detail-links"
        >
          <h3 id="api-detail-links" className="text-sm">
            제공사와 발급 위치
          </h3>
          <dl className="grid gap-5">
            <ProviderLink label="제공사 사이트" value={entry.websiteUrl} />
            <ProviderLink label="발급·관리 콘솔" value={entry.consoleUrl} />
            <ProviderLink label="API 문서" value={entry.docsUrl} />
            <ProviderLink label="API 엔드포인트" value={entry.endpointUrl} />
          </dl>
        </section>
        <section
          className="keydesk-detail-section flex flex-col gap-4"
          aria-labelledby="api-detail-management"
        >
          <h3 id="api-detail-management" className="text-sm">
            관리 정보
          </h3>
          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailValue label="발급일" value={entry.issuedAt} />
            <DetailValue label="만료일" value={entry.expiresAt} />
            <DetailValue label="요금제" value={entry.plan} />
            <DetailValue label="한도·할당량" value={entry.quota} />
            <div className="sm:col-span-2">
              <DetailValue label="관리 메모" value={entry.notes} />
            </div>
          </dl>
        </section>
      </div>
      <SheetFooter className="flex-wrap justify-end border-t bg-card">
        <Button variant="danger" className="mr-auto" onClick={onDelete} disabled={editPending}>
          <Trash2Icon />
          삭제
        </Button>
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
        <Button variant="org" isPending={editPending} onClick={onEdit}>
          <PencilIcon />
          수정
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

export const ApiVaultView = ({
  entries,
  loading,
  saving,
  vaultReady,
  errorMessage,
  onInitialize,
  onSave,
  onDelete,
  onReadCredentials,
  onRefresh
}: ApiVaultViewProps) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApiVaultStatus | "all">("all");
  const [expiry, setExpiry] = useState<ApiExpiryFilter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [editor, setEditor] = useState<{ draft: ApiVaultDraft; entryId?: string }>();
  const [deleteEntry, setDeleteEntry] = useState<ApiVaultEntry>();
  const [actionError, setActionError] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const generation = useRef(0);
  const editBusy = useRef(false);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const selected = entries.find((entry) => entry.id === selectedId);
  const filtered = useMemo(
    () => filterApiEntries(entries, search, status, expiry),
    [entries, search, status, expiry]
  );
  const expiring = entries.filter((entry) => {
    const days = expiryDays(entry.expiresAt);
    return days !== undefined && days >= 0 && days <= 30;
  }).length;
  const expired = entries.filter((entry) => {
    const days = expiryDays(entry.expiresAt);
    return days !== undefined && days < 0;
  }).length;
  const closeDetail = () => {
    generation.current += 1;
    setSelectedId(undefined);
    setEditPending(false);
  };

  const edit = async (entry: ApiVaultEntry) => {
    if (editBusy.current) return;
    editBusy.current = true;
    const request = generation.current;
    setEditPending(true);
    setActionError("");
    try {
      const credentials: ApiCredential[] = await onReadCredentials(entry);
      if (request !== generation.current) return;
      setSelectedId(undefined);
      setEditor({
        draft: {
          name: entry.name,
          provider: entry.provider,
          description: entry.description,
          websiteUrl: entry.websiteUrl,
          consoleUrl: entry.consoleUrl,
          docsUrl: entry.docsUrl,
          endpointUrl: entry.endpointUrl,
          projects: entry.projects,
          owner: entry.owner,
          tags: [...entry.tags],
          issuedAt: entry.issuedAt,
          expiresAt: entry.expiresAt,
          plan: entry.plan,
          quota: entry.quota,
          status: entry.status,
          notes: entry.notes,
          credentials
        },
        entryId: entry.id
      });
    } catch {
      if (request === generation.current)
        setActionError(
          "수정할 키 정보를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도하세요."
        );
    } finally {
      editBusy.current = false;
      if (request === generation.current) setEditPending(false);
    }
  };

  return (
    <main
      lang="ko"
      className="keydesk-vault mx-auto w-full max-w-8xl px-4 py-5 text-foreground sm:px-6 sm:py-7"
    >
      <div className="mb-3 flex items-center gap-2 text-[10px] text-muted">
        <span className="font-mono tracking-[0.12em]">KEYDESK</span>
        <span className="h-2.5 border-l border-border" aria-hidden />
        <span>개인 API 인벤토리</span>
      </div>
      <PageHeader
        title="내 API 보관함"
        scope="org"
        icon={KeyRoundIcon}
        className="mb-6 [&_[data-slot=page-header-row]]:flex-wrap [&_[data-slot=page-header-row]]:gap-y-3"
        description="어디서 발급했는지, 어디에 쓰는지. API 키와 관리 정보를 함께 기록하세요."
      >
        <Button
          variant="ghost"
          size="sm"
          disabled={loading || actionPending}
          onClick={onRefresh}
          aria-label="API 목록 새로고침"
        >
          <RefreshCwIcon />
          <span className="hidden sm:inline">새로고침</span>
        </Button>
        {vaultReady && (
          <Button
            variant="org"
            size="sm"
            disabled={loading || saving}
            onClick={() => {
              setActionError("");
              setEditor({ draft: emptyApiDraft() });
            }}
          >
            <PlusIcon />
            API 등록
          </Button>
        )}
      </PageHeader>
      {(errorMessage || actionError) && (
        <Alert variant="danger" className="mb-5">
          <AlertDescription>{actionError || errorMessage}</AlertDescription>
        </Alert>
      )}
      {loading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-3 text-xs text-muted" role="status">
            <RefreshCwIcon className="size-3.5 motion-safe:animate-spin" aria-hidden />
            API 목록을 불러오는 중…
          </CardContent>
        </Card>
      )}
      {!loading && !vaultReady && (
        <Card>
          <CardContent>
            <Empty
              variant="unstyled"
              className="items-start gap-4 rounded-md border border-border p-4 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <EmptyHeader className="items-start text-left">
                <EmptyTitle>API 보관함을 준비하세요</EmptyTitle>
                <EmptyDescription>
                  키와 관리 정보를 암호화해 저장합니다. 보관함을 만든 뒤 첫 API를 등록하세요.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                variant="org"
                isPending={actionPending || saving}
                onClick={async () => {
                  setActionError("");
                  setActionPending(true);
                  try {
                    await onInitialize();
                  } catch {
                    setActionError(
                      "API 보관함을 만들지 못했습니다. 연결 상태를 확인하고 다시 시도하세요."
                    );
                  } finally {
                    setActionPending(false);
                  }
                }}
              >
                API 보관함 만들기
              </Button>
            </Empty>
          </CardContent>
        </Card>
      )}
      {!loading && vaultReady && (
        <div className="flex flex-col gap-4">
          <dl className="keydesk-summary" aria-label="API 관리 현황">
            {[
              ["전체 API", entries.length],
              ["사용 중", entries.filter((entry) => entry.status === "active").length],
              ["30일 내 만료", expiring],
              ["만료됨", expired]
            ].map(([label, count]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-mono text-sm tabular-nums" data-count={count}>
                  {count}
                  <span className="sr-only">개</span>
                </dd>
              </div>
            ))}
          </dl>
          <Card className="keydesk-inventory gap-0 overflow-hidden p-0">
            <CardHeader className="gap-3 border-b p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">등록한 API</CardTitle>
                  <CardDescription className="hidden text-xs text-muted sm:block">
                    용도 · 발급 위치 · 사용처
                  </CardDescription>
                </div>
                <p role="status" className="font-mono text-[10px] text-muted">
                  {filtered.length} / {entries.length}
                  <span className="sr-only">개 API 표시</span>
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_8rem_10rem]">
                <Field className="sm:col-span-2 lg:col-span-1">
                  <FieldLabel htmlFor="api-search" className="sr-only">
                    API 검색
                  </FieldLabel>
                  <div className="relative">
                    <SearchIcon className="absolute top-2.5 left-3 size-4 text-muted" />
                    <Input
                      id="api-search"
                      className="pl-9"
                      placeholder="API 이름, 제공사, 프로젝트 검색"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </Field>
                <Field>
                  <FieldLabel className="sr-only" htmlFor="api-status-filter">
                    사용 상태 필터
                  </FieldLabel>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as ApiVaultStatus | "all")}
                  >
                    <SelectTrigger id="api-status-filter" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 상태</SelectItem>
                      {Object.entries(API_STATUS_LABELS).map(([value, label]) => (
                        <SelectItem value={value} key={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel className="sr-only" htmlFor="api-expiry-filter">
                    만료일 필터
                  </FieldLabel>
                  <Select
                    value={expiry}
                    onValueChange={(value) => setExpiry(value as ApiExpiryFilter)}
                  >
                    <SelectTrigger id="api-expiry-filter" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 만료일</SelectItem>
                      <SelectItem value="expiring">30일 내 만료</SelectItem>
                      <SelectItem value="expired">만료됨</SelectItem>
                      <SelectItem value="unset">만료일 미등록</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length ? (
                <>
                  <div className="keydesk-list-heading" aria-hidden>
                    <span>API / 제공사 / 용도</span>
                    <span>사용 프로젝트</span>
                    <span>상태 / 만료일</span>
                    <span className="text-right">인증 키</span>
                  </div>
                  <ul aria-label="등록한 API 목록">
                    {filtered.map((entry) => (
                      <InventoryRow
                        entry={entry}
                        key={entry.id}
                        onSelect={() => {
                          generation.current += 1;
                          setSelectedId(entry.id);
                          setActionError("");
                        }}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <Empty
                  variant="unstyled"
                  className="m-4 items-start gap-4 rounded-md border border-border p-5 text-left sm:flex-row sm:items-center sm:justify-between"
                >
                  <EmptyHeader className="items-start text-left">
                    <EmptyTitle>
                      {entries.length
                        ? "검색 조건에 맞는 API가 없습니다"
                        : "아직 등록한 API가 없습니다"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {entries.length
                        ? "검색어나 필터를 변경해 보세요."
                        : "첫 API를 등록하고 키와 관리 정보를 함께 보관하세요."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {entries.length ? (
                    <Button
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                        setExpiry("all");
                      }}
                    >
                      검색 조건 초기화
                    </Button>
                  ) : (
                    <Button variant="org" onClick={() => setEditor({ draft: emptyApiDraft() })}>
                      <PlusIcon />첫 API 등록
                    </Button>
                  )}
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
        <p className="font-mono">
          Keydesk <span aria-hidden>·</span> by Norm / thisNorm
        </p>
        <p className="inline-flex items-center gap-1.5">
          <ShieldCheckIcon className="size-3" aria-hidden />
          키는 필요할 때만 표시 <span aria-hidden>·</span> Infisical 기반
        </p>
      </footer>
      {selected && !editor && (
        <ApiDetails
          key={selected.id}
          entry={selected}
          onClose={closeDetail}
          onReadCredentials={onReadCredentials}
          editPending={editPending}
          onEdit={() => edit(selected)}
          onDelete={() => {
            setActionError("");
            setDeleteEntry(selected);
          }}
        />
      )}
      {editor && (
        <ApiVaultEditor
          draft={editor.draft}
          entryId={editor.entryId}
          saving={saving}
          onSave={onSave}
          onClose={() => setEditor(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(deleteEntry)}
        isPending={actionPending || saving}
        onOpenChange={(open) => {
          if (!open) setDeleteEntry(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>“{deleteEntry?.name}” API를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              보관함의 API 정보와 등록한 키가 삭제됩니다. 제공사에서 발급한 키 자체는 폐기되지
              않습니다. 삭제한 정보는 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <Alert variant="danger">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">취소</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={actionPending || saving}
              onClick={async (event) => {
                event.preventDefault();
                if (!deleteEntry || actionPending) return;
                setActionError("");
                setActionPending(true);
                try {
                  await onDelete(deleteEntry);
                  setDeleteEntry(undefined);
                  closeDetail();
                } catch (error) {
                  setActionError(
                    error instanceof Error
                      ? error.message
                      : "API를 삭제하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요."
                  );
                } finally {
                  setActionPending(false);
                }
              }}
            >
              API 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
