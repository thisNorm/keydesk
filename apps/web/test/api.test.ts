import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, setAuth, onUnauthorized } from '../src/api.ts';
test('변경 요청에만 세션의 CSRF 토큰을 보내고 credentials와 no-store를 지정한다', async () => {
  const original = globalThis.fetch;
  const calls: {
    path: string;
    options: RequestInit;
  }[] = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path: String(path), options: options! });
    return new Response('{}', { status: 200 });
  };
  try {
    setAuth({ initialized: true, authenticated: true, csrfToken: 'test-csrf' });
    await api('/entries', 'POST', { name: '한국어' });
    await api('/entries');
    assert.equal(calls[0]!.options.credentials, 'same-origin');
    assert.equal(calls[0]!.options.cache, 'no-store');
    assert.equal(
      (calls[0]!.options.headers as Record<string, string>)['X-CSRF-Token'],
      'test-csrf',
    );
    assert.equal((calls[1]!.options.headers as Record<string, string>)['X-CSRF-Token'], undefined);
    assert.equal(calls[0]!.options.body, JSON.stringify({ name: '한국어' }));
  } finally {
    globalThis.fetch = original;
  }
});
test('재인증 실패 401은 활성 세션을 지우지 않는다', async () => {
  const original = globalThis.fetch;
  let locked = false;
  onUnauthorized(() => {
    locked = true;
  });
  globalThis.fetch = async (path) =>
    String(path).endsWith('/auth/state')
      ? new Response(JSON.stringify({ initialized: true, authenticated: true }))
      : new Response(JSON.stringify({ message: '소유자 비밀번호가 올바르지 않습니다.' }), {
          status: 401,
        });
  try {
    await assert.rejects(api('/backups/restore', 'POST', {}), /비밀번호/);
    assert.equal(locked, false);
  } finally {
    globalThis.fetch = original;
  }
});
test('세션이 실제로 만료되면 잠금 상태로 이동한다', async () => {
  const original = globalThis.fetch;
  let locked = false;
  onUnauthorized(() => {
    locked = true;
  });
  globalThis.fetch = async (path) =>
    String(path).endsWith('/auth/state')
      ? new Response(JSON.stringify({ initialized: true, authenticated: false }))
      : new Response(JSON.stringify({ message: '로그인이 필요합니다.' }), { status: 401 });
  try {
    await assert.rejects(api('/entries'), /로그인/);
    assert.equal(locked, true);
  } finally {
    globalThis.fetch = original;
  }
});
