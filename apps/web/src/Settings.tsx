import { useEffect, useId, useRef, useState } from 'react';
import type { Settings, AuthState, EncryptedBackup } from '@keydesk/contracts';
import { api } from './api.ts';
import { Confirm, Field, Form } from './ui.tsx';
import {
  parseBackupFile,
  settingsPayload,
  settingsSectionDirty,
  validateBackupFileSize,
  withoutSmtpPassword,
  type SettingsSection,
} from './settings-model.ts';

type Section = SettingsSection | 'backup' | 'restore';
type Theme = 'system' | 'light' | 'dark';
const sections: { id: Section; label: string }[] = [
  { id: 'general', label: '일반' },
  { id: 'mail', label: '알림 메일' },
  { id: 'backup', label: '백업' },
  { id: 'restore', label: '복원' },
  { id: 'server', label: '서버 사용량 설정' },
];
const saveLabels = { general: '일반 설정', mail: '메일 설정', server: '서버 사용량 설정' };

export function SettingsPage({
  notify,
  onAuth,
  onSaved,
  theme = 'system',
  onThemeChange,
}: {
  notify: (s: string) => void;
  onAuth: (a: AuthState) => void;
  onSaved: () => Promise<void>;
  theme?: Theme;
  onThemeChange?: (value: Theme) => void;
}) {
  const [saved, setSaved] = useState<Settings | null>(null),
    [draft, setDraft] = useState<Settings | null>(null),
    [loadError, setLoadError] = useState(''),
    [section, setSection] = useState<Section>('general'),
    [smtpPassword, setSmtpPassword] = useState(''),
    [mailBusy, setMailBusy] = useState(false),
    [mailError, setMailError] = useState(''),
    [backupPassword, setBackupPassword] = useState(''),
    [backupOwnerPassword, setBackupOwnerPassword] = useState(''),
    [restorePassword, setRestorePassword] = useState(''),
    [restoreOwnerPassword, setRestoreOwnerPassword] = useState(''),
    [backupFile, setBackupFile] = useState<EncryptedBackup | null>(null),
    [backupName, setBackupName] = useState(''),
    [fileError, setFileError] = useState(''),
    [fileBusy, setFileBusy] = useState(false),
    [restore, setRestore] = useState(false),
    [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [leave, setLeave] = useState<{ proceed: () => void } | null>(null);
  const id = useId(),
    busyRef = useRef(false),
    fileReadId = useRef(0);

  useEffect(() => {
    let active = true;
    void api<{ settings: Settings }>('/settings')
      .then(({ settings }) => {
        if (!active) return;
        const clean = withoutSmtpPassword(settings);
        setSaved(clean);
        setDraft(clean);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : '설정을 불러오지 못했습니다.');
      });
    return () => {
      active = false;
      fileReadId.current++;
    };
  }, []);

  const settingsDirty = Boolean(
    saved &&
      draft &&
      (section === 'general' || section === 'mail' || section === 'server') &&
      settingsSectionDirty(saved, draft, section, smtpPassword),
  );
  const dirty =
    settingsDirty ||
    (section === 'general' && Boolean(currentPassword || newPassword || confirmPassword)) ||
    (section === 'backup' && Boolean(backupPassword || backupOwnerPassword)) ||
    (section === 'restore' && Boolean(backupFile || restorePassword || restoreOwnerPassword));

  function discardActive() {
    if (saved && draft) {
      if (section === 'general') setDraft({ ...draft, timeZone: saved.timeZone });
      if (section === 'mail') setDraft({ ...draft, smtp: { ...saved.smtp } });
      if (section === 'server')
        setDraft({
          ...draft,
          retentionDays: saved.retentionDays,
          krwExchangeRate: saved.krwExchangeRate,
          exchangeRateDate: saved.exchangeRateDate,
        });
    }
    setSmtpPassword('');
    setMailError('');
    setBackupPassword('');
    setBackupOwnerPassword('');
    setRestorePassword('');
    setRestoreOwnerPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setBackupFile(null);
    setBackupName('');
    setFileError('');
    setRestore(false);
    fileReadId.current++;
  }

  // The parent dispatches this event before changing the current app page.
  useEffect(() => {
    function beforeNavigate(event: Event) {
      const resume = (event as CustomEvent<{ resume?: () => void }>).detail?.resume;
      if (busyRef.current || fileBusy) {
        event.preventDefault();
        notify('요청을 처리 중입니다. 잠시 기다려 주세요.');
        return;
      }
      if (!dirty || typeof resume !== 'function') return;
      event.preventDefault();
      setLeave({
        proceed: () => {
          discardActive();
          resume();
        },
      });
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !busyRef.current && !fileBusy) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('keydesk:before-navigate', beforeNavigate);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydesk:before-navigate', beforeNavigate);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  });

  function selectSection(next: Section) {
    if (next === section || busyRef.current || fileBusy) return;
    const proceed = () => {
      discardActive();
      setSection(next);
      document.getElementById(`${id}-tab-${next}`)?.focus();
    };
    if (dirty) setLeave({ proceed });
    else proceed();
  }

  async function operation(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function save(which: SettingsSection) {
    if (!saved || !draft) return;
    if (which === 'general') {
      try {
        new Intl.DateTimeFormat('ko', { timeZone: draft.timeZone });
      } catch {
        throw Error('올바른 시간대를 입력해 주세요. 예: Asia/Seoul');
      }
    }
    if (which === 'server' && Number(draft.krwExchangeRate) <= 0)
      throw Error('환율은 0보다 큰 값으로 입력해 주세요.');
    await operation(async () => {
      const result = await api<{ settings: Settings }>(
        '/settings',
        'PUT',
        settingsPayload(saved, draft, which, smtpPassword),
      );
      const clean = withoutSmtpPassword(result.settings);
      setSaved(clean);
      setDraft((current) => (current ? settingsPayload(current, clean, which) : clean));
      if (which === 'mail') setSmtpPassword('');
      let message = `${saveLabels[which]}을 저장했습니다.`;
      try {
        await onSaved();
      } catch {
        message += ' 화면 갱신에 실패했습니다. 다시 연결하면 저장한 설정을 볼 수 있습니다.';
      }
      notify(message);
    });
  }

  async function finishSession(message: string) {
    notify(message);
    const state = await api<AuthState>('/auth/state').catch(() => ({
      initialized: true,
      authenticated: false,
    }));
    onAuth(state);
  }

  async function download() {
    if (!backupPassword || !backupOwnerPassword)
      throw Error('현재 소유자 비밀번호와 새 백업 파일 암호를 입력해 주세요.');
    await operation(async () => {
      const result = await api<{ backup: EncryptedBackup }>('/backups', 'POST', {
        password: backupPassword,
        ownerPassword: backupOwnerPassword,
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.backup)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `keydesk-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setBackupPassword('');
      setBackupOwnerPassword('');
      notify('암호화 백업을 내려받았습니다. 파일과 암호를 따로 안전하게 보관해 주세요.');
    });
  }

  if (!saved || !draft)
    return <p role={loadError ? 'alert' : 'status'}>{loadError || '설정을 불러오는 중…'}</p>;
  const updateSmtp = <K extends keyof Settings['smtp']>(key: K, value: Settings['smtp'][K]) =>
    setDraft({ ...draft, smtp: { ...draft.smtp, [key]: value } });

  return (
    <>
      <header className="pagehead">
        <h1>설정</h1>
      </header>
      <div className="settings-page">
        <div className="settings-tabs" role="tablist" aria-label="설정 항목">
          {sections.map((item, index) => (
            <button
              key={item.id}
              type="button"
              id={`${id}-tab-${item.id}`}
              role="tab"
              aria-selected={section === item.id}
              aria-controls={`${id}-panel-${item.id}`}
              tabIndex={section === item.id ? 0 : -1}
              disabled={busy || fileBusy}
              onClick={() => selectSection(item.id)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                let next: number;
                if (event.key === 'ArrowRight') next = (index + 1) % sections.length;
                else if (event.key === 'ArrowLeft')
                  next = (index + sections.length - 1) % sections.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = sections.length - 1;
                else return;
                event.preventDefault();
                selectSection(sections[next].id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <section
          key={section}
          id={`${id}-panel-${section}`}
          className="settings-section"
          role="tabpanel"
          aria-labelledby={`${id}-tab-${section}`}
          aria-busy={busy || fileBusy}
          tabIndex={0}
        >
          {settingsDirty && (
            <p className="muted" role="status">
              저장하지 않은 변경 사항이 있습니다.
            </p>
          )}
          <fieldset disabled={busy}>
            {section === 'general' && (
              <>
                <h2>일반</h2>
                <Form label="일반 설정 저장" onSubmit={() => save('general')}>
                  <div className="form-grid">
                    <Field
                      label="시간대"
                      hint="키 만료일과 사용 기록을 표시할 때의 날짜 기준입니다."
                    >
                      <input
                        required
                        maxLength={100}
                        value={draft.timeZone}
                        placeholder="Asia/Seoul"
                        onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}
                      />
                    </Field>
                    <Field label="화면" hint="이 브라우저에 바로 적용됩니다.">
                      <select
                        value={theme}
                        disabled={!onThemeChange}
                        onChange={(event) => onThemeChange?.(event.target.value as Theme)}
                      >
                        <option value="system">시스템 설정</option>
                        <option value="light">밝게</option>
                        <option value="dark">어둡게</option>
                      </select>
                    </Field>
                  </div>
                </Form>
                <h3>소유자 비밀번호 변경</h3>
                <p className="muted">
                  변경하면 모든 기기의 로그인 세션이 종료됩니다. 새 비밀번호로 다시 로그인해 주세요.
                </p>
                <Form
                  label="비밀번호 변경"
                  onSubmit={async () => {
                    if (newPassword !== confirmPassword)
                      throw Error('새 비밀번호와 확인 입력이 일치하지 않습니다.');
                    if (settingsSectionDirty(saved, draft, 'general'))
                      throw Error('시간대 변경 사항을 먼저 저장한 뒤 비밀번호를 변경해 주세요.');
                    await operation(async () => {
                      await api('/auth/password', 'POST', { currentPassword, newPassword });
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      await finishSession('비밀번호를 변경했습니다. 다시 로그인해 주세요.');
                    });
                  }}
                >
                  <div className="form-grid">
                    <Field label="현재 비밀번호">
                      <input
                        type="password"
                        required
                        maxLength={256}
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                      />
                    </Field>
                    <Field label="새 비밀번호 (12자 이상)">
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={256}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </Field>
                    <Field label="새 비밀번호 확인">
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={256}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                      />
                    </Field>
                  </div>
                </Form>
              </>
            )}
            {section === 'mail' && (
              <>
                <h2>알림 메일 (선택)</h2>
                <p>메일을 설정하지 않아도 앱의 만료 알림을 사용할 수 있습니다.</p>
                <p className="muted">
                  메일에는 인증값을 넣지 않습니다. 메일을 받으려면 사용하는 메일 서비스의 SMTP
                  정보를 입력해 주세요.
                </p>
                <Form label="메일 설정 저장" onSubmit={() => save('mail')}>
                  <div className="form-grid">
                    <Field label="SMTP 서버">
                      <input
                        maxLength={253}
                        value={draft.smtp.host}
                        autoComplete="off"
                        onChange={(event) => updateSmtp('host', event.target.value)}
                      />
                    </Field>
                    <Field label="포트">
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        required
                        value={draft.smtp.port}
                        onChange={(event) => updateSmtp('port', Number(event.target.value))}
                      />
                    </Field>
                    <Field label="사용자 이름">
                      <input
                        maxLength={320}
                        autoComplete="off"
                        value={draft.smtp.user}
                        onChange={(event) => updateSmtp('user', event.target.value)}
                      />
                    </Field>
                    <Field
                      label="SMTP 비밀번호"
                      hint={
                        saved.smtp.passwordConfigured
                          ? '저장된 비밀번호가 있습니다. 비워 두면 유지하며 저장 후에는 다시 표시하지 않습니다.'
                          : '저장된 비밀번호가 없습니다. 필요한 경우에만 입력해 주세요.'
                      }
                    >
                      <input
                        type="password"
                        maxLength={4096}
                        autoComplete="new-password"
                        value={smtpPassword}
                        onChange={(event) => setSmtpPassword(event.target.value)}
                      />
                    </Field>
                    <Field label="보내는 주소">
                      <input
                        type="email"
                        maxLength={254}
                        value={draft.smtp.from}
                        onChange={(event) => updateSmtp('from', event.target.value)}
                      />
                    </Field>
                    <Field label="받는 주소">
                      <input
                        type="email"
                        maxLength={254}
                        value={draft.smtp.to}
                        onChange={(event) => updateSmtp('to', event.target.value)}
                      />
                    </Field>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.smtp.secure}
                      onChange={(event) => updateSmtp('secure', event.target.checked)}
                    />
                    연결 시작부터 TLS 사용
                  </label>
                </Form>
                <p className="muted">
                  테스트 메일은 저장된 설정으로만 보냅니다. 위에서 수정한 내용은 먼저 저장해 주세요.
                </p>
                {saved.smtp.host && (
                  <p className="muted">
                    저장된 SMTP: {saved.smtp.host} · 받는 주소: {saved.smtp.to || '미설정'}
                  </p>
                )}
                <div className="backup-actions">
                  <button
                    type="button"
                    disabled={busy || !saved.smtp.host || !saved.smtp.from || !saved.smtp.to}
                    onClick={async () => {
                      setMailError('');
                      await operation(async () => {
                        setMailBusy(true);
                        try {
                          await api('/settings/smtp/test', 'POST');
                          notify('저장된 받는 주소로 테스트 메일을 보냈습니다.');
                        } catch (error) {
                          setMailError(
                            error instanceof Error
                              ? error.message
                              : '테스트 메일을 보내지 못했습니다.',
                          );
                        } finally {
                          setMailBusy(false);
                        }
                      });
                    }}
                  >
                    {mailBusy ? '전송 중…' : '저장된 설정으로 테스트 메일 보내기'}
                  </button>
                </div>
                {mailError && (
                  <p className="error" role="alert">
                    {mailError}
                  </p>
                )}
              </>
            )}
            {section === 'backup' && (
              <>
                <h2>암호화 백업</h2>
                <p>
                  모든 인증값과 이전 버전, 프로젝트, 알림, 설정과 서버 사용 기록을 암호화된 파일로
                  내려받습니다.
                </p>
                <p className="muted">
                  Windows와 Mac 사이에서 옮길 때는 이 파일을 전달한 뒤, 옮겨받는 컴퓨터의
                  Keydesk에서 ‘복원’을 선택하세요. 백업 파일 암호는 분실하면 복구할 수 없으므로
                  파일과 따로 보관해 주세요.
                </p>
                <Form label="암호화 백업 내려받기" onSubmit={download}>
                  <div className="form-grid">
                    <Field label="현재 소유자 비밀번호" hint="백업을 만들 권한을 확인합니다.">
                      <input
                        type="password"
                        required
                        maxLength={256}
                        autoComplete="current-password"
                        value={backupOwnerPassword}
                        onChange={(event) => setBackupOwnerPassword(event.target.value)}
                      />
                    </Field>
                    <Field
                      label="새 백업 파일 암호 (12자 이상)"
                      hint="이 파일을 복원할 때 입력할 암호입니다."
                    >
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={256}
                        autoComplete="new-password"
                        value={backupPassword}
                        onChange={(event) => setBackupPassword(event.target.value)}
                      />
                    </Field>
                  </div>
                </Form>
              </>
            )}
            {section === 'restore' && (
              <>
                <h2>백업 파일로 복원</h2>
                <p>
                  현재 데이터를 백업 내용으로 교체합니다. 필요한 현재 데이터는 먼저 ‘백업’에서
                  내려받아 주세요.
                </p>
                <p className="muted">
                  다른 PC나 Mac에서 옮겨왔다면 이 컴퓨터의 Keydesk 소유자 계정을 먼저 설정하고, 이
                  컴퓨터의 현재 소유자 비밀번호와 파일을 만들 때 정한 백업 암호를 입력하세요.
                </p>
                <Form
                  label="복원 내용 확인"
                  submitDisabled={!backupFile || fileBusy}
                  onSubmit={async () => {
                    if (!backupFile) throw Error('복원할 Keydesk 백업 파일을 먼저 선택해 주세요.');
                    if (!restoreOwnerPassword || !restorePassword)
                      throw Error(
                        '현재 소유자 비밀번호와 복원할 파일의 백업 암호를 입력해 주세요.',
                      );
                    setRestore(true);
                  }}
                >
                  <Field
                    label="복원할 암호화 백업 파일"
                    hint="Keydesk에서 만든 JSON 파일, 최대 24MB입니다. 파일 선택만으로 복원하거나 백업을 만들지 않습니다."
                  >
                    <input
                      type="file"
                      accept=".json,application/json"
                      disabled={fileBusy}
                      onChange={async (event) => {
                        const file = event.target.files?.[0],
                          request = ++fileReadId.current;
                        setBackupFile(null);
                        setBackupName('');
                        setFileError('');
                        setRestorePassword('');
                        setRestoreOwnerPassword('');
                        if (!file) return;
                        setFileBusy(true);
                        try {
                          validateBackupFileSize(file.size);
                          const parsed = parseBackupFile(await file.text());
                          if (request !== fileReadId.current) return;
                          setBackupFile(parsed);
                          setBackupName(file.name);
                        } catch (error) {
                          if (request === fileReadId.current)
                            setFileError(
                              error instanceof Error
                                ? error.message
                                : '백업 파일을 읽지 못했습니다.',
                            );
                        } finally {
                          if (request === fileReadId.current) setFileBusy(false);
                        }
                      }}
                    />
                  </Field>
                  {fileBusy && <p role="status">파일 형식을 확인하는 중…</p>}
                  {fileError && (
                    <p className="error" role="alert">
                      {fileError}
                    </p>
                  )}
                  {backupFile && <p role="status">{backupName} · 파일 형식 확인 완료</p>}
                  <div className="form-grid">
                    <Field
                      label="현재 소유자 비밀번호"
                      hint="이 컴퓨터의 현재 Keydesk 소유자 비밀번호입니다."
                    >
                      <input
                        type="password"
                        required
                        maxLength={256}
                        autoComplete="current-password"
                        value={restoreOwnerPassword}
                        onChange={(event) => setRestoreOwnerPassword(event.target.value)}
                      />
                    </Field>
                    <Field label="복원할 파일의 백업 암호">
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={256}
                        autoComplete="off"
                        value={restorePassword}
                        onChange={(event) => setRestorePassword(event.target.value)}
                      />
                    </Field>
                  </div>
                </Form>
              </>
            )}
            {section === 'server' && (
              <>
                <h2>서버 사용량 설정</h2>
                <p className="muted">
                  Keydesk 서버를 통해 API를 호출할 때 사용하는 기록과 비용 표시 설정입니다.
                </p>
                <Form label="서버 사용량 설정 저장" onSubmit={() => save('server')}>
                  <div className="form-grid">
                    <Field label="호출 기록 보존 (일)" hint="1~3650일 범위에서 설정할 수 있습니다.">
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        required
                        value={draft.retentionDays}
                        onChange={(event) =>
                          setDraft({ ...draft, retentionDays: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field
                      label="USD 1달러당 원화 환율"
                      hint="USD 비용의 원화 추정에만 적용하며 실제 청구 금액이 아닙니다."
                    >
                      <input
                        required
                        inputMode="decimal"
                        maxLength={30}
                        pattern="\d{1,9}(\.\d{1,8})?"
                        value={draft.krwExchangeRate}
                        onChange={(event) =>
                          setDraft({ ...draft, krwExchangeRate: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="환율 기준일">
                      <input
                        type="date"
                        value={draft.exchangeRateDate}
                        onChange={(event) =>
                          setDraft({ ...draft, exchangeRateDate: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                </Form>
              </>
            )}
          </fieldset>
        </section>
      </div>
      {leave && (
        <Confirm
          title="작성 내용 버리기"
          confirmLabel="버리고 이동"
          cancelLabel="계속 작성"
          onClose={() => setLeave(null)}
          onConfirm={async () => {
            const next = leave;
            setLeave(null);
            next.proceed();
          }}
        >
          <p>
            저장하거나 제출하지 않은 입력이 있습니다. 이동하면 이 화면의 작성 내용과 암호 입력이
            지워집니다.
          </p>
        </Confirm>
      )}
      {restore && (
        <Confirm
          title="현재 데이터를 백업으로 교체"
          confirmLabel="전체 복원 실행"
          onClose={() => setRestore(false)}
          onConfirm={async () => {
            if (!backupFile || !restoreOwnerPassword || !restorePassword)
              throw Error('복원할 파일과 현재 소유자 비밀번호, 백업 암호를 다시 확인해 주세요.');
            await operation(async () => {
              await api('/backups/restore', 'POST', {
                password: restorePassword,
                ownerPassword: restoreOwnerPassword,
                backup: backupFile,
              });
              setBackupFile(null);
              setBackupName('');
              setRestorePassword('');
              setRestoreOwnerPassword('');
              setRestore(false);
              await finishSession(
                '복원을 완료했습니다. 다시 로그인하고 클라이언트 키를 새로 발급해 주세요.',
              );
            });
          }}
        >
          <p>
            ‘{backupName}’의 내용으로 현재 보관함의 모든 키와 이전 버전, 프로젝트, 알림, 설정,
            게이트웨이와 사용 기록을 교체합니다. 현재 데이터와 합치지 않습니다.
          </p>
          <p>
            현재 소유자 계정과 비밀번호는 유지하고, 기존 세션과 클라이언트 키는 폐기합니다. 복원 후
            다시 로그인하고 서버 중계에 쓰는 클라이언트 키를 새로 발급해야 합니다.
          </p>
          <p>암호가 틀리거나 파일 검증에 실패하면 기존 데이터는 변경하지 않습니다.</p>
        </Confirm>
      )}
    </>
  );
}
