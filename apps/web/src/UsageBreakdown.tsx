import { useState, type ReactNode } from 'react';
import type {
  Entry,
  OpenRouterUsage,
  Project,
  UsageProvider,
  UsageReport,
} from '@keydesk/contracts';
import { api } from './api.ts';

const providers: Record<UsageProvider, string> = {
  'naver-maps': '네이버 Cloud Maps',
  'kakao-local': '카카오 Local',
  'kakao-mobility': '카카오모빌리티',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};
const number = (value: number | null) => value?.toLocaleString('ko-KR') ?? '미확인';
const usd = (value: string | null) => (value === null ? '미확인' : 'USD ' + value);
const projectName = (projects: Project[], id: string) =>
  projects.find((project) => project.id === id)?.name ?? '이전 프로젝트';

function UsageTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <section className="editor-section">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={title}>
          <table className="table" aria-label={title}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, cells }) => (
                <tr key={key}>
                  {cells.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">표시할 기록이 없습니다.</p>
      )}
    </section>
  );
}

export function UsageBreakdown({ report, projects }: { report: UsageReport; projects: Project[] }) {
  const routeKey = ({ projectId, routeId }: { projectId: string; routeId: string }) =>
    JSON.stringify([projectId, routeId]);
  const routeNames = new Map(report.routeTotals.map((route) => [routeKey(route), route.name]));
  const scope = (row: { routeId: string; projectId: string }) => (
    <>
      {routeNames.get(routeKey(row)) ?? '이전 경로 ' + row.routeId.slice(0, 8)}
      <div className="purpose">{projectName(projects, row.projectId)}</div>
    </>
  );
  return (
    <>
      <UsageTable
        title="중계 경로별 호출"
        columns={['경로 / 프로젝트', '현재 연결', '호출 수']}
        rows={report.routeTotals.map((row) => ({
          key: routeKey(row),
          cells: [
            scope(row),
            row.currentProvider ? providers[row.currentProvider] : '미확인',
            number(row.requests) + '회',
          ],
        }))}
      />
      <UsageTable
        title="API 기능별 호출"
        columns={['경로 / 프로젝트', '기록된 제공사', 'API 기능', '호출 수']}
        rows={report.operations.map((row) => ({
          key: JSON.stringify([row.projectId, row.routeId, row.provider, row.operationId]),
          cells: [
            scope(row),
            row.provider ? providers[row.provider] : '미확인',
            row.name ?? 'API 미분류',
            number(row.requests) + '회',
          ],
        }))}
      />
      <UsageTable
        title="AI 모델별 사용량"
        columns={[
          '경로 / 프로젝트',
          '제공사 / 응답 모델',
          '호출 수',
          '입력 / 출력 / 총 토큰',
          '캐시 / 추론 토큰',
          '제공사 보고 비용',
        ]}
        rows={report.models.map((row) => ({
          key: JSON.stringify([
            row.projectId,
            row.routeId,
            row.adapter,
            row.provider,
            row.originId,
            row.model,
          ]),
          cells: [
            scope(row),
            <>
              {row.provider ? providers[row.provider] + ' · ' : ''}
              {row.model ?? '실제 모델 미확인'}
              <div className="purpose">
                {row.provider === 'openrouter' && row.model?.endsWith(':free')
                  ? '무료 모델 변형'
                  : row.adapter === 'gemini'
                    ? '요금 구분 미확인 · 제공사 기록 참고'
                    : row.reportedCostUsd !== null && row.reportedCostUsd !== '0'
                      ? '비용 발생 보고'
                      : '요금 구분 미확인'}
              </div>
            </>,
            number(row.requests) + '회',
            <>
              {[row.inputTokens, row.outputTokens, row.totalTokens].map(number).join(' / ')}
              <div className="purpose">
                토큰 보고 {number(row.tokenReports)} / {number(row.requests)}회
              </div>
            </>,
            [row.cachedInputTokens, row.reasoningTokens].map(number).join(' / '),
            <>
              {usd(row.reportedCostUsd)}
              <div className="purpose">
                비용 보고 {number(row.costReports)} / {number(row.requests)}회
              </div>
            </>,
          ],
        }))}
      />
      <UsageTable
        title="오늘 호출 제한"
        columns={['클라이언트 키 / 프로젝트', '사용 / 최대', '적용일']}
        rows={report.dailyLimits.map((row) => ({
          key: row.clientId,
          cells: [
            <>
              {row.name}
              <div className="purpose">{projectName(projects, row.projectId)}</div>
            </>,
            `${number(row.used)} / ${row.max === null ? '제한 미설정' : number(row.max) + '회'}`,
            `${report.day} (${report.timeZone})`,
          ],
        }))}
      />
    </>
  );
}

