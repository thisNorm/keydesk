import { useEffect, useId, useRef, useState } from 'react';
import type { Credential, CredentialVersion } from '@keydesk/contracts';
import { api, copyText } from './api.ts';
import { expiryText, formatCredentialDate } from './helpers.ts';
import { Field, statusLabel } from './ui.tsx';

export function hideRevealedSecrets() {
  window.dispatchEvent(new Event('keydesk:mask'));
}
export function requestCredentialValue(id: string, version: number) {
  return api<{ value: string }>(`/credentials/${id}/reveal`, 'POST', { version });
}

export function Secret({
  credential,
  notify,
  zone,
  onRotate,
}: {
  credential: Credential;
  notify: (message: string) => void;
  zone: string;
  onRotate: () => void;
}) {
  const [value, setValue] = useState('');
  const [versions, setVersions] = useState<CredentialVersion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [selected, setSelected] = useState(credential.version);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef(true),
    generation = useRef(0),
    descriptionId = useId();
  const previous = selected !== credential.version;
  const clear = () => {
    generation.current++;
    setValue('');
    clearTimeout(timer.current);
  };
  useEffect(() => {
    live.current = true;
    const visibility = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', clear);
    window.addEventListener('keydesk:mask', clear);
    return () => {
      live.current = false;
      generation.current++;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', clear);
      window.removeEventListener('keydesk:mask', clear);
    };
  }, []);
  async function reveal(copy = false) {
    setBusy(true);
    const request = generation.current,
      version = selected;
    const current = () => live.current && request === generation.current && !document.hidden;
    try {
      const result = await requestCredentialValue(credential.id, version);
      if (!current()) return;
      if (copy) {
        const copied = await copyText(result.value, current);
        if (!current()) return;
        if (copied) {
          clear();
          notify(
            `${credential.label}${version !== credential.version ? ` 이전 버전 ${version}` : ''}을 복사했습니다.`,
          );
          return;
        }
        notify('자동 복사를 허용하지 않았습니다. 표시된 값을 선택해 직접 복사해 주세요.');
      }
      setValue(result.value);
      clearTimeout(timer.current);
      timer.current = setTimeout(clear, 20000);
    } catch (error) {
      if (current()) notify((error as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function toggleHistory() {
    clear();
    if (versions) {
      setVersions(null);
      setSelected(credential.version);
      return;
    }
    setHistoryBusy(true);
    const request = generation.current;
    try {
      const result = await api<{ versions: CredentialVersion[] }>(
        `/credentials/${credential.id}/versions`,
      );
      if (live.current && request === generation.current) setVersions(result.versions);
    } catch (error) {
      if (live.current) notify((error as Error).message);
    } finally {
      if (live.current) setHistoryBusy(false);
    }
  }
  return (
    <section className="credential" aria-label={`${credential.label} 관리`}>
      <div className="credential-heading">
        <strong>{credential.label}</strong>
        <span className={credential.status === 'active' ? 'muted' : 'credential-inactive'}>
          {statusLabel[credential.status]}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            clear();
            onRotate();
          }}
        >
          키 교체
        </button>
      </div>
      <div className="credential-value">
        <div className="key-value">
          <input
            aria-label={`${credential.label} 인증값`}
            aria-describedby={descriptionId}
            className="secret mono"
            readOnly
            value={value || '•••• •••• •••• ••••'}
            onFocus={(event) => {
              if (value) event.target.select();
            }}
          />
          <button type="button" disabled={busy} onClick={() => (value ? clear() : void reveal())}>
            {value ? '숨김' : '보기'}
          </button>
          <button type="button" disabled={busy} onClick={() => void reveal(true)}>
            {previous ? '이전 값 복사' : '복사'}
          </button>
        </div>
        <small id={descriptionId} className={previous ? 'previous-version' : 'muted'}>
          {previous
            ? `이전 버전 ${selected}입니다. 현재 버전은 ${credential.version}입니다.`
            : value
              ? '20초 뒤 또는 창을 벗어나면 숨깁니다.'
              : '현재 버전 ' + credential.version}
        </small>
      </div>
      <div className="credential-dates">
        <p className="date">
          {credential.expiresAt
            ? `${formatCredentialDate(credential.expiresAt, zone)} · ${expiryText(credential.expiresAt, zone)}`
            : '만료일 미등록'}
        </p>
        {credential.issuedAt && (
          <p className="date muted">발급 {formatCredentialDate(credential.issuedAt, zone)}</p>
        )}
      </div>
      <div className="versions">
        <button
          type="button"
          className="text-button"
          disabled={historyBusy}
          aria-expanded={Boolean(versions)}
          onClick={() => void toggleHistory()}
        >
          {historyBusy ? '기록 확인 중…' : `교체 기록 · 버전 ${credential.version}`}
        </button>
        {versions && (
          <Field label="조회할 버전">
            <select
              value={selected}
              onChange={(event) => {
                clear();
                setSelected(Number(event.target.value));
              }}
            >
              {versions.map((version) => (
                <option key={version.version} value={version.version}>
                  버전 {version.version}
                  {version.version === credential.version ? ' (현재)' : ' (이전)'} ·{' '}
                  {new Date(version.createdAt).toLocaleString('ko-KR', { timeZone: zone })}{' '}
                  {version.reason}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </section>
  );
}
