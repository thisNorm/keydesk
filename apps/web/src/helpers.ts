import type { Entry, EntryDraft, Project } from '@keydesk/contracts';
export const emptyDraft = (): EntryDraft => ({
  name: '',
  provider: '',
  description: '',
  websiteUrl: '',
  consoleUrl: '',
  docsUrl: '',
  endpointUrl: '',
  owner: '',
  tags: [],
  plan: '',
  quota: '',
  notes: '',
  projectIds: [],
  credentials: [],
});
export function calendarDay(date: Date, zone = 'Asia/Seoul'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map((key) => parts.find((p) => p.type === key)!.value).join('-');
}
export function validDate(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return (
      Number(value.slice(0, 4)) >= 1900 &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value))
    return false;
  return (
    validDate(value.slice(0, 10)) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60 &&
    (!value.slice(16).startsWith(':') || Number(value.slice(17, 19)) < 60) &&
    Number.isFinite(Date.parse(value))
  );
}
export function expiryDays(value: string, now = new Date(), zone = 'Asia/Seoul'): number | null {
  if (!validDate(value)) return null;
  const day = value.length === 10 ? value : calendarDay(new Date(value), zone),
    days = Math.round((Date.parse(day) - Date.parse(calendarDay(now, zone))) / 86400000);
  return value.length > 10 && Date.parse(value) <= now.getTime() ? Math.min(-1, days) : days;
}
export function expiryText(value: string, zone = 'Asia/Seoul', now = new Date()): string {
  const days = expiryDays(value, now, zone);
  if (days === null) return '만료일 없음';
  if (value.length > 10 && Date.parse(value) <= now.getTime()) return '만료됨';
  return days < 0 ? `${-days}일 전 만료` : days === 0 ? '오늘 만료' : `${days}일 후`;
}
export function searchEntries(entries: Entry[], query: string, projects: Project[]): Entry[] {
  const q = query.trim().normalize('NFC').toLocaleLowerCase('ko');
  return entries.filter((e) =>
    [
      e.name,
      e.provider,
      e.description,
      e.owner,
      e.notes,
      ...e.credentials.map((credential) => credential.label),
      ...e.tags,
      ...projects.filter((p) => e.projectIds.includes(p.id)).map((p) => p.name),
    ]
      .join(' ')
      .normalize('NFC')
      .toLocaleLowerCase('ko')
      .includes(q),
  );
}
export function parseEnv(text: string): {
  rows: {
    line: number;
    name: string;
    value: string;
  }[];
  errors: {
    line: number;
    message: string;
  }[];
} {
  const rows: {
      line: number;
      name: string;
      value: string;
    }[] = [],
    errors: {
      line: number;
      message: string;
    }[] = [],
    seen = new Set<string>();
  if (text.length > 1024 * 1024)
    return { rows, errors: [{ line: 0, message: '파일은 1MB 이하로 선택해 주세요.' }] };
  for (const [index, source] of text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    const line = index + 1,
      raw = source.trim();
    if (!raw || raw.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!match) {
      errors.push({ line, message: '변수 이름=값 형식이 필요합니다.' });
      continue;
    }
    const name = match[1]!,
      rest = match[2]!;
    let value = rest;
    if (seen.has(name)) {
      errors.push({ line, message: `${name}: 중복된 변수입니다.` });
      continue;
    }
    seen.add(name);
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const quote = rest[0]!;
      let end = -1;
      for (let i = 1; i < rest.length; i++)
        if (rest[i] === quote && (quote === "'" || rest[i - 1] !== '\\')) {
          end = i;
          break;
        }
      if (end < 0 || !/^\s*(?:#.*)?$/.test(rest.slice(end + 1))) {
        errors.push({ line, message: '따옴표를 닫고 뒤의 내용을 확인해 주세요.' });
        continue;
      }
      value = rest.slice(1, end);
    } else value = rest.replace(/\s+#.*$/, '').trimEnd();
    if (!value) {
      errors.push({ line, message: `${name}: 빈 인증값입니다.` });
      continue;
    }
    rows.push({ line, name, value });
  }
  if (rows.length > 200)
    errors.push({ line: 0, message: '한 번에 200개 이하로 가져올 수 있습니다.' });
  return { rows, errors };
}
export function validateDraft(draft: EntryDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('항목 이름을 입력해 주세요.');
  for (const [index, key] of (draft.credentials ?? []).entries()) {
    if (!key.label.trim()) errors.push(`${index + 1}번 키 이름을 입력해 주세요.`);
    if (!key.id && !key.value) errors.push(`${index + 1}번 새 인증값을 입력해 주세요.`);
    if ([key.issuedAt, key.expiresAt].some((d) => d && !validDate(d)))
      errors.push(`${index + 1}번 키 날짜를 확인해 주세요.`);
    if (
      key.issuedAt &&
      key.expiresAt &&
      (key.issuedAt.length > 10 && key.expiresAt.length > 10
        ? Date.parse(key.expiresAt) < Date.parse(key.issuedAt)
        : key.expiresAt.slice(0, 10) < key.issuedAt.slice(0, 10))
    )
      errors.push(`${index + 1}번 키 만료일은 발급일 이후여야 합니다.`);
  }
  for (const field of ['websiteUrl', 'consoleUrl', 'docsUrl', 'endpointUrl'] as const)
    if (draft[field]) {
      try {
        if (!['http:', 'https:'].includes(new URL(draft[field]).protocol)) throw Error();
      } catch {
        errors.push('주소는 http:// 또는 https://로 입력해 주세요.');
      }
    }
  return errors;
}
export function formatMoney(amount: number | null, currency: string): string {
  if (amount === null) return '미확인';
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 6,
    }).format(amount / 1000000);
  } catch {
    return `${(amount / 1000000).toLocaleString('ko-KR', { maximumFractionDigits: 6 })} ${currency}`;
  }
}
export function formatExactMoney(amount: string | null, currency: string): string {
  if (amount === null || !/^\d+(?:\.\d+)?$/.test(amount)) return '미확인';
  const [integer, fraction = ''] = amount.split('.'),
    padded = integer!.padStart(7, '0');
  const whole = padded
      .slice(0, -6)
      .replace(/^0+(?=\d)/, '')
      .replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    decimal = (padded.slice(-6) + fraction).replace(/0+$/, '');
  return `${currency} ${whole}${decimal ? '.' + decimal : ''}`;
}

