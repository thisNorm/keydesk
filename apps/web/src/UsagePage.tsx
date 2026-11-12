import { useEffect, useState } from 'react';
import type { Entry, Project, UsageReport } from '@keydesk/contracts';
import { api } from './api.ts';
import { formatExactMoney, usageCost } from './helpers.ts';
import { Empty } from './ui.tsx';
import { ProviderUsage, UsageBreakdown } from './UsageBreakdown.tsx';
export function UsagePage({
  projects,
  entries,
  zone,
}: {
  projects: Project[];
  entries: Entry[];
  zone: string;
}) {
  const [days, setDays] = useState('7'),
    [project, setProject] = useState(''),
    [data, setData] = useState<UsageReport | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    setData(null);
    void api<UsageReport>(
      `/usage?days=${encodeURIComponent(days)}&projectId=${encodeURIComponent(project)}`,
    )
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
      <p className="muted">Keydesk를 거친 호출과 제공사가 집계한 사용량을 따로 보여줍니다.</p>
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
          <h2>Keydesk 중계 기록</h2>
          <p className="muted">
            최근 {days}일 · 기록 보관 {data.retentionDays}일.
            {Number(days) > data.retentionDays ? ' 보관 기간 안의 호출만 집계합니다.' : ''}
          </p>
          <dl className="usage-summary">
            <div>
              <dt>전송한 호출</dt>
              <dd>{data.summary.requests.toLocaleString('ko-KR')}회</dd>
            </div>
            <div>
              <dt>확인한 입력 / 출력 토큰</dt>
              <dd>
                {(['inputTokens', 'outputTokens'] as const)
                  .map((field) =>
                    data.models.some((model) => model[field] !== null)
                      ? data.summary[field].toLocaleString('ko-KR')
                      : '미확인',
                  )
                  .join(' / ')}
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
          <UsageBreakdown report={data} projects={projects} />
          <ProviderUsage
            entries={
              project ? entries.filter((entry) => entry.projectIds.includes(project)) : entries
            }
            sources={data.openRouterSources}
            projects={projects}
            zone={zone}
          />
          <h2>호출 상세</h2>
          <p className="muted">
            아래에는 최근 1,000개까지 표시합니다. 토큰 사용량과 비용의 미확인은 각각 구분합니다.
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="사용량과 비용 호출 기록"
          >
            <table className="table">
              <thead>
                <tr>
                  <th>시각 / 프로젝트</th>
                  <th>API 기능 / 응답 모델</th>
                  <th>결과</th>
                  <th>입력 / 출력 / 총 / 캐시 / 추론 토큰</th>
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
                      {r.operation?.name ??
                        r.model ??
                        (r.adapter && r.adapter !== 'generic' ? '실제 모델 미확인' : 'API 미분류')}
                      <div className="purpose">{r.usageSource}</div>
                    </td>
                    <td>
                      {r.outcome === 'error' &&
                      r.statusCode !== null &&
                      r.statusCode >= 200 &&
                      r.statusCode < 300 ? (
                        <>응답 오류 · HTTP {r.statusCode}</>
                      ) : (
                        <>
                          {r.outcome === 'success'
                            ? '성공'
                            : r.outcome === 'cancelled'
                              ? '취소'
                              : '오류'}{' '}
                          {r.statusCode ?? ''}
                        </>
                      )}
                    </td>
                    <td>
                      {[
                        r.inputTokens,
                        r.outputTokens,
                        r.totalTokens,
                        r.cachedInputTokens,
                        r.reasoningTokens,
                      ]
                        .map((tokens) => tokens?.toLocaleString('ko-KR') ?? '미확인')
                        .join(' / ')}
                    </td>
                    <td>
                      {usageCost(r)}
                      {r.reportedCostUsd !== undefined && (
                        <div className="purpose">제공사 보고: USD {r.reportedCostUsd}</div>
                      )}
                    </td>
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
