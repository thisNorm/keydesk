import { useEffect, useState } from 'react';
import type { Settings, AuthState, EncryptedBackup } from '@keydesk/contracts';
import { api } from './api.ts';
import { Confirm, Field, Form } from './ui.tsx';
export function SettingsPage({
  notify,
  onAuth,
  onSaved,
}: {
  notify: (s: string) => void;
  onAuth: (a: AuthState) => void;
  onSaved: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(''),
    [backupPassword, setBackupPassword] = useState(''),
    [ownerPassword, setOwnerPassword] = useState(''),
    [backup, setBackup] = useState<EncryptedBackup | null>(null),
    [backupName, setBackupName] = useState(''),
    [restore, setRestore] = useState(false),
    [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [mailBusy, setMailBusy] = useState(false);
  useEffect(() => {
    void api<{
      settings: Settings;
    }>('/settings')
      .then((x) => setSettings(x.settings))
      .catch((e) => setError(e.message));
  }, []);
  async function download() {
    if (!backupPassword || !ownerPassword)
      throw Error('소유자 비밀번호와 백업 암호를 입력해 주세요.');
    const result = await api<{
      backup: EncryptedBackup;
    }>('/backups', 'POST', { password: backupPassword, ownerPassword });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result.backup)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `keydesk-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupPassword('');
    setOwnerPassword('');
    notify('암호화 백업을 내려받았습니다. 서버 밖에도 안전하게 보관해 주세요.');
  }
  if (!settings) return <p role={error ? 'alert' : 'status'}>{error || '설정을 불러오는 중…'}</p>;
  const smtp = (key: string, value: unknown) =>
    setSettings((s) => (s ? { ...s, smtp: { ...s.smtp, [key]: value } } : s));
  return (
    <>
      <header className="pagehead">
        <h1>설정</h1>
      </header>
      <div className="settings-page">
        <section>
          <h2>보관과 날짜</h2>
          <Form
            onSubmit={async () => {
              const result = await api<{
                settings: Settings;
              }>('/settings', 'PUT', settings);
              setSettings(result.settings);
              await onSaved();
              notify('설정을 저장했습니다.');
            }}
          >
            <div className="form-grid">
              <Field label="시간대" hint="만료일과 일일 사용량의 날짜 기준입니다.">
                <input
                  required
                  value={settings.timeZone}
                  placeholder="Asia/Seoul"
                  onChange={(e) => setSettings({ ...settings, timeZone: e.target.value })}
                />
              </Field>
              <Field label="호출 기록 보존 (일)">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  required
                  value={settings.retentionDays}
                  onChange={(e) =>
                    setSettings({ ...settings, retentionDays: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="USD 1달러당 원화 환율" hint="USD 비용의 원화 추정에만 적용합니다.">
                <input
                  required
                  inputMode="decimal"
                  value={settings.krwExchangeRate}
                  onChange={(e) => setSettings({ ...settings, krwExchangeRate: e.target.value })}
                />
              </Field>
              <Field label="환율 기준일">
                <input
                  type="date"
                  value={settings.exchangeRateDate}
                  onChange={(e) => setSettings({ ...settings, exchangeRateDate: e.target.value })}
                />
              </Field>
            </div>
            <h2>선택 SMTP 메일</h2>
            <p className="muted">
              메일을 설정하지 않아도 앱의 만료 알림은 유지됩니다. 메일에는 인증값을 넣지 않습니다.
            </p>
            <div className="form-grid">
              <Field label="SMTP 서버">
                <input value={settings.smtp.host} onChange={(e) => smtp('host', e.target.value)} />
              </Field>
              <Field label="포트">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={settings.smtp.port}
                  onChange={(e) => smtp('port', Number(e.target.value))}
                />
              </Field>
              <Field label="사용자 이름">
                <input
                  autoComplete="off"
                  value={settings.smtp.user}
                  onChange={(e) => smtp('user', e.target.value)}
                />
              </Field>
              <Field
                label="SMTP 비밀번호"
                hint={
                  settings.smtp.passwordConfigured
                    ? '저장되어 있습니다. 비워 두면 유지합니다.'
                    : '설정되지 않았습니다.'
                }
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={settings.smtp.password ?? ''}
                  onChange={(e) => smtp('password', e.target.value || undefined)}
                />
              </Field>
              <Field label="보내는 주소">
                <input
                  type="email"
                  value={settings.smtp.from}
                  onChange={(e) => smtp('from', e.target.value)}
                />
              </Field>
              <Field label="받는 주소">
                <input
                  type="email"
                  value={settings.smtp.to}
                  onChange={(e) => smtp('to', e.target.value)}
                />
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.smtp.secure}
                onChange={(e) => smtp('secure', e.target.checked)}
              />
              연결 시작부터 TLS 사용
            </label>
          </Form>
          <button
            disabled={mailBusy}
            onClick={async () => {
              setMailBusy(true);
              try {
                await api('/settings/smtp/test', 'POST');
                notify('저장된 받는 주소로 테스트 메일을 보냈습니다.');
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setMailBusy(false);
              }
            }}
          >
            {mailBusy ? '전송 중…' : '저장된 설정으로 테스트 메일 보내기'}
          </button>
        </section>
        <section>
          <h2>암호화 백업과 전체 복원</h2>
          <p>
            백업에는 모든 키 버전과 관리 데이터가 포함됩니다. 백업 암호는 파일을 복원할 때 필요하며
            분실하면 복구할 수 없습니다.
          </p>
          <Form label="암호화 백업 내려받기" onSubmit={download}>
            <div className="form-grid">
              <Field label="현재 소유자 비밀번호">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
              </Field>
              <Field label="백업 파일 암호">
                <input
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                />
              </Field>
            </div>
            <Field label="복원할 암호화 백업 파일">
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  setBackup(null);
                  setBackupName('');
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 32 * 1024 * 1024) {
                    notify('백업 파일은 32MB 이하로 선택해 주세요.');
                    return;
                  }
                  try {
                    const parsed = JSON.parse(await file.text());
                    if (parsed.format !== 'keydesk-backup' || parsed.version !== 1) throw Error();
                    setBackup(parsed);
                    setBackupName(file.name);
                  } catch {
                    notify('지원하는 Keydesk 백업 파일이 아닙니다.');
                  }
                }}
              />
            </Field>
          </Form>
          {backup && (
            <button className="danger-text" onClick={() => setRestore(true)}>
              ‘{backupName}’으로 전체 복원…
            </button>
          )}
        </section>
        <section>
          <h2>소유자 비밀번호 변경</h2>
          <Form
            label="비밀번호 변경"
            onSubmit={async () => {
              await api('/auth/password', 'POST', { currentPassword, newPassword });
              setCurrentPassword('');
              setNewPassword('');
              onAuth(await api<AuthState>('/auth/state'));
              notify('비밀번호를 변경했습니다. 다시 로그인해 주세요.');
            }}
          >
            <div className="form-grid">
              <Field label="현재 비밀번호">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </Field>
              <Field label="새 비밀번호 (12자 이상)">
                <input
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
            </div>
          </Form>
        </section>
      </div>
      {restore && (
        <Confirm
          title="전체 데이터 복원"
          onClose={() => setRestore(false)}
          onConfirm={async () => {
            if (!ownerPassword || !backupPassword)
              throw Error('설정 화면에서 현재 비밀번호와 백업 암호를 입력해 주세요.');
            await api('/backups/restore', 'POST', {
              password: backupPassword,
              ownerPassword,
              backup,
            });
            setBackup(null);
            setBackupPassword('');
            setOwnerPassword('');
            setRestore(false);
            onAuth(await api<AuthState>('/auth/state'));
            notify('복원을 완료했습니다. 다시 로그인하고 클라이언트 키를 새로 발급해 주세요.');
          }}
        >
          <p>
            현재 보관함·프로젝트·설정·게이트웨이와 사용 기록을 ‘{backupName}’의 내용으로 교체합니다.
            현재 소유자 계정은 유지하고 기존 세션과 클라이언트 키는 폐기합니다.
          </p>
          <p>잘못된 파일이나 암호는 기존 데이터를 변경하지 않습니다.</p>
        </Confirm>
      )}
    </>
  );
}
