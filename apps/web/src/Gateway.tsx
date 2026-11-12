import { useEffect, useId, useState } from 'react';
import type {
  Entry,
  Project,
  GatewayRoute,
  GatewayRouteDraft,
  GatewayAuthBinding,
  GatewayClient,
  GatewayClientDraft,
  ModelPrice,
  PriceDraft,
} from '@keydesk/contracts';
import { api, copyText } from './api.ts';
import { calendarDay, formatMoney, routePayload } from './helpers.ts';
import { Confirm, Empty, Field, Form, Modal } from './ui.tsx';
import { RouteMailBudget } from './RouteMailBudget.tsx';
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
    [loadError, setLoadError] = useState(''),
    [actionError, setActionError] = useState(''),
    [loading, setLoading] = useState(true);
  const id = useId(),
    now = new Date(),
    today = calendarDay(now, zone),
    tabs = [
      ['routes', '중계 경로'],
      ['clients', '클라이언트 키'],
      ['prices', '모델 단가'],
    ] as const;
  async function reload() {
    setLoading(true);
    setLoadError('');
    try {
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
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '게이트웨이를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
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
          disabled={loading || Boolean(loadError)}
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
      <div className="filterline" role="tablist" aria-label="게이트웨이 항목">
        {tabs.map(([v, t], index) => (
          <button
            key={v}
            type="button"
            id={`${id}-tab-${v}`}
            role="tab"
            aria-selected={tab === v}
            aria-controls={`${id}-panel-${v}`}
            tabIndex={tab === v ? 0 : -1}
            className={`tab ${tab === v ? 'current' : ''}`}
            onClick={() => setTab(v)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              let next: number;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              const nextTab = tabs[next][0];
              setTab(nextTab);
              document.getElementById(`${id}-tab-${nextTab}`)?.focus();
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <section
        id={`${id}-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
        aria-busy={loading}
        tabIndex={0}
      >
        {loading && <p role="status">게이트웨이를 불러오는 중…</p>}
        {loadError && (
          <>
            <p className="error" role="alert">
              게이트웨이 목록을 불러오지 못했습니다. {loadError}
            </p>
            <button type="button" disabled={loading} onClick={() => void reload()}>
              다시 불러오기
            </button>
          </>
        )}
        {!loading && !loadError && tab === 'routes' && (
          <>
            <p className="muted">
              프로젝트가 /gw/별칭/아래경로로 호출하면 선택한 보관 인증값을 주입합니다.
            </p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="중계 경로 목록">
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
                            ? r.authBindings
                              ? r.authBindings
                                  .map(
                                    (binding) =>
                                      `${binding.location === 'query' ? '쿼리' : '헤더'} ${binding.name}`,
                                  )
                                  .join(' · ')
                              : `${r.authHeader ?? 'Authorization'} / ${r.authScheme === 'raw' ? '키 값 그대로' : 'Bearer'}`
                            : r.adapter}
                        </div>
                      </td>
                      <td>{r.enabled ? '사용 중' : '중지'}</td>
                      <td>
                        <div className="actions">
                          <button
                            aria-label={`${r.name} 중계 경로 수정`}
                            onClick={() => setRoute(r)}
                          >
                            수정
                          </button>
                          <button
                            className="danger-text"
                            aria-label={`${r.name} 중계 경로 삭제`}
                            onClick={() => {
                              setActionError('');
                              setDeleting(r);
                            }}
                          >
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
        {!loading && !loadError && tab === 'clients' && (
          <>
            <p className="muted">
              발급한 토큰은 한 번만 표시됩니다. 일일 호출 수는 전송 전 제한하며 토큰·비용은 사용량
              알림 기준입니다.
            </p>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="클라이언트 키 목록"
            >
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
                          {c.expiresAt || '만료일 없음'} ·{' '}
                          {c.revoked
                            ? '폐기'
                            : c.expiresAt !== '' &&
                                (c.expiresAt.length === 10
                                  ? c.expiresAt < today
                                  : Date.parse(c.expiresAt) <= now.getTime())
                              ? '만료됨'
                              : '사용 중'}
                        </div>
                      </td>
                      <td>
                        {c.lastUsedAt
                          ? new Date(c.lastUsedAt).toLocaleString('ko-KR', { timeZone: zone })
                          : '아직 없음'}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            aria-label={`${c.name} 클라이언트 한도 수정`}
                            disabled={c.revoked}
                            onClick={() => setClient(c)}
                          >
                            한도 수정
                          </button>
                          <button
                            className="danger-text"
                            aria-label={`${c.name} 클라이언트 키 폐기`}
                            disabled={c.revoked}
                            onClick={() => {
                              setActionError('');
                              setRevoking(c);
                            }}
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
        {!loading && !loadError && tab === 'prices' && (
          <>
            <p className="muted">
              100만 토큰당 원래 통화의 단가를 입력합니다. 호출 당시 단가를 보존하며 제공사 청구액과
              차이가 날 수 있습니다.
            </p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="모델 단가 목록">
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
      </section>
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
            if (t) {
              setToken(t);
              setClient(undefined);
            }
            await reload();
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
          confirmLabel="중계 경로 삭제"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setActionError('');
            try {
              await api(`/gateway/routes/${deleting.id}`, 'DELETE');
            } catch (error) {
              setActionError(
                error instanceof Error && error.message
                  ? error.message
                  : '중계 경로를 삭제하지 못했습니다.',
              );
              return;
            }
            await reload();
            setDeleting(null);
          }}
        >
          <p>‘{deleting.name}’ 중계 경로를 삭제합니다.</p>
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}
        </Confirm>
      )}
      {revoking && (
        <Confirm
          title="클라이언트 키 폐기"
          confirmLabel="클라이언트 키 폐기"
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            setActionError('');
            try {
              await api(`/gateway/clients/${revoking.id}`, 'PUT', { revoked: true });
            } catch (error) {
              setActionError(
                error instanceof Error && error.message
                  ? error.message
                  : '클라이언트 키를 폐기하지 못했습니다.',
              );
              return;
            }
            await reload();
            setRevoking(null);
          }}
        >
          <p>
            ‘{revoking.name}’의 이후 호출을 차단합니다. 다시 사용하려면 새 키를 발급해야 합니다.
          </p>
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}
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
  const [saving, setSaving] = useState(false);
  const credentials = entries
    .filter((entry) => entry.projectIds.includes(draft.projectId))
    .flatMap((entry) =>
      entry.credentials
        .filter((credential) => credential.status === 'active')
        .map((credential) => ({ id: credential.id, label: `${entry.name} · ${credential.label}` })),
    );
  const set = (key: keyof GatewayRouteDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const rules = draft.operationRules ?? [];
  const setBindings = (bindings: GatewayAuthBinding[]) =>
    setDraft((d) => {
      const { authHeader, authScheme, ...base } = d;
      return { ...base, authBindings: bindings, credentialId: bindings[0].credentialId };
    });
  const updateBinding = (index: number, change: Partial<GatewayAuthBinding>) =>
    setBindings(
      draft.authBindings!.map((binding, position) =>
        position === index ? { ...binding, ...change } : binding,
      ),
    );
  return (
    <Modal
      title={route ? '중계 경로 수정' : '중계 경로 추가'}
      onClose={onClose}
      closeDisabled={saving}
      wide
    >
      <Form
        onCancel={onClose}
        submitDisabled={
          !draft.projectId ||
          !credentials.some((credential) => credential.id === draft.credentialId) ||
          !!draft.authBindings?.some(
            (binding) =>
              !binding.name ||
              !credentials.some((credential) => credential.id === binding.credentialId),
          ) ||
          (draft.adapter === 'generic' &&
            rules.some((rule) => !draft.allowedMethods.includes(rule.method))) ||
          !draft.allowedMethods.length
        }
        onSubmit={async () => {
          if (!draft.allowedMethods.length) throw Error('허용할 메서드를 선택해 주세요.');
          setSaving(true);
          try {
            await api(
              route ? `/gateway/routes/${route.id}` : '/gateway/routes',
              route ? 'PUT' : 'POST',
              routePayload(draft),
            );
            await onSaved();
            onClose();
          } finally {
            setSaving(false);
          }
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
          <Field
            label="프로젝트"
            hint={!projects.length ? '프로젝트 메뉴에서 프로젝트를 먼저 만드세요.' : undefined}
          >
            <select
              required
              disabled={!projects.length}
              value={draft.projectId}
              onChange={(e) => {
                set('projectId', e.target.value);
                set('credentialId', '');
                set('authBindings', undefined);
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
          {!(draft.adapter === 'generic' && draft.authBindings) && (
            <Field
              label="주입할 인증값"
              hint={
                !draft.projectId
                  ? '프로젝트를 먼저 선택해 주세요.'
                  : !credentials.length
                    ? '선택한 프로젝트에 사용 중인 인증값이 없습니다. 보관함에서 인증값을 등록하고 프로젝트에 연결해 주세요.'
                    : undefined
              }
            >
              <select
                required
                disabled={!draft.projectId || !credentials.length}
                value={draft.credentialId}
                onChange={(e) => set('credentialId', e.target.value)}
              >
                <option value="">선택</option>
                {credentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
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
          <select
            value={draft.adapter}
            onChange={(e) => {
              set('adapter', e.target.value);
              set('authBindings', undefined);
              set('detectJsonError', undefined);
            }}
          >
            <option value="generic">일반 REST (토큰 미확인)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini (네이티브 API)</option>
          </select>
        </Field>
        {draft.adapter === 'generic' && !draft.authBindings && (
          <>
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
            <button
              type="button"
              disabled={!draft.credentialId}
              onClick={() =>
                setBindings([
                  {
                    credentialId: draft.credentialId,
                    location: 'header',
                    name: draft.authHeader ?? 'Authorization',
                    ...(draft.authScheme === 'raw' ? {} : { prefix: 'Bearer' }),
                  },
                ])
              }
            >
              여러 인증 헤더·쿼리 설정
            </button>
          </>
        )}
        {draft.adapter === 'generic' && draft.authBindings && (
          <div role="group" aria-label="제공사 인증 필드">
            <h3>제공사 인증 필드</h3>
            <p className="hint">
              보관함의 인증값을 제공사 요청에 추가합니다. 첫 번째 인증값을 사용량 기록에 표시합니다.
            </p>
            {draft.authBindings.map((binding, index) => (
              <div key={index}>
                <div className="form-grid">
                  <Field label={`인증값 ${index + 1}`}>
                    <select
                      required
                      value={binding.credentialId}
                      onChange={(e) => updateBinding(index, { credentialId: e.target.value })}
                    >
                      <option value="">선택</option>
                      {credentials.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {credential.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`전달 위치 ${index + 1}`}>
                    <select
                      value={binding.location}
                      onChange={(e) =>
                        updateBinding(index, {
                          location: e.target.value as GatewayAuthBinding['location'],
                          prefix: undefined,
                        })
                      }
                    >
                      <option value="header">헤더</option>
                      <option value="query">쿼리 파라미터</option>
                    </select>
                  </Field>
                  <Field
                    label={`필드 이름 ${index + 1}`}
                    hint={
                      binding.location === 'query'
                        ? '예: apiKey, serviceKey'
                        : '예: Authorization, X-API-Key'
                    }
                  >
                    <input
                      required
                      maxLength={64}
                      value={binding.name}
                      onChange={(e) => updateBinding(index, { name: e.target.value })}
                    />
                  </Field>
                  {binding.location === 'header' && (
                    <Field
                      label={`접두어 ${index + 1}`}
                      hint="예: Bearer, KakaoAK. 키 값만 보내려면 비워두세요."
                    >
                      <input
                        maxLength={32}
                        value={binding.prefix ?? ''}
                        onChange={(e) =>
                          updateBinding(index, { prefix: e.target.value || undefined })
                        }
                      />
                    </Field>
                  )}
                </div>
                <button
                  type="button"
                  disabled={draft.authBindings!.length === 1}
                  onClick={() =>
                    setBindings(draft.authBindings!.filter((_, position) => position !== index))
                  }
                >
                  인증 필드 {index + 1} 삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={draft.authBindings.length >= 8}
              onClick={() =>
                setBindings([
                  ...draft.authBindings!,
                  { credentialId: '', location: 'header', name: '' },
                ])
              }
            >
              인증 필드 추가
            </button>
          </div>
        )}
        {draft.adapter === 'generic' && (
          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.detectJsonError === true}
                aria-describedby="route-json-error-hint"
                onChange={(e) => set('detectJsonError', e.target.checked || undefined)}
              />
              JSON 응답의 제공사 오류 기록
            </label>
            <p id="route-json-error-hint" className="muted">
              HTTP 200 안에 오류가 담겨 오면 호출 기록에 오류로 표시합니다. 호출 응답은 그대로
              전달합니다.
            </p>
          </div>
        )}
        <div className="field" role="group" aria-label="허용할 메서드">
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
        {!draft.allowedMethods.length && (
          <p className="hint">허용할 메서드를 한 개 이상 선택해 주세요.</p>
        )}
        {draft.adapter === 'generic' && (
          <details className="editor-section">
            <summary>API 기능 분류</summary>
            <p className="hint">
              네이버 Maps와 카카오 Local의 주요 기능은 자동으로 분류합니다. 다른 기능은 제공사 URL의
              경로를 입력하세요. 예: /v1/places/&#123;id&#125;. 쿼리는 입력하지 않습니다. 메서드나
              패턴이 겹치면 더 구체적인 규칙이 우선합니다.
            </p>
            {rules.map((rule, index) => {
              const update = (change: Partial<typeof rule>) =>
                set(
                  'operationRules',
                  rules.map((item, i) => (i === index ? { ...item, ...change } : item)),
                );
              return (
                <div key={index} className="key-editor">
                  <div className="form-grid">
                    <Field label={`기능 이름 ${index + 1}`}>
                      <input
                        required
                        maxLength={100}
                        value={rule.name}
                        onChange={(e) => update({ name: e.target.value })}
                      />
                    </Field>
                    <Field label={`기능 메서드 ${index + 1}`}>
                      <select
                        required
                        value={draft.allowedMethods.includes(rule.method) ? rule.method : ''}
                        onChange={(e) => update({ method: e.target.value })}
                      >
                        <option value="" disabled>
                          허용된 메서드 선택
                        </option>
                        {draft.allowedMethods.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={`기능 경로 ${index + 1}`}>
                      <input
                        required
                        maxLength={240}
                        placeholder="/v1/places/{id}"
                        value={rule.path}
                        onChange={(e) => update({ path: e.target.value })}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        'operationRules',
                        rules.filter((_, i) => i !== index),
                      )
                    }
                  >
                    기능 {index + 1} 삭제
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              disabled={rules.length >= 24 || !draft.allowedMethods.length}
              onClick={() =>
                set('operationRules', [
                  ...rules,
                  { name: '', method: draft.allowedMethods[0]!, path: '' },
                ])
              }
            >
              기능 추가
            </button>
          </details>
        )}
        <RouteMailBudget route={draft} onChange={(budget) => set('mailBudget', budget)} />
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
  const [saving, setSaving] = useState(false);
  const projectRoutes = routes.filter((route) => route.projectId === draft.projectId);
  const set = (key: keyof GatewayClientDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Modal
      title={client ? '클라이언트 한도 수정' : '클라이언트 키 발급'}
      onClose={onClose}
      closeDisabled={saving}
    >
      <Form
        label={client ? '저장' : '발급'}
        onCancel={onClose}
        submitDisabled={
          !client &&
          (!draft.projectId || !projectRoutes.some((route) => draft.routeIds.includes(route.id)))
        }
        onSubmit={async () => {
          if (!client && !draft.routeIds.length) throw Error('허용할 경로를 선택해 주세요.');
          setSaving(true);
          try {
            if (client) {
              await api(`/gateway/clients/${client.id}`, 'PUT', {
                dailyRequestLimit: draft.dailyRequestLimit,
                dailyTokenAlert: draft.dailyTokenAlert,
                dailyCostAlertMicros: draft.dailyCostAlertMicros,
              });
              await onSaved();
            } else {
              const result = await api<{
                token: string;
              }>('/gateway/clients', 'POST', draft);
              await onSaved(result.token);
            }
            onClose();
          } finally {
            setSaving(false);
          }
        }}
      >
        {!client && (
          <>
            <Field label="클라이언트 이름">
              <input required value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field
              label="프로젝트"
              hint={!projects.length ? '프로젝트 메뉴에서 프로젝트를 먼저 만드세요.' : undefined}
            >
              <select
                required
                disabled={!projects.length}
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
            <div className="field" role="group" aria-label="허용할 중계 경로">
              <span>허용할 중계 경로</span>
              {!draft.projectId ? (
                <p className="hint">프로젝트를 먼저 선택해 주세요.</p>
              ) : (
                !projectRoutes.length && (
                  <p className="hint">
                    선택한 프로젝트의 중계 경로가 없습니다. 게이트웨이의 ‘중계 경로’에서 경로를 먼저
                    추가해 주세요.
                  </p>
                )
              )}
              {projectRoutes.map((r) => (
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
    inputPerMillion: '',
    outputPerMillion: '',
    cachedInputPerMillion: '',
    startsAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof PriceDraft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Modal title="모델 단가 추가" onClose={onClose} closeDisabled={saving}>
      <Form
        onCancel={onClose}
        onSubmit={async () => {
          setSaving(true);
          try {
            await api('/gateway/prices', 'POST', {
              ...draft,
              startsAt: new Date(draft.startsAt).toISOString(),
            });
            await onSaved();
            onClose();
          } finally {
            setSaving(false);
          }
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
        <p className="hint">세 단가를 모두 입력해 주세요. 무료인 항목은 0을 입력하세요.</p>
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
