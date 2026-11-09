import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuthState, Entry, Project, Settings, VaultNotification } from '@keydesk/contracts';
import { api, onUnauthorized, setAuth } from './api.ts';
import { Vault } from './Vault.tsx';
import { GatewayPage, UsagePage } from './Gateway.tsx';
import { SettingsPage } from './Settings.tsx';
import { Confirm, Empty, Field, Form } from './ui.tsx';
import './style.css';
function Auth({
  state,
  onState,
  notice,
}: {
  state: AuthState;
  onState: (s: AuthState) => void;
  notice: string;
}) {
  const [token, setToken] = useState(''),
    [name, setName] = useState(''),
    [password, setPassword] = useState('');
  return (
    <main className="auth">
      <div className="wordmark">keydesk</div>
      <h1>{state.initialized ? '보관함 열기' : '처음 설정'}</h1>
      <p className="muted">
        {state.initialized
          ? '소유자 비밀번호로 로그인하세요.'
          : '서버 데이터 폴더의 초기 설정 토큰을 확인하고 소유자 계정을 만드세요.'}
      </p>
      {notice && <p role="status">{notice}</p>}
      <Form
        label={state.initialized ? '로그인' : '계정 만들기'}
        onSubmit={async () => {
          const next = await api<AuthState>(
            state.initialized ? '/auth/login' : '/auth/setup',
            'POST',
            state.initialized ? { password } : { token, name, password },
          );
          setPassword('');
          setToken('');
          onState(next);
        }}
      >
        {!state.initialized && (
          <>
            <Field label="초기 설정 토큰">
              <input
                required
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
            <Field label="소유자 이름">
              <input
                required
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </>
        )}
        <Field label={state.initialized ? '비밀번호' : '비밀번호 (12자 이상)'}>
          <input
            type="password"
            required
            minLength={state.initialized ? undefined : 12}
            autoComplete={state.initialized ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </Form>
      <p className="hint">비밀번호를 잊었다면 서버에서 소유자 비밀번호 재설정 명령을 실행하세요.</p>
    </main>
  );
}
const pages = [
  ['vault', '▤', '보관함'],
  ['projects', '▱', '프로젝트'],
  ['notifications', '◷', '알림'],
  ['gateway', '⇄', '게이트웨이'],
  ['usage', '≡', '사용량·비용'],
  ['settings', '⚙', '설정'],
] as const;
function NavIcon({ id }: { id: string }) {
  const paths: Record<string, string> = {
    vault: 'M4 5h16v15H4zM4 10h16M9 14h6',
    projects: 'M3 7h7l2 2h9v11H3zM3 7V4h7l2 3',
    notifications: 'M6 9a6 6 0 0 1 12 0v7l2 2H4l2-2zM10 21h4',
    gateway: 'M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4',
    usage: 'M4 6h16M4 12h16M4 18h10',
    settings: 'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2',
    theme: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
    lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[id]} />
      {id === 'settings' && <circle cx="12" cy="12" r="5" />}
    </svg>
  );
}
function App() {
  const [auth, setAuthState] = useState<AuthState | null>(null),
    [fatal, setFatal] = useState(''),
    [entries, setEntries] = useState<Entry[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [notifications, setNotifications] = useState<VaultNotification[]>([]),
    [page, setPage] = useState('vault'),
    [project, setProject] = useState(''),
    [selectedEntry, setSelectedEntry] = useState(''),
    [notice, setNotice] = useState(''),
    [loadError, setLoadError] = useState(''),
    [loading, setLoading] = useState(false),
    [theme, setTheme] = useState(() =>
      localStorage.getItem('keydesk-theme') === 'light' ? 'light' : 'dark',
    );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    lastActivity = useRef(Date.now()),
    authGeneration = useRef(0);
  const notify = useCallback((s: string) => {
    setNotice(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(''), 7000);
  }, []);
  const changeAuth = useCallback((state: AuthState) => {
    authGeneration.current++;
    setAuth(state);
    setAuthState(state);
    lastActivity.current = Date.now();
    if (!state.authenticated) {
      setEntries([]);
      setProjects([]);
      setNotifications([]);
      setSettings(null);
      setPage('vault');
      setSelectedEntry('');
      setLoadError('');
    }
  }, []);
  const reloadEntries = useCallback(async () => {
    const gen = authGeneration.current;
    const result = await api<{
      entries: Entry[];
    }>('/entries');
    if (gen === authGeneration.current) setEntries(result.entries);
  }, []);
  const reloadProjects = useCallback(async () => {
    const gen = authGeneration.current;
    const result = await api<{
      projects: Project[];
    }>('/projects');
    if (gen === authGeneration.current) setProjects(result.projects);
  }, []);
  const reloadNotifications = useCallback(async () => {
    const gen = authGeneration.current;
    const result = await api<{
      notifications: VaultNotification[];
    }>('/notifications');
    if (gen === authGeneration.current) setNotifications(result.notifications);
  }, []);
  const reloadSettings = useCallback(async () => {
    const gen = authGeneration.current;
    const result = await api<{
      settings: Settings;
    }>('/settings');
    if (gen === authGeneration.current) setSettings(result.settings);
  }, []);
  useEffect(() => {
    onUnauthorized(() => changeAuth({ initialized: true, authenticated: false }));
    void api<AuthState>('/auth/state')
      .then(changeAuth)
      .catch((e) => setFatal(e.message));
    return () => {
      clearTimeout(timer.current);
    };
  }, [changeAuth]);
  useEffect(() => {
    if (!auth?.authenticated) return;
    setLoading(true);
    setLoadError('');
    void Promise.all([reloadEntries(), reloadProjects(), reloadNotifications(), reloadSettings()])
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [auth?.authenticated, reloadEntries, reloadProjects, reloadNotifications, reloadSettings]);
  async function lock() {
    const logout = api('/auth/logout', 'POST');
    changeAuth({ initialized: true, authenticated: false });
    try {
      await logout;
    } catch {
      notify(
        '화면을 잠갔지만 서버 로그아웃을 확인하지 못했습니다. 연결을 확인하고 다시 로그인해 주세요.',
      );
    }
  }
  useEffect(() => {
    if (!auth?.authenticated) return;
    const activity = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current >= 15 * 60 * 1000) {
        void lock();
        notify('15분 동안 조작이 없어 보관함을 잠갔습니다.');
      }
    }, 30000);
    return () => {
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      clearInterval(interval);
    };
  }, [auth?.authenticated]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('keydesk-theme', theme);
  }, [theme]);
  if (!auth)
    return (
      <main className="auth">
        <h1>Keydesk</h1>
        <p role={fatal ? 'alert' : 'status'}>{fatal || '보관함 상태를 확인하는 중…'}</p>
        {fatal && <button onClick={() => location.reload()}>다시 연결</button>}
      </main>
    );
  if (!auth.authenticated) return <Auth state={auth} onState={changeAuth} notice={notice} />;
  const zone = settings?.timeZone ?? 'Asia/Seoul';
  return (
    <div className="shell">
      <a className="skip" href="#main">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <div className="wordmark">keydesk</div>
        <nav aria-label="주요 메뉴">
          {pages.map(([id, icon, label]) => (
            <button
              key={id}
              className={`nav-button ${page === id ? 'current' : ''}`}
              title={label}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              <span className="nav-icon" aria-hidden>
                <NavIcon id={id} />
              </span>
              <span className="name">{label}</span>
              {id === 'notifications' && notifications.some((n) => !n.read) && (
                <span className="count">{notifications.filter((n) => !n.read).length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label">프로젝트별 보기</div>
        <div className="project-nav">
          {projects.map((p) => (
            <button
              key={p.id}
              className={project === p.id ? 'selected' : ''}
              onClick={() => {
                setProject(project === p.id ? '' : p.id);
                setPage('vault');
              }}
            >
              {p.name}
              <span className="count">
                {entries.filter((e) => e.projectIds.includes(p.id)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '밝은 화면' : '어두운 화면'}
          >
            <span className="nav-icon" aria-hidden>
              <NavIcon id="theme" />
            </span>
            <span className="name">{theme === 'dark' ? '밝은 화면' : '어두운 화면'}</span>
          </button>
          <button className="nav-button" onClick={() => void lock()} title="잠금·로그아웃">
            <span className="nav-icon" aria-hidden>
              <NavIcon id="lock" />
            </span>
            <span className="name">잠금·로그아웃</span>
          </button>
          <div className="owner">{auth.user?.name}</div>
        </div>
      </aside>
      <main className="main" id="main" tabIndex={-1}>
        {loadError && (
          <p className="error" role="alert">
            {loadError} <button onClick={() => location.reload()}>다시 연결</button>
          </p>
        )}
        {loading ? (
          <p role="status">보관함을 불러오는 중…</p>
        ) : page === 'vault' ? (
          <Vault
            entries={entries}
            projects={projects}
            reload={reloadEntries}
            reloadProjects={reloadProjects}
            notify={notify}
            project={project}
            setProject={setProject}
            zone={zone}
            initialEntryId={selectedEntry}
          />
        ) : page === 'projects' ? (
          <Projects
            projects={projects}
            entries={entries}
            onSaved={reloadProjects}
            notify={notify}
          />
        ) : page === 'notifications' ? (
          <Notifications
            notifications={notifications}
            onSaved={reloadNotifications}
            onEntry={(id) => {
              const entry = entries.find((e) => e.id === id);
              if (entry) {
                setProject('');
                setSelectedEntry(id);
                setPage('vault');
              }
            }}
            zone={zone}
          />
        ) : page === 'gateway' ? (
          <GatewayPage entries={entries} projects={projects} notify={notify} zone={zone} />
        ) : page === 'usage' ? (
          <UsagePage projects={projects} zone={zone} />
        ) : (
          <SettingsPage notify={notify} onAuth={changeAuth} onSaved={reloadSettings} />
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="알림 닫기" onClick={() => setNotice('')}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
function Projects({
  projects,
  entries,
  onSaved,
  notify,
}: {
  projects: Project[];
  entries: Entry[];
  onSaved: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(''),
    [deleting, setDeleting] = useState<Project | null>(null);
  return (
    <>
      <header className="pagehead">
        <h1>프로젝트</h1>
      </header>
      <div className="project-create">
        <Form
          label="프로젝트 만들기"
          onSubmit={async () => {
            await api('/projects', 'POST', { name: name.trim() });
            setName('');
            await onSaved();
            notify('프로젝트를 만들었습니다.');
          }}
        >
          <Field label="새 프로젝트 이름">
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </Form>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>이름</th>
            <th>연결된 항목</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{entries.filter((e) => e.projectIds.includes(p.id)).length}개</td>
              <td>
                <button className="danger-text" onClick={() => setDeleting(p)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!projects.length && <Empty>등록한 프로젝트가 없습니다.</Empty>}
      {deleting && (
        <Confirm
          title="프로젝트 삭제"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/projects/${deleting.id}`, 'DELETE');
            await onSaved();
            setDeleting(null);
          }}
        >
          <p>
            ‘{deleting.name}’ 프로젝트를 삭제합니다. 보관 항목이나 게이트웨이가 연결되어 있으면 먼저
            연결을 해제해야 합니다.
          </p>
        </Confirm>
      )}
    </>
  );
}
function Notifications({
  notifications,
  onSaved,
  onEntry,
  zone,
}: {
  notifications: VaultNotification[];
  onSaved: () => Promise<void>;
  onEntry: (id: string) => void;
  zone: string;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <header className="pagehead">
        <h1>만료 알림</h1>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api('/notifications/refresh', 'POST');
              await onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '확인 중…' : '만료 상태 새로 확인'}
        </button>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="notification-list">
        {notifications.map((n) => (
          <li key={n.id}>
            <div>
              <button className="row-name" onClick={() => onEntry(n.entryId)}>
                {n.title}
              </button>
              <p>{n.message}</p>
              <small className="muted">
                {new Date(n.createdAt).toLocaleString('ko-KR', { timeZone: zone })} · 메일{' '}
                {
                  (
                    {
                      unconfigured: '미설정',
                      pending: '대기',
                      sent: '발송',
                      failed: '실패',
                    } as const
                  )[n.mailStatus]
                }
              </small>
            </div>
            <button
              disabled={n.read}
              onClick={async () => {
                try {
                  await api(`/notifications/${n.id}`, 'PUT', { read: true });
                  await onSaved();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {n.read ? '읽음' : '읽음으로 표시'}
            </button>
          </li>
        ))}
      </ul>
      {!notifications.length && <Empty>확인할 만료 알림이 없습니다.</Empty>}
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
