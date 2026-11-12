import { useEffect, useState } from 'react';
import type { MailAlertSettings, MailDelivery, MailOverview } from '@keydesk/contracts';
import { api } from './api.ts';

const empty: MailAlertSettings = {
  registration: false,
  requestLimit: false,
  budget: false,
  openRouterKeys: [],
};
const statusLabel: Record<MailDelivery['status'], string> = {
  pending: '발송 대기',
  sending: '전송 중',
  sent: '발송 완료',
  failed: '발송 실패',
  uncertain: '수락 여부 미확인',
  cancelled: '취소됨',
};
export function MailAlertOptions({
  value,
  timeZone,
  onChange,
}: {
  value?: MailAlertSettings;
  timeZone: string;
  onChange: (value: MailAlertSettings) => void;
}) {
  const [data, setData] = useState<MailOverview | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void api<MailOverview>('/settings/mail/overview').then(
      (result) => {
        if (active) setData(result);
      },
      (cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : '메일 상태를 읽지 못했습니다.');
      },
    );
    return () => {
      active = false;
    };
  }, [refresh]);
  const alerts = value ?? empty;
  const keys = data?.openRouterKeys ?? [];
  const setKey = (id: string, checked: boolean) =>
    onChange({
      ...alerts,
      openRouterKeys: checked
        ? [...alerts.openRouterKeys, id]
        : alerts.openRouterKeys.filter((item) => item !== id),
    });
  return (
    <>
      <div className="editor-section" role="group" aria-label="받을 알림">
        <h3>받을 알림</h3>
        <p className="muted">
          인증값 만료 알림은 SMTP 설정 후 받을 수 있습니다. 추가 메일은 여기서 선택하세요.
        </p>
        {(
          [
            ['registration', '신규 등록 및 프로젝트 연결 변경'],
            ['requestLimit', '일일 호출 한도 임박 및 도달'],
            ['budget', '월 비용 예산 임박 및 도달'],
          ] as const
        ).map(([key, label]) => (
          <label className="check" key={key}>
            <input
              type="checkbox"
              checked={alerts[key]}
              onChange={(e) => onChange({ ...alerts, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <p className="hint">
          호출 한도와 비용 예산은 80%와 100%에서 알립니다. 월 예산은 게이트웨이 경로에서 정합니다.
        </p>
        <h3>OpenRouter 제공사 무료 요청 한도</h3>
        <p className="hint">선택한 키만 약 한 시간 간격으로 공식 수치를 조회합니다.</p>
        {data && !keys.length && <p className="muted">활성 OpenRouter 연결이 없습니다.</p>}
        {keys.map((key) => (
          <label className="check" key={key.credentialId}>
            <input
              type="checkbox"
              checked={alerts.openRouterKeys.includes(key.credentialId)}
              disabled={
                alerts.openRouterKeys.length >= 40 &&
                !alerts.openRouterKeys.includes(key.credentialId)
              }
              onChange={(e) => setKey(key.credentialId, e.target.checked)}
            />
            {key.name} · {key.project}
          </label>
        ))}
        {data &&
          alerts.openRouterKeys
            .filter((id) => !keys.some((key) => key.credentialId === id))
            .map((id, index) => (
              <button key={id} type="button" onClick={() => setKey(id, false)}>
                사용할 수 없는 연결 {index + 1} 해제
              </button>
            ))}
      </div>
      <details className="editor-section">
        <summary>최근 메일 발송</summary>
        <button type="button" onClick={() => setRefresh((version) => version + 1)}>
          발송 상태 새로 보기
        </button>
        {!data && !error && <p role="status">발송 상태를 읽는 중…</p>}
        {data?.deliveries.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="최근 메일 발송 기록">
            <table className="table">
              <thead>
                <tr>
                  <th>제목</th>
                  <th>상태</th>
                  <th>등록 시각</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{delivery.subject}</td>
                    <td>{statusLabel[delivery.status]}</td>
                    <td>{new Date(delivery.createdAt).toLocaleString('ko-KR', { timeZone })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          data && <p className="muted">표시할 발송 기록이 없습니다.</p>
        )}
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
