import type { AuthState } from '@keydesk/contracts';
let csrfToken = '';
let unauthorized = () => {};
export function setAuth(state: AuthState) {
  csrfToken = state.csrfToken ?? '';
}
export function onUnauthorized(fn: () => void) {
  unauthorized = fn;
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrfToken }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error('서버에 연결할 수 없습니다. 연결 상태를 확인해 주세요.');
  });
  if (response.status === 401 && !['/auth/login', '/auth/setup', '/auth/state'].includes(path)) {
    const state = await fetch('/api/auth/state', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (state && !state.authenticated) unauthorized();
  }
  const result = await response.json().catch(() => ({ message: '서버 응답을 읽을 수 없습니다.' }));
  if (!response.ok)
    throw new Error(
      typeof result.message === 'string' ? result.message : '요청을 처리하지 못했습니다.',
    );
  return result as T;
}
export async function copyText(value: string, isCurrent = () => true): Promise<boolean> {
  if (!isCurrent()) return false;
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* 아래의 선택 복사로 재시도 */
  }
  if (!isCurrent()) return false;
  const previous = document.activeElement as HTMLElement | null,
    area = document.createElement('textarea');
  area.value = value;
  area.className = 'clipboard-fallback';
  area.setAttribute('aria-label', '복사할 값');
  (previous?.closest('dialog[open]') ?? document.body).append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    /* 직접 선택 안내 */
  }
  area.value = '';
  area.remove();
  previous?.focus();
  return copied;
}