function OpenRouterMeter({ routeId, name, zone }: { routeId: string; name: string; zone: string }) {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState<OpenRouterUsage | null>(null);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true);
    setError('');
    setValue(null);
    try {
      setValue(
        await api<OpenRouterUsage>('/usage/openrouter/' + encodeURIComponent(routeId), 'POST'),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '제공사 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="editor-section">
      <h3>OpenRouter · {name}</h3>
      <p className="muted">
        연결 키로 받은 제공사 집계입니다. 무료 요청 한도는 모델별 한도가 아닙니다.
      </p>
      <button type="button" disabled={loading} onClick={() => void refresh()}>
        {loading ? '조회 중…' : '제공사 조회'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {value && (
        <dl className="usage-summary">
          <div>
            <dt>일일 무료 모델 요청</dt>
            <dd>
              {value.freeRequests
                ? `사용 ${number(value.freeRequests.used)} / 최대 ${number(value.freeRequests.max)} / 잔여 ${number(value.freeRequests.remaining)}회`
                : '미확인'}
            </dd>
          </div>
          <div>
            <dt>키 사용액</dt>
            <dd>
              누적 {usd(value.usage)} · 일간 {usd(value.usageDaily)} · 주간 {usd(value.usageWeekly)}{' '}
              · 월간 {usd(value.usageMonthly)}
            </dd>
          </div>
          <div>
            <dt>키 지출 한도</dt>
            <dd>
              {value.limitStatus === 'unset'
                ? '별도 한도 미설정'
                : value.limitStatus === 'set'
                  ? `최대 ${usd(value.limit)} · 잔여 ${usd(value.limitRemaining)}`
                  : '미확인'}
              {value.limitReset
                ? ' · ' +
                  { daily: '일간', weekly: '주간', monthly: '월간' }[value.limitReset] +
                  ' 초기화'
                : ''}
            </dd>
          </div>
          <div>
            <dt>조회 시각</dt>
            <dd>{new Date(value.checkedAt).toLocaleString('ko-KR', { timeZone: zone })}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

export function ProviderUsage({
  entries,
  sources,
  projects,
  zone,
}: {
  entries: Entry[];
  sources: UsageReport['openRouterSources'];
  projects: Project[];
  zone: string;
}) {
  return (
    <section className="editor-section">
      <h2>제공사 집계</h2>
      <p className="muted">
        제공사마다 기간과 적용 범위가 다르며 Keydesk 밖에서 쓴 양도 포함될 수 있습니다.
      </p>
      {sources.map(({ routeId, name, projectId }) => (
        <OpenRouterMeter
          key={routeId}
          routeId={routeId}
          name={name + ' · ' + projectName(projects, projectId)}
          zone={zone}
        />
      ))}
      <UsageTable
        title="콘솔에서 확인한 값"
        columns={['항목 / 집계 이름', '범위', '기간', '사용 / 최대', '확인 시각']}
        rows={entries.flatMap((entry) =>
          (entry.providerUsageMeters ?? []).map((meter, i) => ({
            key: entry.id + ':' + i,
            cells: [
              <>
                {entry.name} · {meter.name}
                {entry.provider && entry.provider !== entry.name && (
                  <div className="purpose">{entry.provider}</div>
                )}
                {entry.consoleUrl && (
                  <div className="purpose">
                    <a href={entry.consoleUrl} target="_blank" rel="noreferrer">
                      제공사 콘솔
                    </a>
                  </div>
                )}
              </>,
              <>
                {meter.scope}
                {meter.tier && (
                  <div className="purpose">{meter.tier === 'free' ? '무료 티어' : '유료 티어'}</div>
                )}
              </>,
              meter.period,
              `${meter.used ?? '미확인'} / ${meter.limitStatus === 'unset' ? '한도 미설정' : (meter.max ?? '미확인')} (${meter.unit})`,
              new Date(meter.checkedAt).toLocaleString('ko-KR', { timeZone: zone }),
            ],
          })),
        )}
      />
      <p className="hint">제공사에서 확인한 수치는 보관함 항목 수정 화면에서 기록할 수 있습니다.</p>
    </section>
  );
}
