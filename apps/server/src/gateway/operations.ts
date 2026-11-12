import { createHash } from 'node:crypto';
import type { GatewayOperationRule, UsageProvider, UsageRecord } from '@keydesk/contracts';

const providers = new Map<string, UsageProvider>([
  ['https://maps.apigw.ntruss.com', 'naver-maps'],
  ['https://naveropenapi.apigw.ntruss.com', 'naver-maps'],
  ['https://dapi.kakao.com', 'kakao-local'],
  ['https://apis-navi.kakaomobility.com', 'kakao-mobility'],
  ['https://openrouter.ai', 'openrouter'],
  ['https://generativelanguage.googleapis.com', 'gemini'],
  ['https://api.openai.com', 'openai'],
  ['https://api.anthropic.com', 'anthropic'],
]);
const naver = new Map([
  ['/map-geocode/v2/geocode', '주소 → 좌표 (Geocoding)'],
  ['/map-reversegeocode/v2/gc', '좌표 → 주소 (Reverse Geocoding)'],
]);
const kakao = new Map([
  ['/v2/local/search/address', '주소 검색'],
  ['/v2/local/search/keyword', '키워드 검색'],
  ['/v2/local/search/category', '카테고리 검색'],
]);
const placeholder = /^\{[A-Za-z][\w-]*\}$/;
const split = (path: string) => (path === '/' ? [] : path.slice(1).split('/'));
const rank = (segments: string[]) => segments.filter((s) => !placeholder.test(s)).length;
const id = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

export function usageProvider(url: URL): UsageProvider | undefined {
  return providers.get(url.origin);
}

export function usageOriginId(url: URL): string {
  return id([url.origin]);
}

export function validOperationPath(path: string): boolean {
  return (
    path.startsWith('/') &&
    split(path).every(
      (s) => placeholder.test(s) || (/^[A-Za-z0-9._~:-]+$/.test(s) && s !== '.' && s !== '..'),
    )
  );
}

export function ambiguousOperations(rules: GatewayOperationRule[]): boolean {
  const segments = rules.map((rule) => split(rule.path));
  return rules.some((rule, i) =>
    rules.slice(0, i).some((prior, j) => {
      const a = segments[i]!;
      const b = segments[j]!;
      return (
        rule.method === prior.method &&
        a.length === b.length &&
        rank(a) === rank(b) &&
        a.every((s, k) => s === b[k] || placeholder.test(s) || placeholder.test(b[k]!))
      );
    }),
  );
}

export function classifyOperation(
  url: URL,
  method: string,
  rules: GatewayOperationRule[] = [],
): UsageRecord['operation'] {
  const parts = split(url.pathname);
  const matching = rules
    .map((rule) => ({ rule, segments: split(rule.path) }))
    .filter(
      ({ rule, segments }) =>
        rule.method === method &&
        parts.length === segments.length &&
        segments.every((s, i) => s === parts[i] || (placeholder.test(s) && !!parts[i])),
    )
    .sort((a, b) => rank(b.segments) - rank(a.segments))[0];
  if (matching && rank(matching.segments) === parts.length)
    return { id: id([url.origin, method, matching.rule.path]), name: matching.rule.name };
  if (method === 'GET') {
    const provider = usageProvider(url);
    const path =
      provider === 'kakao-local' ? url.pathname.replace(/\.(json|xml)$/, '') : url.pathname;
    const name =
      provider === 'naver-maps'
        ? naver.get(path)
        : provider === 'kakao-local' && path !== url.pathname
          ? kakao.get(path)
          : undefined;
    if (name) return { id: id([url.origin, method, path]), name };
  }
  if (!matching) return undefined;
  return {
    id: id([url.origin, method, ...matching.segments.map((s) => (placeholder.test(s) ? '{}' : s))]),
    name: matching.rule.name,
  };
}