export function usageCost(record: import('@keydesk/contracts').UsageRecord): string {
  const extended = record;
  if (extended.costStatus === 'unsupported-cache-write') return '미확인 (캐시 쓰기 단가 미지원)';
  if (extended.costStatus === 'unpriced') return '미확인 (모델 단가 없음)';
  if (extended.costStatus === 'unknown-usage') return '미확인 (토큰 사용량 없음)';
  if (
    record.currency &&
    extended.costExactMicros !== null &&
    extended.costExactMicros !== undefined
  )
    return `${extended.costStatus === 'overflow' ? '표시 범위 초과 · ' : ''}${formatExactMoney(extended.costExactMicros, record.currency)}`;
  return record.currency
    ? formatMoney(record.costMicros, record.currency) + (record.costMicros === 0 ? ' (반올림)' : '')
    : '미확인';
}

export function routePayload(
  draft: import('@keydesk/contracts').GatewayRouteDraft,
): import('@keydesk/contracts').GatewayRouteDraft {
  if (draft.adapter === 'generic') return draft;
  const { authHeader, authScheme, ...providerDraft } = draft;
  return providerDraft;
}

export function firstExpiry(
  credentials: { status: string; expiresAt: string }[],
  zone: string,
): string {
  return (
    credentials
      .filter((c) => c.status === 'active' && validDate(c.expiresAt))
      .map((c) => c.expiresAt)
      .sort((a, b) => {
        if (a.length > 10 && b.length > 10) return Date.parse(a) - Date.parse(b);
        const ad = a.length === 10 ? a : calendarDay(new Date(a), zone),
          bd = b.length === 10 ? b : calendarDay(new Date(b), zone);
        return ad.localeCompare(bd) || (a.length === 10 ? 1 : 0) - (b.length === 10 ? 1 : 0);
      })[0] ?? ''
  );
}

