import type { EncryptedBackup, Settings } from '@keydesk/contracts';

export type SettingsSection = 'general' | 'mail' | 'server';

export function withoutSmtpPassword(settings: Settings): Settings {
  const { password: _password, ...smtp } = settings.smtp;
  return { ...settings, smtp };
}

export function settingsPayload(
  saved: Settings,
  draft: Settings,
  section: SettingsSection,
  smtpPassword = '',
): Settings {
  const base = withoutSmtpPassword(saved);
  if (section === 'general') return { ...base, timeZone: draft.timeZone };
  if (section === 'server')
    return {
      ...base,
      retentionDays: draft.retentionDays,
      krwExchangeRate: draft.krwExchangeRate,
      exchangeRateDate: draft.exchangeRateDate,
    };
  return {
    ...base,
    ...(draft.mailAlerts ? { mailAlerts: draft.mailAlerts } : {}),
    smtp: {
      ...withoutSmtpPassword(draft).smtp,
      ...(smtpPassword ? { password: smtpPassword } : {}),
    },
  };
}

export function settingsSectionDirty(
  saved: Settings,
  draft: Settings,
  section: SettingsSection,
  smtpPassword = '',
) {
  return (
    JSON.stringify(withoutSmtpPassword(saved)) !==
    JSON.stringify(settingsPayload(saved, draft, section, smtpPassword))
  );
}

export function validateBackupFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw Error('내용이 있는 백업 파일을 선택해 주세요.');
  if (size > 24 * 1024 * 1024) throw Error('백업 파일은 24MB 이하로 선택해 주세요.');
}

export function parseBackupFile(text: string): EncryptedBackup {
  try {
    const parsed = JSON.parse(text);
    const keys = ['format', 'version', 'kdf', 'salt', 'iv', 'tag', 'data'];
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== keys.length ||
      Object.keys(parsed).some((key) => !keys.includes(key)) ||
      parsed.format !== 'keydesk-backup' ||
      parsed.version !== 1 ||
      parsed.kdf !== 'scrypt-131072-8-1'
    )
      throw Error();
    for (const [key, bytes] of [
      ['salt', 16],
      ['iv', 12],
      ['tag', 16],
    ] as const) {
      if (typeof parsed[key] !== 'string') throw Error();
      const decoded = atob(parsed[key]);
      if (decoded.length !== bytes || btoa(decoded) !== parsed[key]) throw Error();
    }
    const data = parsed.data;
    if (
      typeof data !== 'string' ||
      !data.length ||
      data.length > Math.ceil((16 * 1024 * 1024) / 3) * 4 + 4 ||
      data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    )
      throw Error();
    const bytes = (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (bytes > 16 * 1024 * 1024) throw Error();
    return parsed as EncryptedBackup;
  } catch {
    throw Error('지원하는 Keydesk 백업 파일이 아닙니다.');
  }
}
