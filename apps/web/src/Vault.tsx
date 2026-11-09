import { useEffect, useRef, useState } from 'react';
import type { Credential, Entry, Project } from '@keydesk/contracts';
import { api, copyText } from './api.ts';
import {
  calendarDay,
  expiryDays,
  expiryText,
  formatCredentialDate,
  parseVaultPreferences,
  visibleVaultEntries,
  type VaultSort,
} from './helpers.ts';
import { Confirm, Modal, statusLabel } from './ui.tsx';
import { Secret, hideRevealedSecrets, requestCredentialValue } from './Secret.tsx';
import { EntryEditor } from './vault/EntryEditor.tsx';
import { ImportEntries } from './vault/ImportEntries.tsx';
import { RotateCredential } from './vault/RotateCredential.tsx';
import { deskKeyContext, deskMatches, deskQueue } from './vault/desk-work.ts';
import './vault/rack.css';

const preferenceKey = 'keydesk-vault-view';
function preferences() {
  try {
    return parseVaultPreferences(localStorage.getItem(preferenceKey));
  } catch {
    return parseVaultPreferences(null);
  }
}
const buckets = [
  ['expired', '기한이 지난 키'],
  ['expiring', '30일 안에 만료'],
  ['unset', '만료일 미등록'],
] as const;
const iconPaths = {
  search: 'M15 15l4 4 M16 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 1 1 11 0Z',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  arrow: 'M5 12h13m-5-5 5 5-5 5',
  chevron: 'm7 10 5 5 5-5',
  copy: 'M9 8h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM15 5H6a1 1 0 0 0-1 1v9',
};
function DeskIcon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg className="desk-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function Vault({
  entries,
  projects,
  reload,
  reloadProjects,
  notify,
  project,
  setProject,
  zone,
  initialEntryId,
}: {
  entries: Entry[];
  projects: Project[];
  reload: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  notify: (message: string) => void;
  project: string;
  setProject: (id: string) => void;
  zone: string;
  initialEntryId?: string;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'keys' | 'work'>('keys');
  const [sort, setSort] = useState<VaultSort>(() => preferences().sort);
  const [selected, setSelected] = useState(initialEntryId ?? '');
  const [detailMessage, setDetailMessage] = useState('');
  const [copying, setCopying] = useState('');
  const [copied, setCopied] = useState<{ id: string; message: string } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [editFocus, setEditFocus] = useState<string>();
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined);
  const [rotating, setRotating] = useState<{ entry: Entry; credential: Credential } | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [importing, setImporting] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [savedEntry, setSavedEntry] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const copyState = useRef({ epoch: 0, busy: false });
  useEffect(() => {
    const state = copyState.current;
    const invalidate = () => {
      state.epoch++;
      state.busy = false;
      setCopying('');
    };
    const visibility = () => {
      if (document.hidden) invalidate();
    };
    window.addEventListener('blur', invalidate);
    window.addEventListener('keydesk:mask', invalidate);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      state.epoch++;
      state.busy = false;
      clearTimeout(copyTimer.current);
      window.removeEventListener('blur', invalidate);
      window.removeEventListener('keydesk:mask', invalidate);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || document.querySelector('dialog[open]'))
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        search.current?.focus();
      }
      if (event.key === 'Escape') {
        hideRevealedSecrets();
        setSelected('');
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({ sort }));
    } catch {
      /* 저장소를 사용할 수 없어도 현재 보기는 유지한다. */
    }
  }, [sort]);
  useEffect(() => {
    if (initialEntryId) {
      setQuery('');
      setMode('keys');
      setDetailMessage('');
      setSelected(initialEntryId);
    }
  }, [initialEntryId]);
  useEffect(() => {
    const saved = entries.find((entry) => entry.id === savedEntry);
    if (!saved) return;
    setQuery('');
    setMode('keys');
    setDetailMessage('');
    if (project && !saved.projectIds.includes(project)) setProject('');
    setSelected(saved.id);
    setSavedEntry('');
  }, [entries, savedEntry, project, setProject]);

  const now = new Date();
  const projectName = projects.find((item) => item.id === project)?.name;
  const folderId = projectName ? project : '';
  const ordered =
    mode === 'keys'
      ? visibleVaultEntries(entries, projects, {
          query: '',
          project: folderId,
          filter: 'all',
          sort,
          zone,
          now,
        })
      : [];
  const groups = ordered.flatMap((entry) => {
    const matched = deskMatches(entry, query, projects);
    return matched?.length === 0 ? [] : [{ entry, keys: matched ?? entry.credentials }];
  });
  const shownKeys = groups.reduce((total, group) => total + group.keys.length, 0);
  const directMatches = query.trim()
    ? groups.flatMap(({ entry, keys }) =>
        keys.filter((key) => key.status === 'active').map((credential) => ({ entry, credential })),
      )
    : [];
  const quickMatch = directMatches.length === 1 ? directMatches[0] : undefined;
  const macKeys = /Mac|iPhone|iPad/.test(navigator.platform);
  const copyShortcut = macKeys ? '⌘+Enter' : 'Ctrl+Enter';
  const due = deskQueue(entries, zone, now);
  const dueCount = due.expired.length + due.expiring.length + due.unset.length;
  const queue = { ...due };
  if (mode === 'work' && query.trim()) {
    const matches = new Map(
      entries.map((entry) => [entry.id, deskMatches(entry, query, projects)]),
    );
    for (const [bucket] of buckets)
      queue[bucket] = due[bucket].filter(({ entry, credential }) => {
        const matched = matches.get(entry.id);
        return matched === null || matched?.some((key) => key.id === credential.id);
      });
  }
  const detail = entries.find((entry) => entry.id === selected);
  const keyContext = (entry: Entry, key: Credential) =>
    deskKeyContext(entry, key, entries, projects);
  const expiryTarget =
    editing && editFocus && editing.credentials.find((key) => key.id === editFocus);
  async function saved(id?: string, openAfterSave = true) {
    try {
      await reload();
      setRefreshError('');
      if (id && openAfterSave) setSavedEntry(id);
    } catch (error) {
      if (id && openAfterSave) setSavedEntry(id);
      setRefreshError(
        '저장은 완료했지만 목록을 다시 불러오지 못했습니다. 다시 저장하지 않아도 됩니다.',
      );
      throw error;
    }
  }
  function edit(entry: Entry | null, credentialId?: string) {
    hideRevealedSecrets();
    setEditFocus(credentialId);
    setEditing(entry);
  }
  function openEntry(id: string) {
    hideRevealedSecrets();
    setDetailMessage('');
    setSelected(id);
  }
  function changeMode(next: 'keys' | 'work') {
    if (next === mode) return;
    hideRevealedSecrets();
    setMode(next);
    setQuery('');
  }
  function chooseFolder(id: string) {
    if (mode === 'keys' && folderId === id) return;
    hideRevealedSecrets();
    setMode('keys');
    setProject(id);
    setQuery('');
  }
  function startRotation(entry: Entry, credential: Credential) {
    hideRevealedSecrets();
    setRotating({ entry, credential });
  }
  function startImport() {
    hideRevealedSecrets();
    setImporting(true);
  }
  async function copyKey(entry: Entry, credential: Credential) {
    const state = copyState.current;
    if (state.busy) return;
    const epoch = ++state.epoch;
    const current = () => state.epoch === epoch && !document.hidden;
    state.busy = true;
    setCopying(credential.id);
    try {
      const { value } = await requestCredentialValue(credential.id, credential.version);
      if (!current()) return;
      const copied = await copyText(value, current);
      if (!current()) return;
      if (copied) {
        clearTimeout(copyTimer.current);
        setCopied({ id: credential.id, message: `${entry.name} ${credential.label} 복사 완료` });
        copyTimer.current = setTimeout(() => setCopied(null), 2300);
      } else {
        setDetailMessage(
          `자동 복사를 사용할 수 없습니다. ‘${credential.label}’에서 보기를 누른 뒤 직접 복사해 주세요.`,
        );
        setSelected(entry.id);
      }
    } catch (error) {
      if (current()) notify((error as Error).message);
    } finally {
      if (state.epoch === epoch) {
        state.busy = false;
        setCopying('');
      }
    }
  }
  function keyDeadline(key: Credential) {
    if (key.status !== 'active')
      return <span className="rack-deadline">{statusLabel[key.status]}</span>;
    if (!key.expiresAt) return <span className="rack-deadline">만료일 미등록</span>;
    const days = expiryDays(key.expiresAt, now, zone);
    if (days === null) return <span className="rack-deadline">날짜 확인 필요</span>;
    return (
      <span
        className="rack-deadline"
        data-state={days < 0 ? 'past' : days <= 30 ? 'soon' : undefined}
      >
        <time dateTime={key.expiresAt} title={formatCredentialDate(key.expiresAt, zone)}>
          {(key.expiresAt.length === 10
            ? key.expiresAt
            : calendarDay(new Date(key.expiresAt), zone)
          ).replaceAll('-', '.')}
        </time>
        {(days <= 30 || key.expiresAt.length > 10) && (
          <small>{days <= 30 ? expiryText(key.expiresAt, zone, now) : '시각 지정'}</small>
        )}
      </span>
    );
  }
  function entryDetail(entry: Entry) {
    return (
      <aside className="entry-detail desk-detail" aria-label="선택한 API 상세">
        <p className="desk-detail-subtitle">
          {[
            entry.description || entry.provider,
            ...projects.filter((p) => entry.projectIds.includes(p.id)).map((p) => p.name),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <header className="entry-detail-head desk-detail-head">
          <h3>
            등록한 키 <span className="muted">{entry.credentials.length}개</span>
          </h3>
          <div className="actions">
            {entry.consoleUrl && (
              <a href={entry.consoleUrl} target="_blank" rel="noreferrer noopener">
                발급 콘솔 ↗
              </a>
            )}
            {entry.docsUrl && (
              <a href={entry.docsUrl} target="_blank" rel="noreferrer noopener">
                API 문서 ↗
              </a>
            )}
            <button type="button" onClick={() => edit(entry)}>
              수정
            </button>
          </div>
        </header>
        <p className="desk-detail-message" role="status">
          {detailMessage}
        </p>
        {entry.credentials.map((credential) => (
          <Secret
            key={`${credential.id}-${credential.version}`}
            credential={credential}
            zone={zone}
            notify={setDetailMessage}
            onRotate={() => startRotation(entry, credential)}
          />
        ))}
        {!entry.credentials.length && (
          <p>
            아직 인증값이 없습니다.{' '}
            <button type="button" className="text-button" onClick={() => edit(entry)}>
              인증값 추가
            </button>
          </p>
        )}
        <details className="entry-information">
          <summary>주소·요금제·관리 메모</summary>
          <div className="entry-information-body">
            <dl>
              {(
                [
                  ['제공사', entry.provider],
                  [
                    '사용 프로젝트',
                    projects
                      .filter((p) => entry.projectIds.includes(p.id))
                      .map((p) => p.name)
                      .join(', '),
                  ],
                  ['API 주소', entry.endpointUrl],
                  ['소유자 메모', entry.owner],
                  ['태그', entry.tags.join(', ')],
                  ['요금제 메모', entry.plan],
                  ['제공사 한도 메모', entry.quota],
                ] as [string, string][]
              )
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            {entry.websiteUrl && (
              <a href={entry.websiteUrl} target="_blank" rel="noreferrer noopener">
                웹사이트 ↗
              </a>
            )}
            {entry.notes && (
              <div className="note">
                <h3>메모</h3>
                <p>{entry.notes}</p>
              </div>
            )}
            <div className="detail-management">
              <span className="muted">
                최근 수정 {new Date(entry.updatedAt).toLocaleString('ko-KR', { timeZone: zone })}
              </span>
              <button
                type="button"
                className="danger-text text-button"
                onClick={() => {
                  hideRevealedSecrets();
                  setDeleting(entry);
                }}
              >
                항목 삭제
              </button>
            </div>
          </div>
        </details>
      </aside>
    );
  }
  return (
    <div className="vault-rack">
      <div className="rack-index">
        <nav className="rack-folders" aria-label="프로젝트별 키">
          {[{ id: '', name: '전체 키' }, ...projects].map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="rack-tab"
              aria-label={folder.id ? `${folder.name} 키 열기` : '전체 키 열기'}
              aria-pressed={mode === 'keys' && folderId === folder.id}
              onClick={() => chooseFolder(folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </nav>
        <div className="rack-work-switch">
          <button
            className="rack-work-tab"
            type="button"
            aria-label={dueCount ? `만료 정리, 정리 대상 키 ${dueCount}개` : '만료 정리'}
            aria-pressed={mode === 'work'}
            onClick={() => changeMode('work')}
          >
            만료 정리{dueCount > 0 && <span>{dueCount}</span>}
            {mode === 'keys' && <DeskIcon name="arrow" />}
          </button>
        </div>
      </div>

      <section className="rack-sheet" aria-labelledby="rack-title">
        <header className="rack-head">
          <div className="rack-heading">
            <h1 id="rack-title">{mode === 'work' ? '만료 정리' : projectName || '전체 키'}</h1>
            <div className="rack-heading-meta">
              <p role="status">
                {mode === 'work'
                  ? '전체 프로젝트에서 사용 중인 키의 기한을 확인합니다.'
                  : `${groups.length}개 항목 · 인증값 ${shownKeys}개`}
                {quickMatch && (
                  <span className="rack-visually-hidden" id="rack-copy-hint">
                    {' '}
                    검색 결과: {quickMatch.entry.name} {quickMatch.credential.label}.{' '}
                    {macKeys ? 'Command' : 'Control'}+Enter로 복사할 수 있습니다.
                  </span>
                )}
              </p>
              {mode === 'keys' && groups.length > 0 && (
                <label className="rack-sort">
                  <select
                    aria-label="정렬 순서"
                    value={sort}
                    onChange={(event) => {
                      hideRevealedSecrets();
                      setSort(event.target.value as VaultSort);
                    }}
                  >
                    <option value="expiry">만료일순</option>
                    <option value="name">이름순</option>
                    <option value="updated">최근 수정순</option>
                  </select>
                  <DeskIcon name="chevron" />
                </label>
              )}
            </div>
          </div>
          <div className="rack-tools">
            <label className="rack-search">
              <DeskIcon name="search" />
              <input
                ref={search}
                type="search"
                aria-label="API 검색"
                aria-describedby={quickMatch ? 'rack-copy-hint' : undefined}
                aria-keyshortcuts={quickMatch ? 'Control+Enter Meta+Enter' : undefined}
                placeholder={mode === 'work' ? '정리할 키 검색' : '키 검색'}
                value={query}
                onChange={(event) => {
                  hideRevealedSecrets();
                  setQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    !(event.ctrlKey || event.metaKey) ||
                    event.altKey ||
                    event.shiftKey ||
                    event.repeat ||
                    event.nativeEvent.isComposing ||
                    event.keyCode === 229 ||
                    !quickMatch
                  )
                    return;
                  event.preventDefault();
                  void copyKey(quickMatch.entry, quickMatch.credential);
                }}
              />
              <kbd aria-hidden="true">
                {quickMatch ? `${copyShortcut} 복사` : macKeys ? '⌘ K' : 'Ctrl K'}
              </kbd>
            </label>
            {mode === 'keys' && (
              <div className="rack-actions">
                <button type="button" onClick={startImport}>
                  가져오기
                </button>
                <button type="button" className="rack-add" onClick={() => edit(null)}>
                  <DeskIcon name="plus" /> 키 추가
                </button>
              </div>
            )}
          </div>
        </header>

        {refreshError && (
          <p className="error rack-error" role="alert">
            {refreshError}{' '}
            <button
              type="button"
              onClick={() =>
                void reload()
                  .then(() => setRefreshError(''))
                  .catch((error) => notify(error.message))
              }
            >
              목록 다시 불러오기
            </button>
          </p>
        )}

        {mode === 'keys' ? (
          <>
            {groups.length > 0 && (
              <>
                <ul className="rack-sources" aria-label="보관한 서비스">
                  {groups.map(({ entry, keys }) => {
                    const usedBy = projects
                      .filter((item) => entry.projectIds.includes(item.id) && item.id !== folderId)
                      .map((item) => item.name)
                      .join(' · ');
                    const metadata = [
                      entry.description || (entry.provider !== entry.name ? entry.provider : ''),
                      usedBy && (folderId ? `함께 사용: ${usedBy}` : usedBy),
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li key={entry.id} className="rack-source">
                        <div className="rack-service">
                          <button
                            type="button"
                            aria-label={`${entry.name} 상세 보기`}
                            aria-haspopup="dialog"
                            onClick={() => openEntry(entry.id)}
                          >
                            {entry.name}
                            <DeskIcon name="arrow" />
                          </button>
                          {metadata && <span>{metadata}</span>}
                        </div>
                        {keys.length ? (
                          <ul
                            className="rack-keys"
                            aria-label={`${entry.name} 인증값`}
                            data-branch={keys.length > 1 || undefined}
                          >
                            {keys.map((key) => {
                              const context = keyContext(entry, key);
                              const scope = context.ambiguous ? ` (${context.caption})` : '';
                              return (
                                <li className="rack-key" key={key.id}>
                                  <span className="rack-key-name">
                                    {key.label}
                                    {context.ambiguous && <small>{context.caption}</small>}
                                  </span>
                                  {keyDeadline(key)}
                                  {key.status === 'active' ? (
                                    <button
                                      className="rack-copy"
                                      type="button"
                                      aria-label={`${entry.name} ${key.label} 복사${scope}`}
                                      aria-disabled={Boolean(copying) || undefined}
                                      data-copied={copied?.id === key.id || undefined}
                                      onClick={() => void copyKey(entry, key)}
                                    >
                                      <DeskIcon name={copied?.id === key.id ? 'check' : 'copy'} />
                                      {copying === key.id
                                        ? '복사 중'
                                        : copied?.id === key.id
                                          ? '복사됨'
                                          : '복사'}
                                    </button>
                                  ) : (
                                    <button
                                      className="rack-copy"
                                      type="button"
                                      aria-label={`${entry.name} ${key.label} 관리${scope}`}
                                      aria-haspopup="dialog"
                                      onClick={() => openEntry(entry.id)}
                                    >
                                      관리
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div className="rack-empty-key">
                            <span>등록된 인증값 없음</span>
                            <button type="button" onClick={() => edit(entry)}>
                              인증값 추가
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {!groups.length && (
              <div className="rack-empty">
                <h2>
                  {entries.length
                    ? query.trim()
                      ? '찾는 키가 없습니다'
                      : '이 프로젝트에 연결된 키가 없습니다'
                    : '보관할 첫 키를 넣어 보세요'}
                </h2>
                {query.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      hideRevealedSecrets();
                      setQuery('');
                      search.current?.focus();
                    }}
                  >
                    검색어 지우기
                  </button>
                )}
                {folderId && (
                  <button
                    type="button"
                    onClick={() => {
                      hideRevealedSecrets();
                      setProject('');
                      search.current?.focus();
                    }}
                  >
                    전체에서 보기
                  </button>
                )}
                {!entries.length && (
                  <button type="button" className="rack-add" onClick={() => edit(null)}>
                    첫 키 등록
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="rack-queue">
            {buckets.map(([bucket, label]) => {
              const items = queue[bucket];
              if (!items.length) return null;
              return (
                <section
                  className="rack-bucket"
                  key={bucket}
                  data-bucket={bucket}
                  aria-labelledby={`rack-${bucket}`}
                >
                  <header>
                    <h2 id={`rack-${bucket}`}>{label}</h2>
                    <p>{items.length}개</p>
                  </header>
                  <ul>
                    {items.map(({ entry, credential }) => {
                      const context = keyContext(entry, credential);
                      const scope = context.ambiguous ? ` (${context.caption})` : '';
                      return (
                        <li className="rack-task" key={credential.id}>
                          {bucket !== 'unset' && keyDeadline(credential)}
                          <div className="rack-task-key">
                            <button
                              type="button"
                              aria-label={`${entry.name} 상세 보기`}
                              aria-haspopup="dialog"
                              onClick={() => openEntry(entry.id)}
                            >
                              {entry.name}
                            </button>
                            <span>
                              {credential.label} · {context.caption}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="rack-task-action"
                            aria-label={`${entry.name} ${credential.label} ${bucket === 'unset' ? '만료일 등록' : '교체'}${scope}`}
                            onClick={() =>
                              bucket === 'unset'
                                ? edit(entry, credential.id)
                                : startRotation(entry, credential)
                            }
                          >
                            {bucket === 'unset' ? '만료일 등록' : '키 교체'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            {!buckets.some(([bucket]) => queue[bucket].length) && (
              <div className="rack-empty">
                <h2>
                  {query.trim() ? '검색 조건에 맞는 키가 없습니다' : '지금 정리할 키가 없습니다'}
                </h2>
                {query.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      search.current?.focus();
                    }}
                  >
                    검색어 지우기
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      <span className="rack-visually-hidden" role="status">
        {copied?.message}
      </span>
      {detail && (
        <Modal
          title={detail.name}
          focusTitle
          className="desk-detail-modal"
          onClose={() => openEntry('')}
        >
          {entryDetail(detail)}
        </Modal>
      )}
      {editing !== undefined && (
        <EntryEditor
          entry={editing ?? undefined}
          projects={projects}
          onProjects={reloadProjects}
          onClose={() => setEditing(undefined)}
          onSaved={(id) => saved(id, editing === null)}
          defaultProjectId={folderId || undefined}
          focusExpiryFor={editFocus}
          expiryContext={
            editing && expiryTarget
              ? `${editing.name} · ${expiryTarget.label} · ${keyContext(editing, expiryTarget).caption}`
              : undefined
          }
          notify={notify}
          zone={zone}
        />
      )}
      {rotating && (
        <RotateCredential
          entry={rotating.entry}
          credential={rotating.credential}
          contextLabel={keyContext(rotating.entry, rotating.credential).caption}
          zone={zone}
          onClose={() => setRotating(null)}
          onSaved={(id) => saved(id, false)}
          notify={notify}
        />
      )}
      {importing && (
        <ImportEntries
          entries={entries}
          projects={projects}
          onClose={() => setImporting(false)}
          onSaved={saved}
          notify={notify}
        />
      )}
      {deleting && (
        <Confirm
          title="항목 삭제"
          confirmLabel="항목 삭제"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/entries/${deleting.id}`, 'DELETE');
            setDeleting(null);
            setSelected('');
            try {
              await reload();
              notify('항목을 삭제했습니다.');
            } catch {
              setRefreshError('삭제는 완료했지만 목록을 다시 불러오지 못했습니다.');
            }
          }}
        >
          <p>‘{deleting.name}’의 인증값과 모든 교체 기록을 삭제합니다. 되돌릴 수 없습니다.</p>
        </Confirm>
      )}
    </div>
  );
}
