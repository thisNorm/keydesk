import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuthState, Entry, Project, Settings, VaultNotification } from '@keydesk/contracts';
import { api, onUnauthorized, setAuth } from './api.ts';
import { Vault } from './Vault.tsx';
import { hideRevealedSecrets } from './Secret.tsx';
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
type ThemeMode = 'system' | 'light' | 'dark';
function initialTheme(): ThemeMode {
  try { const value = localStorage.getItem('keydesk-theme'); return value === 'light' || value === 'dark' ? value : 'system'; }
  catch { return 'system'; }
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
    [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    lastActivity = useRef(Date.now()),
    serverMenu = useRef<HTMLDetailsElement>(null),
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
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    apply();
    try { localStorage.setItem('keydesk-theme', theme); } catch { /* 현재 화면 설정은 저장소 없이도 적용한다. */ }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  function navigate(next: string, options?: { projectId?: string; entryId?: string }) {
    if (next === page && !options) { if (serverMenu.current) serverMenu.current.open = false; return; }
    const commit = () => {
      hideRevealedSecrets();
      setSelectedEntry(options?.entryId ?? '');
      if (options?.projectId !== undefined) setProject(options.projectId);
      setPage(next);
      if (serverMenu.current) serverMenu.current.open = false;
    };
    const event = new CustomEvent('keydesk:before-navigate', { cancelable: true, detail: { resume: commit } });
    if (window.dispatchEvent(event)) commit();
  }

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
      <a className="skip" href="#main">본문으로 건너뛰기</a>
      <header className="app-header">
        <button className="wordmark" onClick={() => navigate('vault')} aria-label="Keydesk 보관함">keydesk</button>
        <nav className="main-nav" aria-label="주요 메뉴">
          <button aria-current={page === 'vault' ? 'page' : undefined} onClick={() => navigate('vault')}>보관함</button>
          <button aria-current={page === 'projects' ? 'page' : undefined} onClick={() => navigate('projects')}>프로젝트</button>
          <button aria-label="알림" aria-current={page === 'notifications' ? 'page' : undefined} onClick={() => navigate('notifications')}>알림{notifications.some(n => !n.read) && <small aria-hidden="true">{notifications.filter(n => !n.read).length}</small>}</button>
          <details className="nav-menu" ref={serverMenu}><summary className={page === 'gateway' || page === 'usage' ? 'current' : ''}>서버</summary><div className="nav-menu-items"><button aria-current={page === 'gateway' ? 'page' : undefined} onClick={() => navigate('gateway')}>게이트웨이</button><button aria-current={page === 'usage' ? 'page' : undefined} onClick={() => navigate('usage')}>사용량·비용</button></div></details>
        </nav>
        <div className="account-nav"><span className="owner">{auth.user?.name}</span><button aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>설정</button><button aria-label="잠금·로그아웃" onClick={() => void lock()}>잠금</button></div>
      </header>
      <main className="main" id="main" tabIndex={-1}>
        {loadError && <p className="error" role="alert">{loadError} <button onClick={() => location.reload()}>다시 연결</button></p>}
        {loading ? <p role="status">보관함을 불러오는 중…</p> : page === 'vault' ? <Vault entries={entries} projects={projects} reload={reloadEntries} reloadProjects={reloadProjects} notify={notify} project={project} setProject={setProject} zone={zone} initialEntryId={selectedEntry} /> : page === 'projects' ? <Projects projects={projects} entries={entries} onSaved={reloadProjects} notify={notify} onViewProject={id => navigate('vault', { projectId: id, entryId: entries.find(entry => entry.projectIds.includes(id))?.id })} /> : page === 'notifications' ? <Notifications notifications={notifications} onSaved={reloadNotifications} onEntry={id => { if (entries.some(entry => entry.id === id)) navigate('vault', { projectId: '', entryId: id }); }} zone={zone} /> : page === 'gateway' ? <GatewayPage entries={entries} projects={projects} notify={notify} zone={zone} /> : page === 'usage' ? <UsagePage projects={projects} zone={zone} /> : <SettingsPage notify={notify} onAuth={changeAuth} onSaved={reloadSettings} theme={theme} onThemeChange={setTheme} />}
        <footer className="app-footer"><span>keydesk / 개인 API 키 보관함</span><span>{zone === 'Asia/Seoul' ? '한국 시간 · Asia/Seoul' : zone}</span></footer>
      </main>
      {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="알림 닫기" onClick={() => setNotice('')}>닫기</button></div>}
    </div>
  );
}

function Projects({
  projects,
  entries,
  onSaved,
  notify,
  onViewProject,
}: {
  projects: Project[];
  entries: Entry[];
  onSaved: () => Promise<void>;
  notify: (s: string) => void;
  onViewProject: (id: string) => void;
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
              <td><button type="button" className="text-button" onClick={() => onViewProject(p.id)}>{entries.filter((e) => e.projectIds.includes(p.id)).length}개 보기</button></td>
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