export function formatCredentialDate(value: string, zone = 'Asia/Seoul'): string {
  if (!validDate(value)) return '날짜 확인 필요';
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  if (value.length === 10)
    return new Intl.DateTimeFormat('ko-KR', { ...dateOptions, timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`),
    );
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    ...dateOptions,
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    ...(new Date(value).getUTCMilliseconds() ? { fractionalSecondDigits: 3 as const } : {}),
  });
  const label =
    formatter.resolvedOptions().timeZone === 'Asia/Seoul' ? '한국 시간' : `${zone} 기준`;
  return `${formatter.format(new Date(value))} (${label})`;
}

export type VaultFilter = 'all' | 'expiring' | 'expired' | 'unset';
export type VaultSort = 'expiry' | 'name' | 'updated';
export function matchesVaultFilter(entry: Entry, filter: VaultFilter, zone: string, now = new Date()): boolean {
  if (filter === 'all') return true;
  if (filter === 'unset' && entry.credentials.length === 0) return true;
  return entry.credentials.some((credential) => {
    if (credential.status !== 'active') return false;
    const days = expiryDays(credential.expiresAt, now, zone);
    return filter === 'unset' ? !credential.expiresAt : filter === 'expired' ? days !== null && days < 0 : days !== null && days >= 0 && days <= 30;
  });
}
export function vaultExpiry(entry: Entry, filter: VaultFilter, zone: string, now = new Date()): string {
  if (filter === 'unset') return '';
  const credentials = entry.credentials.filter((credential) => {
    if (filter === 'all') return true;
    const days = expiryDays(credential.expiresAt, now, zone);
    return filter === 'expired' ? days !== null && days < 0 : days !== null && days >= 0 && days <= 30;
  });
  return firstExpiry(credentials, zone);
}
export function visibleVaultEntries(entries: Entry[], projects: Project[], options: { query: string; project: string; filter: VaultFilter; sort: VaultSort; zone: string; now?: Date }): Entry[] {
  const now = options.now ?? new Date();
  return searchEntries(entries, options.query, projects)
    .filter((entry) => (!options.project || entry.projectIds.includes(options.project)) && matchesVaultFilter(entry, options.filter, options.zone, now))
    .sort((a, b) => {
      if (options.sort === 'name') return a.name.localeCompare(b.name, 'ko');
      if (options.sort === 'updated') return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'ko');
      const ad = vaultExpiry(a, options.filter, options.zone, now), bd = vaultExpiry(b, options.filter, options.zone, now);
      if (!ad || !bd) return (!ad ? 1 : 0) - (!bd ? 1 : 0) || a.name.localeCompare(b.name, 'ko');
      const aDay = ad.length === 10 ? ad : calendarDay(new Date(ad), options.zone);
      const bDay = bd.length === 10 ? bd : calendarDay(new Date(bd), options.zone);
      if (aDay !== bDay) return aDay.localeCompare(bDay);
      if (ad.length === 10 || bd.length === 10) return (ad.length === 10 ? 1 : 0) - (bd.length === 10 ? 1 : 0) || a.name.localeCompare(b.name, 'ko');
      return Date.parse(ad) - Date.parse(bd) || a.name.localeCompare(b.name, 'ko');
    });
}
export function parseVaultPreferences(raw: string | null): { filter: VaultFilter; sort: VaultSort } {
  try {
    const value = JSON.parse(raw ?? '{}');
    return { filter: value && ['all', 'expiring', 'expired', 'unset'].includes(value.filter) ? value.filter : 'all', sort: value && ['expiry', 'name', 'updated'].includes(value.sort) ? value.sort : 'expiry' };
  } catch { return { filter: 'all', sort: 'expiry' }; }
}
