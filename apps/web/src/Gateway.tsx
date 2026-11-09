import { useEffect, useState } from 'react';
import type {
  Entry,
  Project,
  GatewayRoute,
  GatewayRouteDraft,
  GatewayClient,
  GatewayClientDraft,
  ModelPrice,
  PriceDraft,
  UsageRecord,
  UsageSummary,
} from '@keydesk/contracts';
import { api, copyText } from './api.ts';
import { calendarDay, formatMoney, formatExactMoney, usageCost, routePayload } from './helpers.ts';
import { Confirm, Empty, Field, Form, Modal } from './ui.tsx';
export function GatewayPage({
  entries,
  projects,
  notify,
  zone,
}: {
  entries: Entry[];
  projects: Project[];
  notify: (s: string) => void;
  zone: string;
}) {
  const [routes, setRoutes] = useState<GatewayRoute[]>([]),
    [clients, setClients] = useState<GatewayClient[]>([]),
    [prices, setPrices] = useState<ModelPrice[]>([]),
    [tab, setTab] = useState('routes'),
    [route, setRoute] = useState<GatewayRoute | null | undefined>(),
    [client, setClient] = useState<GatewayClient | null | undefined>(),
    [price, setPrice] = useState(false),
    [token, setToken] = useState(''),
    [deleting, setDeleting] = useState<GatewayRoute | null>(null),
    [revoking, setRevoking] = useState<GatewayClient | null>(null),
    [error, setError] = useState('');
  async function reload() {
    const results = await Promise.all([
      api<{
        routes: GatewayRoute[];
      }>('/gateway/routes'),
      api<{
        clients: GatewayClient[];
      }>('/gateway/clients'),
      api<{
        prices: ModelPrice[];
      }>('/gateway/prices'),
    ]);
    setRoutes(results[0].routes);
    setClients(results[1].clients);
    setPrices(results[2].prices);
  }
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!token) return;
    const timeout = setTimeout(() => setToken(''), 60000),
      hide = () => {
        if (document.hidden) setToken('');
      };
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [token]);
  return (
    <>
      <header className="pagehead">
        <h1>게이트웨이</h1>
        <button
          className="primary"
          onClick={() =>
            tab === 'routes' ? setRoute(null) : tab === 'clients' ? setClient(null) : setPrice(true)
          }
        >
          {tab === 'routes'
            ? '경로 추가'
            : tab === 'clients'
              ? '클라이언트 키 발급'
              : '모델 단가 추가'}
        </button>
      </header>
      <div className="filterline">
        {[
          ['routes', '중계 경로'],
          ['clients', '클라이언트 키'],
          ['prices', '모델 단가'],
        ].map(([v, t]) => (
          <button
            key={v}
            className={`tab ${tab === v ? 'current' : ''}`}
            onClick={() => setTab(v!)}
          >
            {t}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {tab === 'routes' && (
        <>
          <p className="muted">
            프로젝트가 /gw/별칭/아래경로로 호출하면 선택한 보관 인증값을 주입합니다.
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>이름 / 중계 경로</th>
                  <th>프로젝트</th>
                  <th>목적지</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.name}
                      <div className="purpose mono">/gw/{r.slug}/</div>
                    </td>
                    <td>{projects.find((p) => p.id === r.projectId)?.name}</td>
                    <td className="break">
                      {r.baseUrl}
                      <div className="purpose">
                        {r.allowedMethods.join(', ')} ·{' '}
                        {r.adapter === 'generic'
                          ? `${r.authHeader ?? 'Authorization'} / ${r.authScheme === 'raw' ? '키 값 그대로' : 'Bearer'}`
                          : r.adapter}
                      </div>
                    </td>
                    <td>{r.enabled ? '사용 중' : '중지'}</td>
                    <td>
                      <div className="actions">
                        <button onClick={() => setRoute(r)}>수정</button>
                        <button className="danger-text" onClick={() => setDeleting(r)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!routes.length && (
            <Empty>먼저 보관함에 인증값과 프로젝트를 등록한 뒤 중계 경로를 추가하세요.</Empty>
          )}
        </>
      )}
      {tab === 'clients' && (
        <>
          <p className="muted">
            발급한 토큰은 한 번만 표시됩니다. 일일 호출 수는 전송 전 제한하며 토큰·비용은 사용량
            알림 기준입니다.
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>이름 / 식별 접두사</th>
                  <th>프로젝트 · 허용 경로</th>
                  <th>한도와 만료</th>
                  <th>마지막 사용</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      <div className="purpose mono">{c.prefix}…</div>
                    </td>
                    <td>
                      {projects.find((p) => p.id === c.projectId)?.name}
                      <div className="purpose">
                        {routes
                          .filter((r) => c.routeIds.includes(r.id))
                          .map((r) => r.name)
                          .join(', ')}
                      </div>
                    </td>
                    <td>
                      호출 {c.dailyRequestLimit ?? '제한 없음'}/일
                      <div className="purpose">
                        {c.expiresAt || '만료일 없음'} · {c.revoked ? '폐기' : '사용 중'}
                      </div>
                    </td>
                    <td>
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toLocaleString('ko-KR', { timeZone: zone })
                        : '아직 없음'}
                    </td>
                    <td>
                      <div className="actions">
                        <button disabled={c.revoked} onClick={() => setClient(c)}>
                          한도 수정
                        </button>
                        <button
                          className="danger-text"
                          disabled={c.revoked}
                          onClick={() => setRevoking(c)}
                        >
                          폐기
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!clients.length && <Empty>발급한 클라이언트 키가 없습니다.</Empty>}
        </>
      )}
      {tab === 'prices' && (
        <>
          <p className="muted">
            100만 토큰당 원래 통화의 단가를 입력합니다. 호출 당시 단가를 보존하며 제공사 청구액과
            차이가 날 수 있습니다.
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>제공사 / 모델</th>
                  <th>통화</th>
                  <th>입력</th>
                  <th>출력</th>
                  <th>캐시 입력</th>
                  <th>적용 시작</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.adapter} / {p.model}
                    </td>
                    <td>{p.currency}</td>
                    <td>{p.inputPerMillion}</td>
                    <td>{p.outputPerMillion}</td>
                    <td>{p.cachedInputPerMillion}</td>
                    <td>{new Date(p.startsAt).toLocaleString('ko-KR', { timeZone: zone })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!prices.length && <Empty>등록한 모델 단가가 없습니다.</Empty>}
        </>
      )}
      {route !== undefined && (
        <RouteEditor
          route={route ?? undefined}
          projects={projects}
          entries={entries}
          onClose={() => setRoute(undefined)}
          onSaved={reload}
        />
      )}
      {client !== undefined && (
        <ClientEditor
          client={client ?? undefined}
          routes={routes}
          projects={projects}
          onClose={() => setClient(undefined)}
          onSaved={async (t) => {
            await reload();
            if (t) setToken(t);
          }}
        />
      )}
      {price && <PriceEditor onClose={() => setPrice(false)} onSaved={reload} />}
      {token && (
        <Modal title="클라이언트 토큰 · 지금만 표시" onClose={() => setToken('')}>
          <p>
            전체 값은 다시 조회할 수 없습니다. 안전한 위치에 저장하세요. 60초 후 또는 탭을 벗어나면
            지웁니다.
          </p>
          <Field label="발급한 토큰">
            <textarea
              className="mono"
              rows={3}
              readOnly
              value={token}
              onFocus={(e) => e.target.select()}
            />
          </Field>
          <div className="actions">
            <button
              onClick={async () =>
                notify(
                  (await copyText(token))
                    ? '토큰을 복사했습니다.'
                    : '복사를 허용하지 않았습니다. 값을 선택해 직접 복사해 주세요.',
                )
              }
            >
              복사
            </button>
            <button className="primary" onClick={() => setToken('')}>
              저장했고 닫기
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Confirm
          title="중계 경로 삭제"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/gateway/routes/${deleting.id}`, 'DELETE');
            await reload();
            setDeleting(null);
          }}
        >
          <p>‘{deleting.name}’ 중계 경로를 삭제합니다.</p>
        </Confirm>
      )}
      {revoking && (
        <Confirm
          title="클라이언트 키 폐기"
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            await api(`/gateway/clients/${revoking.id}`, 'PUT', { revoked: true });
            await reload();
            setRevoking(null);
          }}
        >
          <p>
            ‘{revoking.name}’의 이후 호출을 차단합니다. 다시 사용하려면 새 키를 발급해야 합니다.
          </p>
        </Confirm>
      )}
    </>
  );
}
function RouteEditor({
  route,
  projects,
  entries,
  onClose,
  onSaved,
}: {
  route?: GatewayRoute;
  projects: Project[];
  entries: Entry[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<GatewayRouteDraft>(
    route ?? {
      name: '',
      slug: '',
      projectId: '',
      credentialId: '',
      baseUrl: '',
      allowedMethods: ['POST'],
      adapter: 'generic',
      enabled: true,
      allowPrivateNetwork: false,
      authHeader: 'Authorization',
      authScheme: 'bearer',
    },
  );
  const set = (key: keyof GatewayRouteDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Modal title={route ? '중계 경로 수정' : '중계 경로 추가'} onClose={onClose} wide>
      <Form
        onCancel={onClose}
        onSubmit={async () => {
          if (!draft.allowedMethods.length) throw Error('허용할 메서드를 선택해 주세요.');
          await api(
            route ? `/gateway/routes/${route.id}` : '/gateway/routes',
            route ? 'PUT' : 'POST',
            routePayload(draft),
          );
          await onSaved();
          onClose();
        }}
      >
        <div className="form-grid">
          <Field label="경로 이름">
            <input required value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="별칭 (/gw/별칭/)" hint="영문 소문자, 숫자, 하이픈">
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={draft.slug}
              onChange={(e) => set('slug', e.target.value)}
            />
          </Field>
          <Field label="프로젝트">
            <select
              required
              value={draft.projectId}
              onChange={(e) => {
                set('projectId', e.target.value);
                set('credentialId', '');
              }}
            >
              <option value="">선택</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="주입할 인증값">
            <select
              required
              value={draft.credentialId}
              onChange={(e) => set('credentialId', e.target.value)}
            >
              <option value="">선택</option>
              {entries
                .filter((e) => e.projectIds.includes(draft.projectId))
                .flatMap((e) =>
                  e.credentials
                    .filter((c) => c.status === 'active')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {e.name} · {c.label}
                      </option>
                    )),
                )}
            </select>
          </Field>
        </div>
        <Field label="목적지 기본 주소">
          <input
            required
            type="url"
            placeholder="https://api.example.com/v1"
            value={draft.baseUrl}
            onChange={(e) => set('baseUrl', e.target.value)}
          />
        </Field>
        <Field label="사용량 해석기">
          <select value={draft.adapter} onChange={(e) => set('adapter', e.target.value)}>
            <option value="generic">일반 REST (토큰 미확인)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </Field>
        {draft.adapter === 'generic' && (
          <div className="form-grid">
            <Field
              label="인증 헤더"
              hint="예: Authorization 또는 X-API-Key. 쿠키·전송 제어 헤더는 사용할 수 없습니다."
            >
              <input
                required
                maxLength={64}
                value={draft.authHeader ?? 'Authorization'}
                onChange={(e) => set('authHeader', e.target.value)}
              />
            </Field>
            <Field label="인증값 형식">
              <select
                value={draft.authScheme ?? 'bearer'}
                onChange={(e) => set('authScheme', e.target.value)}
              >
                <option value="bearer">Bearer 접두어</option>
                <option value="raw">키 값 그대로</option>
              </select>
            </Field>
          </div>
        )}
        <div className="field">
          <span>허용할 메서드</span>
          <div className="checkboxes">
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
              <label key={m}>
                <input
                  type="checkbox"
                  checked={draft.allowedMethods.includes(m)}
                  onChange={(e) =>
                    set(
                      'allowedMethods',
                      e.target.checked
                        ? [...draft.allowedMethods, m]
                        : draft.allowedMethods.filter((x) => x !== m),
                    )
                  }
                />
                {m}
              </label>
            ))}
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          경로 사용
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.allowPrivateNetwork}
            onChange={(e) => set('allowPrivateNetwork', e.target.checked)}
          />
          이 목적지의 사설 네트워크 연결을 명시적으로 허용
        </label>
        <p className="muted">사설 연결 허용은 신뢰하는 내부 제공사에만 사용하세요.</p>
      </Form>
    </Modal>
  );
}
function ClientEditor({
  client,
  projects,
  routes,
  onClose,
  onSaved,
}: {
  client?: GatewayClient;
  projects: Project[];
  routes: GatewayRoute[];
  onClose: () => void;
  onSaved: (token?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<GatewayClientDraft>(
    client ?? {
      name: '',
      projectId: '',
      routeIds: [],
      expiresAt: '',
      dailyRequestLimit: null,
      dailyTokenAlert: null,
      dailyCostAlertMicros: null,
    },
  );
  const set = (key: keyof GatewayClientDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Modal title={client ? '클라이언트 한도 수정' : '클라이언트 키 발급'} onClose={onClose}>
      <Form
        label={client ? '저장' : '발급'}
        onCancel={onClose}
        onSubmit={async () => {
          if (client) {
            await api(`/gateway/clients/${client.id}`, 'PUT', {
              dailyRequestLimit: draft.dailyRequestLimit,
              dailyTokenAlert: draft.dailyTokenAlert,
              dailyCostAlertMicros: draft.dailyCostAlertMicros,
            });
            await onSaved();
          } else {
            if (!draft.routeIds.length) throw Error('허용할 경로를 선택해 주세요.');
            const result = await api<{
              token: string;
            }>('/gateway/clients', 'POST', draft);
            await onSaved(result.token);
          }
          onClose();
        }}
      >
        {!client && (
          <>
            <Field label="클라이언트 이름">
              <input required value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="프로젝트">
              <select
                required
                value={draft.projectId}
                onChange={(e) => {
                  set('projectId', e.target.value);
                  set('routeIds', []);
                }}
              >
                <option value="">선택</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span>허용할 중계 경로</span>
              {routes
                .filter((r) => r.projectId === draft.projectId)
                .map((r) => (
                  <label className="check" key={r.id}>
                    <input
                      type="checkbox"
                      checked={draft.routeIds.includes(r.id)}
                      onChange={(e) =>
                        set(
                          'routeIds',
                          e.target.checked
                            ? [...draft.routeIds, r.id]
                            : draft.routeIds.filter((id) => id !== r.id),
                        )
                      }
                    />
                    {r.name}
                  </label>
                ))}
            </div>
            <Field label="만료일 (선택)">
              <input
                type="date"
                value={draft.expiresAt}
                onChange={(e) => set('expiresAt', e.target.value)}
              />
            </Field>
          </>
        )}
        {(
          [
            ['dailyRequestLimit', '일일 호출 수 제한'],
            ['dailyTokenAlert', '일일 토큰 알림 기준'],
            ['dailyCostAlertMicros', '일일 비용 알림 기준 (통화별)'],
          ] as const
        ).map(([k, label]) => (
          <Field
            key={k}
            label={label}
            hint={
              k === 'dailyCostAlertMicros'
                ? '통화별로 따로 계산합니다. 1은 USD 1달러 또는 KRW 1원입니다. 비워 두면 설정하지 않습니다.'
                : '비워 두면 설정하지 않습니다.'
            }
          >
            <input
              type="number"
              min={k === 'dailyCostAlertMicros' ? 0.000001 : 0}
              step={k === 'dailyCostAlertMicros' ? 0.000001 : 1}
              value={
                draft[k] === null
                  ? ''
                  : k === 'dailyCostAlertMicros'
                    ? draft[k]! / 1000000
                    : draft[k]!
              }
              onChange={(e) =>
                set(
                  k,
                  e.target.value === ''
                    ? null
                    : k === 'dailyCostAlertMicros'
                      ? Math.round(Number(e.target.value) * 1000000)
                      : Number(e.target.value),
                )
              }
            />
          </Field>
        ))}
        <p className="muted">토큰·비용 알림은 호출 차단을 보장하는 강제 상한이 아닙니다.</p>
      </Form>
    </Modal>
  );
}
function PriceEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<PriceDraft>({
    adapter: 'openai',
    model: '',
    currency: 'USD',
    inputPerMillion: '0',
    outputPerMillion: '0',
    cachedInputPerMillion: '0',
    startsAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  });
  const set = (key: keyof PriceDraft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Modal title="모델 단가 추가" onClose={onClose}>
      <Form
        onCancel={onClose}
        onSubmit={async () => {
          await api('/gateway/prices', 'POST', {
            ...draft,
            startsAt: new Date(draft.startsAt).toISOString(),
          });
          await onSaved();
          onClose();
        }}
      >
        <Field label="해석기">
          <select value={draft.adapter} onChange={(e) => set('adapter', e.target.value)}>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="generic">일반 REST</option>
          </select>
        </Field>
        <Field label="모델 식별자">
          <input required value={draft.model} onChange={(e) => set('model', e.target.value)} />
        </Field>
        <Field label="통화 코드">
          <input
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            value={draft.currency}
            onChange={(e) => set('currency', e.target.value.toUpperCase())}
          />
        </Field>
        {(
          [
            ['inputPerMillion', '100만 입력 토큰당'],
            ['outputPerMillion', '100만 출력 토큰당'],
            ['cachedInputPerMillion', '100만 캐시 입력 토큰당'],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <input
              required
              inputMode="decimal"
              pattern="[0-9]+(\.[0-9]+)?"
              value={draft[k]}
              onChange={(e) => set(k, e.target.value)}
            />
          </Field>
        ))}
        <Field label="적용 시작 시각 (이 기기의 시간)">
          <input
            required
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => set('startsAt', e.target.value)}
          />
        </Field>
      </Form>
    </Modal>
  );
}
export function UsagePage({ projects, zone }: { projects: Project[]; zone: string }) {
  const [days, setDays] = useState('7'),
    [project, setProject] = useState(''),
    [data, setData] = useState<{
      records: UsageRecord[];
      summary: UsageSummary;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    setData(null);
    void api<{
      records: UsageRecord[];
      summary: UsageSummary;
    }>(`/usage?days=${encodeURIComponent(days)}&projectId=${encodeURIComponent(project)}`)
      .then((x) => {
        if (active) setData(x);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [days, project]);
  return (
    <>
      <header className="pagehead">
        <h1>사용량과 비용</h1>
      </header>
      <p className="muted">
        게이트웨이를 통과해 제공사로 전송한 호출만 측정합니다. 제공사 계정의 전체 사용량이나 잔액을
        나타내지 않습니다.
      </p>
      <div className="tools">
        <select
          aria-label="사용량 프로젝트"
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
        <select aria-label="집계 기간" value={days} onChange={(e) => setDays(e.target.value)}>
          {[1, 7, 30, 90].map((n) => (
            <option key={n} value={n}>
              최근 {n}일
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data ? (
        <>
          <dl className="usage-summary">
            <div>
              <dt>전송한 호출</dt>
              <dd>{data.summary.requests.toLocaleString('ko-KR')}회</dd>
            </div>
            <div>
              <dt>확인한 입력 / 출력 토큰</dt>
              <dd>
                {data.summary.inputTokens.toLocaleString('ko-KR')} /{' '}
                {data.summary.outputTokens.toLocaleString('ko-KR')}
              </dd>
            </div>
            <div>
              <dt>토큰 사용량 미확인</dt>
              <dd>{data.summary.unknownUsageCount}회</dd>
            </div>
            {data.summary.costs.map((c) => (
              <div key={c.currency}>
                <dt>{c.currency} 추정 비용</dt>
                <dd>
                  {c.overflow ? '표시 범위 초과 · ' : ''}
                  {formatExactMoney(c.amountExactMicros, c.currency)}
                  {c.krwEstimate !== undefined && c.krwEstimate !== null && (
                    <small>
                      {' '}
                      · 약 {c.krwEstimate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원
                      (설정 환율 추정)
                    </small>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            아래에는 최근 1,000개까지 표시합니다. 토큰 사용량과 비용의 미확인은 각각 구분합니다.
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>시각 / 프로젝트</th>
                  <th>모델</th>
                  <th>결과</th>
                  <th>입력 / 출력 / 캐시 토큰</th>
                  <th>비용 추정</th>
                  <th>응답 시간</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: zone })}
                      <div className="purpose">
                        {projects.find((p) => p.id === r.projectId)?.name}
                      </div>
                    </td>
                    <td>
                      {r.model ?? '미확인'}
                      <div className="purpose">{r.usageSource}</div>
                    </td>
                    <td>
                      {r.outcome === 'success'
                        ? '성공'
                        : r.outcome === 'cancelled'
                          ? '취소'
                          : '오류'}{' '}
                      {r.statusCode ?? ''}
                    </td>
                    <td>
                      {r.inputTokens ?? '미확인'} / {r.outputTokens ?? '미확인'} /{' '}
                      {r.cachedInputTokens ?? '미확인'}
                    </td>
                    <td>{usageCost(r)}</td>
                    <td>{r.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.records.length && <Empty>선택한 기간의 호출 기록이 없습니다.</Empty>}
        </>
      ) : (
        !error && <p role="status">사용량을 불러오는 중…</p>
      )}
    </>
  );
}
