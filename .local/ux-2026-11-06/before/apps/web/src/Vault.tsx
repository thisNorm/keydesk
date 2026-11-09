import { useEffect, useRef, useState } from 'react';
import type {
  Credential,
  CredentialVersion,
  Entry,
  EntryDraft,
  Project,
  CredentialDraft,
} from '@keydesk/contracts';
import { api, copyText } from './api.ts';
import {
  calendarDay,
  emptyDraft,
  expiryDays,
  expiryText,
  formatCredentialDate,
  firstExpiry,
  parseEnv,
  searchEntries,
  validateDraft,
} from './helpers.ts';
import { Confirm, Empty, Field, Form, Modal, statusLabel } from './ui.tsx';
export function EntryEditor({
  entry,
  projects,
  onProjects,
  onClose,
  onSaved,
}: {
  entry?: Entry;
  projects: Project[];
  onProjects: () => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<EntryDraft>(() =>
      entry
        ? {
            ...entry,
            credentials: entry.credentials.map((c) => ({
              id: c.id,
              label: c.label,
              status: c.status,
              issuedAt: c.issuedAt,
              expiresAt: c.expiresAt,
            })),
          }
        : {
            ...emptyDraft(),
            credentials: [
              { label: 'API 키', value: '', status: 'active', issuedAt: '', expiresAt: '' },
            ],
          },
    ),
    [newProject, setNewProject] = useState(''),
    [projectError, setProjectError] = useState(''),
    [creating, setCreating] = useState(false);
  const set = (key: keyof EntryDraft, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  const keySet = (i: number, key: keyof CredentialDraft, value: string) =>
    setDraft((d) => ({
      ...d,
      credentials: d.credentials?.map((c, n) => (n === i ? { ...c, [key]: value } : c)),
    }));
  async function createProject() {
    if (!newProject.trim() || creating) return;
    setCreating(true);
    setProjectError('');
    try {
      const { project } = await api<{
        project: Project;
      }>('/projects', 'POST', { name: newProject.trim() });
      await onProjects();
      setDraft((d) => ({ ...d, projectIds: [...d.projectIds, project.id] }));
      setNewProject('');
    } catch (e) {
      setProjectError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  return (
    <Modal title={entry ? '항목 수정' : '항목 추가'} onClose={onClose} wide>
      <Form
        onCancel={onClose}
        onSubmit={async () => {
          const errors = validateDraft(draft);
          if (errors.length) throw Error(errors.join(' '));
          await api(entry ? `/entries/${entry.id}` : '/entries', entry ? 'PUT' : 'POST', draft);
          await onSaved();
          onClose();
        }}
      >
        <div className="form-grid">
          <Field label="이름">
            <input
              required
              autoComplete="off"
              value={draft.name}
              maxLength={200}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="제공사">
            <input value={draft.provider} onChange={(e) => set('provider', e.target.value)} />
          </Field>
        </div>
        <Field label="용도">
          <input value={draft.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="field">
          <span>사용 프로젝트</span>
          <div className="checkboxes">
            {projects.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={draft.projectIds.includes(p.id)}
                  onChange={(e) =>
                    set(
                      'projectIds',
                      e.target.checked
                        ? [...draft.projectIds, p.id]
                        : draft.projectIds.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <div className="inline">
            <input
              aria-label="새 프로젝트 이름"
              placeholder="새 프로젝트 이름"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void createProject();
                }
              }}
            />
            <button type="button" disabled={creating} onClick={() => void createProject()}>
              프로젝트 만들기
            </button>
          </div>
          {projectError && (
            <small className="error" role="alert">
              {projectError}
            </small>
          )}
        </div>
        <h3>등록할 인증값</h3>
        <p className="muted">
          기존 키의 새 인증값을 비워 두면 현재 값을 유지합니다. 새 값을 입력하면 다음 버전으로
          교체합니다.
        </p>
        {draft.credentials?.map((c, i) => (
          <section className="key-editor" key={c.id ?? `new-${i}`} aria-label={`${i + 1}번 인증값`}>
            <div className="form-grid">
              <Field label="키 이름">
                <input
                  required
                  value={c.label}
                  onChange={(e) => keySet(i, 'label', e.target.value)}
                />
              </Field>
              <Field label="상태">
                <select value={c.status} onChange={(e) => keySet(i, 'status', e.target.value)}>
                  {Object.entries(statusLabel).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={c.id ? '새 인증값 (교체할 때만 입력)' : '인증값'}>
              <input
                type="password"
                autoComplete="new-password"
                required={!c.id}
                value={c.value ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    credentials: d.credentials?.map((k, n) =>
                      n === i ? { ...k, value: value || undefined } : k,
                    ),
                  }));
                }}
              />
            </Field>
            <div className="form-grid">
              <Field
                label="발급일"
                hint={
                  c.issuedAt.includes('T')
                    ? '시각을 포함한 원본입니다. Z 또는 +09:00 같은 시간대를 유지해 주세요.'
                    : undefined
                }
              >
                <input
                  type={c.issuedAt.includes('T') ? 'text' : 'date'}
                  value={c.issuedAt}
                  onChange={(e) => keySet(i, 'issuedAt', e.target.value)}
                />
              </Field>
              <Field
                label="만료일"
                hint={
                  c.expiresAt.includes('T')
                    ? '시각을 포함한 원본입니다. Z 또는 +09:00 같은 시간대를 유지해 주세요.'
                    : undefined
                }
              >
                <input
                  type={c.expiresAt.includes('T') ? 'text' : 'date'}
                  value={c.expiresAt}
                  onChange={(e) => keySet(i, 'expiresAt', e.target.value)}
                />
              </Field>
            </div>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() =>
                set(
                  'credentials',
                  draft.credentials?.filter((_, n) => n !== i),
                )
              }
            >
              이 키 제거
            </button>
          </section>
        ))}
        <button
          type="button"
          onClick={() =>
            set('credentials', [
              ...(draft.credentials ?? []),
              { label: '', value: '', status: 'active', issuedAt: '', expiresAt: '' },
            ])
          }
        >
          인증값 추가
        </button>
        <details>
          <summary>주소와 관리 메모</summary>
          <div className="form-grid">
            {(
              [
                ['websiteUrl', '웹사이트'],
                ['consoleUrl', '발급 콘솔'],
                ['docsUrl', 'API 문서'],
                ['endpointUrl', 'API 주소'],
                ['owner', '소유자 메모'],
                ['plan', '요금제 메모'],
                ['quota', '제공사 한도 메모'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type={key.endsWith('Url') ? 'url' : 'text'}
                  value={draft[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            ))}
            <Field label="태그 (쉼표로 구분)">
              <input
                value={draft.tags.join(', ')}
                onChange={(e) =>
                  set(
                    'tags',
                    e.target.value.split(',').map((t) => t.trim()),
                  )
                }
              />
            </Field>
          </div>
          <Field label="메모">
            <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </details>
      </Form>
    </Modal>
  );
}
function Secret({
  credential,
  notify,
  zone,
}: {
  credential: Credential;
  notify: (s: string) => void;
  zone: string;
}) {
  const [value, setValue] = useState(''),
    [versions, setVersions] = useState<CredentialVersion[] | null>(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(credential.version),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    live = useRef(true),
    generation = useRef(0);
  const clear = () => {
    generation.current++;
    setValue('');
    clearTimeout(timer.current);
  };
  useEffect(() => {
    live.current = true;
    const hide = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', clear);
    return () => {
      live.current = false;
      generation.current++;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', clear);
    };
  }, []);
  async function reveal(copy = false) {
    setBusy(true);
    const request = generation.current;
    try {
      const result = await api<{
        value: string;
      }>(`/credentials/${credential.id}/reveal`, 'POST', { version: selected });
      if (!live.current || request !== generation.current || document.hidden) return;
      if (copy) {
        if (await copyText(result.value)) {
          notify('클립보드에 복사했습니다. 공용 기기에서는 클립보드도 지워 주세요.');
          return;
        }
        notify('자동 복사를 허용하지 않았습니다. 표시된 값을 선택해 직접 복사해 주세요.');
      }
      setValue(result.value);
      clearTimeout(timer.current);
      timer.current = setTimeout(clear, 20000);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section className="credential">
      <div className="key-label">
        <strong>{credential.label}</strong>
        <span>{statusLabel[credential.status]}</span>
      </div>
      <p className="date">
        {credential.issuedAt && `발급 ${formatCredentialDate(credential.issuedAt, zone)} · `}
        {credential.expiresAt
          ? `${formatCredentialDate(credential.expiresAt, zone)} · ${expiryText(credential.expiresAt, zone)}`
          : '만료일 없음'}
      </p>
      <div className="key-value">
        <input
          aria-label={`${credential.label} 인증값`}
          className="secret mono"
          readOnly
          value={value || '•••• •••• •••• ••••'}
          onFocus={(e) => {
            if (value) e.target.select();
          }}
        />
        <button disabled={busy} onClick={() => (value ? clear() : void reveal())}>
          {value ? '숨김' : '보기'}
        </button>
        <button disabled={busy} onClick={() => void reveal(true)}>
          복사
        </button>
      </div>
      {value && <small className="muted">20초 뒤 또는 창을 벗어나면 숨깁니다.</small>}
      <div className="versions">
        <button
          className="text-button"
          onClick={async () => {
            clear();
            try {
              const result = await api<{
                versions: CredentialVersion[];
              }>(`/credentials/${credential.id}/versions`);
              setVersions(versions ? null : result.versions);
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          교체 기록 · 버전 {credential.version}
        </button>
        {versions && (
          <Field label="조회할 버전">
            <select
              value={selected}
              onChange={(e) => {
                clear();
                setSelected(Number(e.target.value));
              }}
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  버전 {v.version} ·{' '}
                  {new Date(v.createdAt).toLocaleString('ko-KR', { timeZone: zone })} {v.reason}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </section>
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
  notify: (s: string) => void;
  project: string;
  setProject: (id: string) => void;
  zone: string;
  initialEntryId?: string;
}) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState(initialEntryId ?? ''),
    [editing, setEditing] = useState<Entry | null | undefined>(undefined),
    [deleting, setDeleting] = useState<Entry | null>(null),
    [importing, setImporting] = useState(false),
    [sort, setSort] = useState(false),
    search = useRef<HTMLInputElement>(null),
    detailRef = useRef<HTMLElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === 'Escape') setSelected('');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const activeDate = (e: Entry) => firstExpiry(e.credentials, zone);
  const matches = (e: Entry, kind: string) => {
    const days = expiryDays(activeDate(e), new Date(), zone);
    return (
      kind === 'all' ||
      (kind === 'unset' && days === null) ||
      (kind === 'expired' && days !== null && days < 0) ||
      (kind === 'expiring' && days !== null && days >= 0 && days <= 7)
    );
  };
  const visible = searchEntries(entries, query, projects)
    .filter((e) => (!project || e.projectIds.includes(project)) && matches(e, filter))
    .sort((a, b) =>
      sort ? a.name.localeCompare(b.name, 'ko') : b.updatedAt.localeCompare(a.updatedAt),
    );
  const entry = entries.find((e) => e.id === selected);
  useEffect(() => {
    if (selected && window.innerWidth <= 1000) {
      returnFocus.current = document.activeElement as HTMLElement;
      detailRef.current?.focus();
    } else if (!selected && returnFocus.current?.isConnected) {
      returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [selected]);
  return (
    <>
      <header className="pagehead">
        <div className="page-title">
          <h1>보관함</h1>
          <span className="muted">API {entries.length}개</span>
        </div>
        <div className="actions">
          <button onClick={() => setImporting(true)}>가져오기</button>
          <button className="primary" onClick={() => setEditing(null)}>
            ＋ 추가
          </button>
        </div>
      </header>
      <div className={`content ${entry ? 'has-detail' : ''}`}>
        <section className="inventory" aria-label="보관 항목">
          <div className="filterline" aria-label="만료 상태">
            {[
              ['all', '전체'],
              ['expiring', '7일 이내'],
              ['expired', '만료됨'],
              ['unset', '만료일 없음'],
            ].map(([v, t]) => (
              <button
                className={`tab ${v === filter ? 'current' : ''}`}
                key={v}
                aria-pressed={v === filter}
                onClick={() => setFilter(v!)}
              >
                {t}
                <span>{entries.filter((e) => matches(e, v!)).length}</span>
              </button>
            ))}
          </div>
          <div className="tools">
            <label className="search">
              <input
                ref={search}
                aria-label="API 검색"
                placeholder="이름·제공사·태그 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
            </label>
            <select
              aria-label="사용 프로젝트"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">모든 프로젝트</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>API / 용도</th>
                <th className="project-column">사용 프로젝트</th>
                <th>가장 빠른 만료</th>
                <th className="key-column">키</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const date = activeDate(e),
                  days = expiryDays(date, new Date(), zone);
                return (
                  <tr
                    key={e.id}
                    className={selected === e.id ? 'selected' : ''}
                    onClick={() => setSelected(e.id)}
                  >
                    <td>
                      <button className="row-name" onClick={() => setSelected(e.id)}>
                        {e.name}
                      </button>
                      <div className="purpose">{e.description || e.provider || '용도 미등록'}</div>
                    </td>
                    <td className="project-column project-cell">
                      {projects
                        .filter((p) => e.projectIds.includes(p.id))
                        .map((p) => p.name)
                        .join(', ') || '—'}
                    </td>
                    <td
                      className={`expiry-cell ${days !== null && days < 0 ? 'expired' : days !== null && days <= 7 ? 'warning' : ''}`}
                    >
                      {expiryText(date, zone)}
                      {date && <span className="absolute">{formatCredentialDate(date, zone)}</span>}
                    </td>
                    <td className="key-column">{e.credentials.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && (
            <Empty>
              {entries.length
                ? '조건에 맞는 항목이 없습니다.'
                : '보관할 API 키를 추가하거나 .env 파일을 가져오세요.'}
            </Empty>
          )}
          <div className="tablefoot">
            <span>
              {visible.length}개 항목 · 키 {visible.reduce((n, e) => n + e.credentials.length, 0)}개
            </span>
            <button className="text-button" onClick={() => setSort(!sort)}>
              {sort ? '이름순' : '최근 수정순'} ↕
            </button>
          </div>
        </section>
        {entry && (
          <aside ref={detailRef} tabIndex={-1} className="detail" aria-label="선택한 API 상세">
            <header className="detail-header">
              <div>
                <h2>{entry.name}</h2>
                <p>{entry.description}</p>
              </div>
              <button aria-label="상세 닫기" onClick={() => setSelected('')}>
                닫기
              </button>
            </header>
            <h3 className="section-label">
              등록한 키 <span>{entry.credentials.length}개</span>
            </h3>
            {entry.credentials.map((c) => (
              <Secret key={`${c.id}-${c.version}`} credential={c} zone={zone} notify={notify} />
            ))}
            {!entry.credentials.length && <p className="muted">등록한 인증값이 없습니다.</p>}
            <dl>
              {[
                ['제공사', entry.provider],
                [
                  '사용 프로젝트',
                  projects
                    .filter((p) => entry.projectIds.includes(p.id))
                    .map((p) => p.name)
                    .join(', '),
                ],
                ['API 주소', entry.endpointUrl],
                ['소유자', entry.owner],
                ['태그', entry.tags.join(', ')],
                ['요금제 메모', entry.plan],
                ['제공사 한도 메모', entry.quota],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <div className="links">
              {[
                ['웹사이트', entry.websiteUrl],
                ['발급 콘솔', entry.consoleUrl],
                ['API 문서', entry.docsUrl],
              ]
                .filter(([, url]) => /^https?:\/\//.test(url!))
                .map(([t, url]) => (
                  <a key={t} href={url} target="_blank" rel="noreferrer noopener">
                    {t} ↗
                  </a>
                ))}
            </div>
            {entry.notes && (
              <div className="note">
                <h3>메모</h3>
                <p>{entry.notes}</p>
              </div>
            )}
            <div className="detail-actions">
              <button onClick={() => setEditing(entry)}>수정</button>
              <button className="text-button danger-text" onClick={() => setDeleting(entry)}>
                삭제
              </button>
            </div>
            <p className="modified">
              최근 수정 {new Date(entry.updatedAt).toLocaleString('ko-KR', { timeZone: zone })}
            </p>
          </aside>
        )}
      </div>
      {editing !== undefined && (
        <EntryEditor
          entry={editing ?? undefined}
          projects={projects}
          onProjects={reloadProjects}
          onClose={() => setEditing(undefined)}
          onSaved={reload}
        />
      )}{' '}
      {deleting && (
        <Confirm
          title="항목 삭제"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/entries/${deleting.id}`, 'DELETE');
            await reload();
            setDeleting(null);
            setSelected('');
            notify('항목을 삭제했습니다.');
          }}
        >
          <p>‘{deleting.name}’의 인증값과 모든 교체 기록을 삭제합니다. 되돌릴 수 없습니다.</p>
        </Confirm>
      )}
      {importing && (
        <Import
          entries={entries}
          projects={projects}
          onClose={() => setImporting(false)}
          onSaved={reload}
          notify={notify}
        />
      )}
    </>
  );
}
function Import({
  entries,
  projects,
  onClose,
  onSaved,
  notify,
}: {
  entries: Entry[];
  projects: Project[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [source, setSource] = useState(''),
    [project, setProject] = useState(''),
    [target, setTarget] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [fileError, setFileError] = useState('');
  const parsed = parseEnv(source);
  return (
    <Modal title=".env 가져오기" onClose={onClose} wide>
      <Form
        label="확인한 인증값 가져오기"
        onCancel={onClose}
        onSubmit={async () => {
          if (!confirmed || !parsed.rows.length || parsed.errors.length)
            throw Error('오류를 해결하고 미리보기를 확인해 주세요.');
          const credentials = parsed.rows.map((row) => ({
            label: row.name,
            value: row.value,
            status: 'active' as const,
            issuedAt: '',
            expiresAt: '',
          }));
          if (target) {
            const entry = entries.find((e) => e.id === target)!;
            await api('/entries/import', 'POST', {
              entries: [
                {
                  ...entry,
                  entryId: target,
                  credentials: [
                    ...entry.credentials.map((c) => ({
                      id: c.id,
                      label: c.label,
                      status: c.status,
                      issuedAt: c.issuedAt,
                      expiresAt: c.expiresAt,
                    })),
                    ...credentials,
                  ],
                },
              ],
            });
          } else
            await api('/entries/import', 'POST', {
              entries: parsed.rows.map((row) => ({
                ...emptyDraft(),
                name: row.name,
                projectIds: project ? [project] : [],
                credentials: [
                  {
                    label: row.name,
                    value: row.value,
                    status: 'active',
                    issuedAt: '',
                    expiresAt: '',
                  },
                ],
              })),
            });
          setSource('');
          await onSaved();
          onClose();
          notify('인증값을 가져왔습니다.');
        }}
      >
        <p className="muted">
          파일을 실행하거나 변수를 치환하지 않습니다. 인증값은 미리보기에 표시하지 않으며 확인 후
          저장합니다.
        </p>
        <Field label=".env 파일">
          <input
            type="file"
            accept=".env,text/plain"
            onChange={async (e) => {
              setConfirmed(false);
              setFileError('');
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1024 * 1024) {
                setFileError('1MB 이하의 파일을 선택해 주세요.');
                return;
              }
              try {
                setSource(await file.text());
              } catch {
                setFileError('파일을 읽을 수 없습니다.');
              }
            }}
          />
        </Field>
        {fileError && (
          <p className="error" role="alert">
            {fileError}
          </p>
        )}
        <Field label="또는 .env 내용 붙여넣기">
          <textarea
            rows={5}
            value={source}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setSource(e.target.value);
              setConfirmed(false);
            }}
          />
        </Field>
        <Field label="저장할 항목">
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">변수마다 새 항목 만들기</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}에 키 추가
              </option>
            ))}
          </select>
        </Field>
        {!target && (
          <Field label="연결할 프로젝트">
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">연결하지 않음</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <h3>미리보기 · {parsed.rows.length}개</h3>
        <ul className="plain-list">
          {parsed.rows.map((r) => (
            <li key={r.line}>
              {r.line}행 · {r.name} <span className="muted">인증값 {r.value.length}자</span>
            </li>
          ))}
        </ul>
        {parsed.errors.map((e, i) => (
          <p className="error" key={i} role="alert">
            {e.line}행: {e.message}
          </p>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          변수 이름과 저장할 항목을 확인했습니다.
        </label>
      </Form>
    </Modal>
  );
}
