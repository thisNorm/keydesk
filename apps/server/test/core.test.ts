import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
const origin = 'http://localhost:8088';
const password = 'correct horse battery staple';
async function fixture(t: any, now?: () => Date) {
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-core-'));
  const app = await createApp({ dataDir, origin, now, backgroundJobs: false });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { app, dataDir };
}
async function owner(app: any, dataDir: string) {
  const token = (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: { origin },
    payload: { token, name: '소유자', password },
  });
  assert.equal(res.statusCode, 200, res.body);
  const cookie = res.headers['set-cookie'].split(';')[0];
  const csrf = res.json().csrfToken;
  return { cookie, csrf, headers: { origin, cookie, 'x-csrf-token': csrf } };
}
function draft(value = 'provider-secret-unique', expiresAt = '2026-12-05') {
  return {
    name: '한글 서비스',
    provider: '제공사',
    description: '설명',
    websiteUrl: '',
    consoleUrl: '',
    docsUrl: '',
    endpointUrl: '',
    owner: '나',
    tags: ['개인'],
    plan: '',
    quota: '',
    notes: '',
    projectIds: [],
    credentials: [
      {
        label: '운영',
        value,
        status: 'active',
        issuedAt: '2026-11-01',
        expiresAt,
      },
    ],
  };
}
test('additional gateway auth references prevent unlink and deletion and survive validated backups', async (t) => {
  const { derive, decrypt, encrypt } = await import('../src/crypto.ts');
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const project = (
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: auth.headers,
      payload: { name: '연결 테스트' },
    })
  ).json().project;
  const entries: any[] = [];
  const providerUsageMeters = [
    {
      name: '일일 요청',
      scope: 'Maps 앱 · 주소 검색',
      period: '2026-11-11 (KST)',
      unit: '회',
      used: '0',
      max: '1000',
      limitStatus: 'set',
      checkedAt: '2026-11-11T05:00:00Z',
    },
  ];
  for (const name of ['대표 키', '보조 키']) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/entries',
      headers: auth.headers,
      payload: {
        ...draft(name + '-dummy-secret'),
        name,
        projectIds: [project.id],
        ...(name === '대표 키' ? { providerUsageMeters } : {}),
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    entries.push(response.json().entry);
  }
  const authBindings = entries.map((entry, i) => ({
    credentialId: entry.credentials[0].id,
    location: 'header',
    name: i ? 'X-Client-ID' : 'X-Client-Secret',
  }));
  const response = await app.inject({
    method: 'POST',
    url: '/api/gateway/routes',
    headers: auth.headers,
    payload: {
      name: '복수 인증',
      slug: 'paired',
      projectId: project.id,
      credentialId: authBindings[0].credentialId,
      baseUrl: 'https://api.example.com/',
      allowedMethods: ['GET'],
      adapter: 'generic',
      enabled: true,
      allowPrivateNetwork: false,
      authBindings,
      detectJsonError: true,
      operationRules: [{ name: '조회', method: 'GET', path: '/search' }],
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  const route = response.json().route;
  assert.deepEqual(route.authBindings, authBindings);
  const secondary = entries[1];
  for (const request of [
    {
      method: 'PUT' as const,
      url: `/api/entries/${secondary.id}`,
      payload: { ...secondary, projectIds: [] },
    },
    { method: 'DELETE' as const, url: `/api/entries/${secondary.id}` },
    {
      method: 'PUT' as const,
      url: `/api/entries/${secondary.id}`,
      payload: { ...secondary, credentials: [] },
    },
  ]) {
    assert.equal((await app.inject({ ...request, headers: auth.headers })).statusCode, 409);
  }
  const backupResponse = await app.inject({
    method: 'POST',
    url: '/api/backups',
    headers: auth.headers,
    payload: { password: 'backup-passphrase', ownerPassword: password },
  });
  assert.equal(backupResponse.statusCode, 200, backupResponse.body);
  const backup = backupResponse.json().backup;
  const key = await derive('backup-passphrase', Buffer.from(backup.salt, 'base64'));
  const logical = JSON.parse(decrypt(JSON.stringify(backup), key, 'keydesk-backup:1'));
  const malformed = JSON.parse(logical.tables.gateway_routes[0].json);
  malformed.authBindings[1].credentialId = '00000000-0000-4000-8000-000000000000';
  logical.tables.gateway_routes[0].json = JSON.stringify(malformed);
  const sealed = JSON.parse(encrypt(JSON.stringify(logical), key, 'keydesk-backup:1'));
  key.fill(0);
  const rejected = await app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: auth.headers,
    payload: {
      password: 'backup-passphrase',
      ownerPassword: password,
      backup: { ...backup, ...sealed },
    },
  });
  assert.equal(rejected.statusCode, 400, rejected.body);
  const restored = await app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: auth.headers,
    payload: { password: 'backup-passphrase', ownerPassword: password, backup },
  });
  assert.equal(restored.statusCode, 200, restored.body);
  const restoredRoute = JSON.parse(
    String(
      app.context.db.prepare('SELECT json FROM gateway_routes WHERE id=?').get(route.id)!.json,
    ),
  );
  assert.deepEqual(restoredRoute.authBindings, authBindings);
  assert.equal(restoredRoute.detectJsonError, true);
  assert.deepEqual(restoredRoute.operationRules, [
    { name: '조회', method: 'GET', path: '/search' },
  ]);
  const restoredEntry = app.context.db
    .prepare('SELECT json FROM entries WHERE id=?')
    .get(entries[0].id);
  assert.deepEqual(
    JSON.parse(String(restoredEntry!.json)).providerUsageMeters,
    providerUsageMeters,
  );
});
test('bootstrap is one use, origin is exact, session and CSRF stay separate from bearer tokens', async (t) => {
  const { app, dataDir } = await fixture(t);
  assert.deepEqual((await app.inject('/api/auth/state')).json(), {
    initialized: false,
    authenticated: false,
  });
  const token = (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim();
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { token, name: '나', password },
      })
    ).statusCode,
    403,
  );
  const auth = await owner(app, dataDir);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/usage/openrouter/missing',
        headers: { origin, authorization: 'Bearer gateway-key' },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/usage/openrouter/missing',
        headers: auth.headers,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        headers: { origin },
        payload: { token, name: '나', password },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        url: '/api/entries',
        headers: { authorization: 'Bearer gateway-key' },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { origin, cookie: auth.cookie },
        payload: { name: '프로젝트' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { ...auth.headers, origin: 'http://localhost:8088.evil' },
        payload: { name: '프로젝트' },
      })
    ).statusCode,
    403,
  );
  const res = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth.headers,
    payload: { name: '프로젝트' },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(auth.cookie, /keydesk_session=/);
  assert.match(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin },
        payload: { password },
      })
    ).headers['set-cookie'] as string,
    /HttpOnly/,
  );
});
test('vault encrypts SQLite values, lists metadata only, and preserves replacement versions', async (t) => {
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const created = await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: auth.headers,
    payload: draft(),
  });
  assert.equal(created.statusCode, 200, created.body);
  const entry = created.json().entry;
  const credential = entry.credentials[0];
  assert.equal(JSON.stringify(entry).includes('provider-secret'), false);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/credentials/${credential.id}/reveal`,
        headers: auth.headers,
        payload: {},
      })
    ).json().value,
    'provider-secret-unique',
  );
  const updated = {
    ...draft('replacement-secret'),
    credentials: [
      {
        ...draft().credentials[0],
        id: credential.id,
        value: 'replacement-secret',
      },
    ],
  };
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/entries/${entry.id}`,
        headers: auth.headers,
        payload: updated,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: `/api/credentials/${credential.id}/versions`,
        headers: auth.headers,
      })
    ).json().versions.length,
    2,
  );
  const reveal = await app.inject({
    method: 'POST',
    url: `/api/credentials/${credential.id}/reveal`,
    headers: auth.headers,
    payload: { version: 1 },
  });
  assert.equal(reveal.json().value, 'provider-secret-unique');
  assert.match(reveal.headers['cache-control'] as string, /no-store/);
  for (const name of ['keydesk.sqlite', 'keydesk.sqlite-wal']) {
    try {
      assert.equal(
        (await readFile(join(dataDir, name))).includes(Buffer.from('provider-secret-unique')),
        false,
      );
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
});
test('project references and batch import roll back without partial entries', async (t) => {
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const project = (
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: auth.headers,
      payload: { name: '내 프로젝트' },
    })
  ).json().project;
  const d = { ...draft(), projectIds: [project.id] };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/entries',
        headers: auth.headers,
        payload: d,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}`,
        headers: auth.headers,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/entries/import',
        headers: auth.headers,
        payload: {
          entries: [draft(), { ...draft(), projectIds: ['missing'] }],
        },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ url: '/api/entries', headers: auth.headers })).json().entries.length,
    1,
  );
});
test('expiry notifications are calendar correct at Seoul midnight and deduplicate disabled keys', async (t) => {
  let current = new Date('2028-02-28T14:59:59Z');
  const { app, dataDir } = await fixture(t, () => current);
  const auth = await owner(app, dataDir);
  const d = draft('secret', '2028-02-29');
  d.credentials[0].issuedAt = '2028-02-01';
  const entry = (
    await app.inject({
      method: 'POST',
      url: '/api/entries',
      headers: auth.headers,
      payload: d,
    })
  ).json().entry;
  await app.inject({
    method: 'POST',
    url: '/api/notifications/refresh',
    headers: auth.headers,
  });
  assert.equal(
    (await app.inject({ url: '/api/notifications', headers: auth.headers })).json().notifications
      .length,
    0,
  );
  current = new Date('2028-02-28T15:00:00Z');
  for (let i = 0; i < 2; i++)
    await app.inject({
      method: 'POST',
      url: '/api/notifications/refresh',
      headers: auth.headers,
    });
  assert.equal(
    (await app.inject({ url: '/api/notifications', headers: auth.headers })).json().notifications
      .length,
    1,
  );
  const paused = {
    ...d,
    credentials: [{ ...d.credentials[0], id: entry.credentials[0].id, status: 'paused' }],
  };
  await app.inject({
    method: 'PUT',
    url: `/api/entries/${entry.id}`,
    headers: auth.headers,
    payload: paused,
  });
  await app.inject({
    method: 'POST',
    url: '/api/notifications/refresh',
    headers: auth.headers,
  });
  assert.equal(
    (await app.inject({ url: '/api/notifications', headers: auth.headers })).json().notifications
      .length,
    0,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/entries',
        headers: auth.headers,
        payload: draft('bad', '2027-02-29'),
      })
    ).statusCode,
    400,
  );
});
test('logical encrypted backup restores under a different root key and wrong passwords preserve sessions', async (t) => {
  const a = await fixture(t);
  const b = await fixture(t);
  const authA = await owner(a.app, a.dataDir);
  const authB = await owner(b.app, b.dataDir);
  await a.app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: authA.headers,
    payload: draft(),
  });
  const response = await a.app.inject({
    method: 'POST',
    url: '/api/backups',
    headers: authA.headers,
    payload: { password: 'backup-passphrase', ownerPassword: password },
  });
  assert.equal(response.statusCode, 200, response.body);
  const backup = response.json().backup;
  assert.equal(JSON.stringify(backup).includes('provider-secret'), false);
  const request = (pw: string, bak: any = backup) =>
    b.app.inject({
      method: 'POST',
      url: '/api/backups/restore',
      headers: authB.headers,
      payload: { password: pw, ownerPassword: password, backup: bak },
    });
  assert.equal((await request('incorrect-password')).statusCode, 400);
  assert.equal(
    (await b.app.inject({ url: '/api/entries', headers: authB.headers })).statusCode,
    200,
  );
  assert.equal(
    (
      await request('backup-passphrase', {
        ...backup,
        data: 'x' + backup.data.slice(1),
      })
    ).statusCode,
    400,
  );
  assert.equal((await request('backup-passphrase')).statusCode, 200);
  assert.equal(
    (await b.app.inject({ url: '/api/entries', headers: authB.headers })).statusCode,
    401,
  );
  const login = await b.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { password },
  });
  const headers = {
    origin,
    cookie: (login.headers['set-cookie'] as string).split(';')[0],
    'x-csrf-token': login.json().csrfToken,
  };
  const entries = (await b.app.inject({ url: '/api/entries', headers })).json().entries;
  assert.equal(entries.length, 1);
  assert.equal(
    (
      await b.app.inject({
        method: 'POST',
        url: `/api/credentials/${entries[0].credentials[0].id}/reveal`,
        headers,
        payload: {},
      })
    ).json().value,
    'provider-secret-unique',
  );
});
test('existing database refuses startup without its root key', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-keyguard-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const app = await createApp({ dataDir, origin, backgroundJobs: false });
  await owner(app, dataDir);
  await app.close();
  await unlink(join(dataDir, 'root-key'));
  await assert.rejects(createApp({ dataDir, origin, backgroundJobs: false }), /루트/);
});
test('SMTP password is write-only and encrypted, password change invalidates all sessions', async (t) => {
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const settings = (await app.inject({ url: '/api/settings', headers: auth.headers })).json()
    .settings;
  const changed = {
    ...settings,
    smtp: { ...settings.smtp, password: 'smtp-sensitive-password' },
  };
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: auth.headers,
    payload: changed,
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().settings.smtp.passwordConfigured, true);
  assert.equal(JSON.stringify(saved.json()).includes('smtp-sensitive'), false);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: auth.headers,
        payload: {
          currentPassword: password,
          newPassword: 'another strong owner password',
        },
      })
    ).statusCode,
    200,
  );
  assert.equal((await app.inject({ url: '/api/entries', headers: auth.headers })).statusCode, 401);
});
test('first setup requires a loopback connection even with the correct Origin and token', async (t) => {
  const { app, dataDir } = await fixture(t);
  const token = (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim();
  const rejected = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    remoteAddress: '203.0.113.14',
    headers: { origin },
    payload: { token, name: '나', password },
  });
  assert.equal(rejected.statusCode, 403, rejected.body);
  const allowed = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    remoteAddress: '::ffff:127.0.0.1',
    headers: { origin },
    payload: { token, name: '나', password },
  });
  assert.equal(allowed.statusCode, 200, allowed.body);
});
test('date validation rejects normalized invalid timestamps and accepts leap-day offsets', async () => {
  const { validDate, expiryDays } = await import('../src/dates.ts');
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2027-02-29'), false);
  assert.equal(validDate('2028-02-29T24:00:00Z'), false);
  assert.equal(validDate('2028-02-29T23:59:59+09:00'), true);
  assert.equal(expiryDays('2028-02-29', new Date('2028-02-29T14:59:59Z'), 'Asia/Seoul'), 0);
  assert.equal(expiryDays('2028-02-29', new Date('2028-02-29T15:00:00Z'), 'Asia/Seoul'), -1);
});
test('backup envelope identifies fixed bounded scrypt parameters', async (t) => {
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const response = await app.inject({
    method: 'POST',
    url: '/api/backups',
    headers: auth.headers,
    payload: { password: 'backup-passphrase', ownerPassword: password },
  });
  assert.equal(response.json().backup.kdf, 'scrypt-131072-8-1');
});
test('concurrent failed login attempts reserve their rate-limit slots before password hashing', async (t) => {
  const { app, dataDir } = await fixture(t);
  await owner(app, dataDir);
  const responses = await Promise.all(
    Array.from({ length: 12 }, () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin },
        payload: { password: 'wrong owner password' },
      }),
    ),
  );
  assert.equal(responses.filter((res) => res.statusCode === 429).length, 2);
  assert.equal(responses.filter((res) => res.statusCode === 401).length, 10);
});
test('restore never materializes a plaintext candidate database on disk', async (t) => {
  const { watch } = await import('node:fs');
  const { setTimeout: wait } = await import('node:timers/promises');
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: auth.headers,
    payload: draft(),
  });
  const backup = (
    await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  const candidateEvents: string[] = [];
  const watcher = watch(dataDir, (_event, name) => {
    if (name?.startsWith('.restore-')) candidateEvents.push(name);
  });
  try {
    const restored = await app.inject({
      method: 'POST',
      url: '/api/backups/restore',
      headers: auth.headers,
      payload: {
        password: 'backup-passphrase',
        ownerPassword: password,
        backup,
      },
    });
    assert.equal(restored.statusCode, 200, restored.body);
    await wait(20);
    assert.deepEqual(candidateEvents, []);
  } finally {
    watcher.close();
  }
});
test('import updates an existing entry and preserves stored credential values atomically', async (t) => {
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const entry = (
    await app.inject({
      method: 'POST',
      url: '/api/entries',
      headers: auth.headers,
      payload: draft(),
    })
  ).json().entry;
  const credential = entry.credentials[0];
  const { value: _, ...credentialDraft } = draft().credentials[0];
  const updated = {
    ...draft(),
    entryId: entry.id,
    name: '변경 이름',
    credentials: [{ ...credentialDraft, id: credential.id }],
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/entries/import',
    headers: auth.headers,
    payload: { entries: [updated, draft('new-value')] },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().entries[0].id, entry.id);
  assert.equal(response.json().entries[0].credentials[0].version, 1);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/credentials/${credential.id}/reveal`,
        headers: auth.headers,
        payload: {},
      })
    ).json().value,
    'provider-secret-unique',
  );
  const rejected = await app.inject({
    method: 'POST',
    url: '/api/entries/import',
    headers: auth.headers,
    payload: {
      entries: [
        { ...updated, name: '롤백되어야 함' },
        { ...draft(), projectIds: ['00000000-0000-4000-8000-000000000001'] },
      ],
    },
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(
    (await app.inject({ url: '/api/entries', headers: auth.headers }))
      .json()
      .entries.find((e: any) => e.id === entry.id).name,
    '변경 이름',
  );
});
test('backup includes gateway configuration and revokes restored client keys without replacing the owner', async (t) => {
  const source = await fixture(t);
  const target = await fixture(t);
  const a = await owner(source.app, source.dataDir),
    b = await owner(target.app, target.dataDir);
  const project = (
    await source.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: a.headers,
      payload: { name: '중계' },
    })
  ).json().project;
  const entry = (
    await source.app.inject({
      method: 'POST',
      url: '/api/entries',
      headers: a.headers,
      payload: { ...draft(), projectIds: [project.id] },
    })
  ).json().entry;
  const routeResponse = await source.app.inject({
    method: 'POST',
    url: '/api/gateway/routes',
    headers: a.headers,
    payload: {
      name: '테스트',
      slug: 'provider',
      projectId: project.id,
      credentialId: entry.credentials[0].id,
      baseUrl: 'https://example.com/v1',
      allowedMethods: ['POST'],
      adapter: 'openai',
      enabled: true,
      allowPrivateNetwork: false,
    },
  });
  assert.equal(routeResponse.statusCode, 200, routeResponse.body);
  const route = routeResponse.json().route;
  const clientResponse = await source.app.inject({
    method: 'POST',
    url: '/api/gateway/clients',
    headers: a.headers,
    payload: {
      name: '클라이언트',
      projectId: project.id,
      routeIds: [route.id],
      expiresAt: '',
      dailyRequestLimit: 10,
      dailyTokenAlert: null,
      dailyCostAlertMicros: null,
    },
  });
  assert.equal(clientResponse.statusCode, 200, clientResponse.body);
  const client = clientResponse.json();
  assert.equal(
    (
      await source.app.inject({
        url: '/api/entries',
        headers: { authorization: `Bearer ${client.token}` },
      })
    ).statusCode,
    401,
  );
  const backup = (
    await source.app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: a.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  const restored = await target.app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: b.headers,
    payload: { password: 'backup-passphrase', ownerPassword: password, backup },
  });
  assert.equal(restored.statusCode, 200, restored.body);
  const login = await target.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { password },
  });
  const headers = {
    origin,
    cookie: (login.headers['set-cookie'] as string).split(';')[0],
    'x-csrf-token': login.json().csrfToken,
  };
  assert.equal(
    (await target.app.inject({ url: '/api/gateway/routes', headers })).json().routes[0].id,
    route.id,
  );
  assert.equal(
    (await target.app.inject({ url: '/api/gateway/clients', headers })).json().clients[0].revoked,
    true,
  );
  assert.equal(
    (
      await target.app.inject({
        method: 'POST',
        url: '/gw/provider/chat/completions',
        headers: { authorization: `Bearer ${client.token}` },
        payload: {},
      })
    ).statusCode,
    401,
  );
});
test('CLI backup and password reset support Korean space paths and revoke existing sessions', async (t) => {
  const { runAdmin } = await import('../src/cli.ts');
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: auth.headers,
    payload: draft(),
  });
  await app.close();
  const outputPath = join(dataDir, '한글 백업 파일.json');
  await runAdmin('backup', {
    dataDir,
    outputPath,
    password: 'backup-passphrase',
    ownerPassword: password,
  });
  assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).format, 'keydesk-backup');
  assert.equal((await readFile(outputPath, 'utf8')).includes('provider-secret-unique'), false);
  await runAdmin('reset-password', {
    dataDir,
    newPassword: '새로운 소유자 비밀번호 입니다',
  });
  const restarted = await createApp({ dataDir, origin, backgroundJobs: false });
  try {
    assert.equal(
      (await restarted.inject({ url: '/api/entries', headers: auth.headers })).statusCode,
      401,
    );
    assert.equal(
      (
        await restarted.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { origin },
          payload: { password },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await restarted.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { origin },
          payload: { password: '새로운 소유자 비밀번호 입니다' },
        })
      ).statusCode,
      200,
    );
  } finally {
    await restarted.close();
  }
});
test('wrong root keys fail with recovery guidance and SQLite files use private POSIX modes', async (t) => {
  const { chmod, stat, writeFile } = await import('node:fs/promises');
  const { randomBytes } = await import('node:crypto');
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-rootguard-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const app = await createApp({ dataDir, origin, backgroundJobs: false });
  try {
    for (const file of ['root-key', 'keydesk.sqlite', 'keydesk.sqlite-wal', 'keydesk.sqlite-shm']) {
      const info = await stat(join(dataDir, file));
      assert.ok(info.isFile(), file);
      if (process.platform !== 'win32') assert.equal(info.mode & 0o077, 0, file);
    }
    if (process.platform !== 'win32') {
      const sidecars = ['keydesk.sqlite-wal', 'keydesk.sqlite-shm'];
      for (const file of sidecars) await chmod(join(dataDir, file), 0o644);
      const reopened = await createApp({ dataDir, origin, backgroundJobs: false });
      try {
        for (const file of sidecars) {
          const info = await stat(join(dataDir, file));
          assert.equal(info.mode & 0o077, 0, file);
        }
      } finally {
        await reopened.close();
      }
    }
  } finally {
    await app.close();
  }
  await writeFile(join(dataDir, 'root-key'), randomBytes(32));
  await assert.rejects(createApp({ dataDir, origin, backgroundJobs: false }), /루트 암호화 키/);
});
test('linked gateway routes prevent removing project membership and timezone-offset issue dates stay chronological', async (t) => {
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const project = (
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: auth.headers,
      payload: { name: '연결' },
    })
  ).json().project;
  const dateDraft = draft();
  dateDraft.credentials[0].issuedAt = '2026-11-05T00:00:00+09:00';
  dateDraft.credentials[0].expiresAt = '2026-11-04T23:00:00Z';
  const created = await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: auth.headers,
    payload: { ...dateDraft, projectIds: [project.id] },
  });
  assert.equal(created.statusCode, 200, created.body);
  const entry = created.json().entry;
  const route = await app.inject({
    method: 'POST',
    url: '/api/gateway/routes',
    headers: auth.headers,
    payload: {
      name: '테스트',
      slug: 'membership',
      projectId: project.id,
      credentialId: entry.credentials[0].id,
      baseUrl: 'https://example.com/v1',
      allowedMethods: ['POST'],
      adapter: 'openai',
      enabled: true,
      allowPrivateNetwork: false,
    },
  });
  assert.equal(route.statusCode, 200, route.body);
  const changed = await app.inject({
    method: 'PUT',
    url: `/api/entries/${entry.id}`,
    headers: auth.headers,
    payload: {
      ...dateDraft,
      projectIds: [],
      credentials: [{ ...dateDraft.credentials[0], id: entry.credentials[0].id }],
    },
  });
  assert.equal(changed.statusCode, 409, changed.body);
  assert.deepEqual(
    (await app.inject({ url: '/api/entries', headers: auth.headers })).json().entries[0].projectIds,
    [project.id],
  );
});
test('candidate validation rejects authentic but inconsistent backup without changing current data or sessions', async (t) => {
  const { derive, decrypt, encrypt } = await import('../src/crypto.ts');
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: auth.headers,
    payload: draft(),
  });
  const backup = (
    await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  const key = await derive('backup-passphrase', Buffer.from(backup.salt, 'base64'));
  const logical = JSON.parse(decrypt(JSON.stringify(backup), key, 'keydesk-backup:1'));
  const parsed = JSON.parse(logical.tables.entries[0].json);
  parsed.id = '00000000-0000-4000-8000-000000000099';
  logical.tables.entries[0].json = JSON.stringify(parsed);
  const sealed = JSON.parse(encrypt(JSON.stringify(logical), key, 'keydesk-backup:1'));
  key.fill(0);
  const failed = await app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: auth.headers,
    payload: {
      password: 'backup-passphrase',
      ownerPassword: password,
      backup: { ...backup, ...sealed },
    },
  });
  assert.equal(failed.statusCode, 400, failed.body);
  const entries = await app.inject({
    url: '/api/entries',
    headers: auth.headers,
  });
  assert.equal(entries.statusCode, 200);
  assert.equal(entries.json().entries.length, 1);
  assert.notEqual(entries.json().entries[0].id, parsed.id);
});
test('malformed HTTP bodies return Korean errors without echoing parser input', async (t) => {
  const { app } = await fixture(t);
  for (const [contentType, payload, status] of [
    ['application/json', '{"password":', 400],
    ['application/x-secret-marker', 'password=secret-marker', 415],
  ] as const) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin, 'content-type': contentType },
      payload,
    });
    assert.equal(response.statusCode, status);
    assert.match(response.json().message, /[가-힣]/);
    assert.equal(response.body.includes('secret-marker'), false);
  }
});
test('encoded management paths enforce the same owner session, Origin and CSRF rules', async (t) => {
  const { app, dataDir } = await fixture(t);
  for (const url of ['/%61pi/projects', '/%61pi/settings', '/api/%65ntries'])
    assert.equal((await app.inject({ url })).statusCode, 401, url);
  const auth = await owner(app, dataDir);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/%61pi/projects',
        headers: { cookie: auth.cookie },
        payload: { name: '차단' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/%61pi/projects',
        headers: { cookie: auth.cookie, origin },
        payload: { name: '차단' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/%61pi/projects',
        headers: auth.headers,
        payload: { name: '허용' },
      })
    ).statusCode,
    200,
  );
});
function observeOwnerRead(app: Awaited<ReturnType<typeof createApp>>) {
  const db = app.context.db,
    prepare = db.prepare;
  let resolveBarrier!: () => void;
  const barrier = {
    promise: new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    }),
    resolve: () => resolveBarrier(),
  };
  let observed = false;
  db.prepare = function (sql: string) {
    const statement = prepare.call(db, sql);
    if (sql === 'SELECT * FROM owner WHERE id=1' && !observed) {
      const get = statement.get.bind(statement);
      statement.get = ((...params: unknown[]) => {
        const row = (get as (...values: unknown[]) => unknown)(...params);
        if (!observed) {
          observed = true;
          barrier.resolve();
        }
        return row;
      }) as typeof statement.get;
    }
    return statement;
  };
  return {
    reached: barrier.promise,
    restore: () => {
      db.prepare = prepare;
    },
  };
}
test('login cannot create a new session after the verified owner password has been reset', async (t) => {
  const { hashPassword } = await import('../src/crypto.ts');
  const { transaction } = await import('../src/db.ts');
  const { app, dataDir } = await fixture(t);
  await owner(app, dataDir);
  const newHash = await hashPassword('replacement owner password');
  const barrier = observeOwnerRead(app);
  const pending = app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { password },
  });
  await barrier.reached;
  barrier.restore();
  transaction(app.context.db, () => {
    app.context.db.prepare('UPDATE owner SET password_hash=? WHERE id=1').run(newHash);
    app.context.db.prepare('DELETE FROM sessions').run();
  });
  const response = await pending;
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(app.context.db.prepare('SELECT count(*) AS count FROM sessions').get()!.count, 0);
  assert.equal(response.headers['set-cookie'], undefined);
});
test('restore fences concurrent management writes so acknowledged changes cannot disappear outside its snapshot', async (t) => {
  const { watch } = await import('node:fs');
  const { setTimeout: wait } = await import('node:timers/promises');
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const backup = (
    await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth.headers,
    payload: { name: '복원 전 보존' },
  });
  let fired = false;
  const competing: Array<Promise<{ statusCode: number }>> = [];
  const watcher = watch(dataDir, (_event, name) => {
    if (fired || !name?.startsWith('pre-restore-')) return;
    fired = true;
    for (let i = 0; i < 20; i++)
      competing.push(
        app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: auth.headers,
          payload: { name: `동시 변경 ${i}` },
        }),
      );
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/backups/restore',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password, backup },
    });
    assert.equal(response.statusCode, 200, response.body);
    await wait(20);
    assert.equal(fired, true);
    const results = await Promise.all(competing);
    assert.equal(results.filter((result) => result.statusCode === 200).length, 0);
    assert.ok(results.every((result) => [401, 503].includes(result.statusCode)));
  } finally {
    watcher.close();
  }
});
async function withRestoreSnapshotHook<T>(
  t: TestContext,
  dataDir: string,
  onSnapshot: () => void,
  restore: () => Promise<T>,
) {
  const chmod = fs.chmod;
  const prefix = join(dataDir, 'pre-restore-');
  let reached = false;
  // Restore awaits chmod after SQLite backup and before the final authorization check.
  const hook = t.mock.method(fs, 'chmod', async (...args: Parameters<typeof chmod>) => {
    await chmod(...args);
    const [path] = args;
    if (typeof path === 'string' && path.startsWith(prefix) && path.endsWith('.sqlite')) {
      reached = true;
      onSnapshot();
    }
  });
  syncBuiltinESMExports();
  try {
    const response = await restore();
    assert.ok(reached, 'restore did not reach the pre-restore snapshot');
    return response;
  } finally {
    hook.mock.restore();
    syncBuiltinESMExports();
  }
}
test('restore rechecks session and owner authorization after the asynchronous snapshot before cutover', async (t) => {
  const { hashPassword } = await import('../src/crypto.ts');
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const backup = (
    await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth.headers,
    payload: { name: '반드시 유지' },
  });
  const replacement = await hashPassword('new owner password reset');
  const response = await withRestoreSnapshotHook(
    t,
    dataDir,
    () => {
      app.context.db.prepare('UPDATE owner SET password_hash=? WHERE id=1').run(replacement);
      app.context.db.prepare('DELETE FROM sessions').run();
    },
    () =>
      app.inject({
        method: 'POST',
        url: '/api/backups/restore',
        headers: auth.headers,
        payload: { password: 'backup-passphrase', ownerPassword: password, backup },
      }),
  );
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(app.context.db.prepare('SELECT count(*) AS count FROM projects').get()!.count, 1);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin },
        payload: { password: 'new owner password reset' },
      })
    ).statusCode,
    200,
  );
});
test('restore rejects malformed gateway prices atomically and permits revoked clients with deleted historical routes', async (t) => {
  const { derive, decrypt, encrypt } = await import('../src/crypto.ts');
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const project = (
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: auth.headers,
      payload: { name: '백업 검증' },
    })
  ).json().project;
  const entry = (
    await app.inject({
      method: 'POST',
      url: '/api/entries',
      headers: auth.headers,
      payload: { ...draft(), projectIds: [project.id] },
    })
  ).json().entry;
  const route = (
    await app.inject({
      method: 'POST',
      url: '/api/gateway/routes',
      headers: auth.headers,
      payload: {
        name: '검증 경로',
        slug: 'restore-validation',
        projectId: project.id,
        credentialId: entry.credentials[0].id,
        baseUrl: 'https://example.com/v1',
        allowedMethods: ['POST'],
        adapter: 'openai',
        enabled: true,
        allowPrivateNetwork: false,
      },
    })
  ).json().route;
  const client = (
    await app.inject({
      method: 'POST',
      url: '/api/gateway/clients',
      headers: auth.headers,
      payload: {
        name: '폐기 이력',
        projectId: project.id,
        routeIds: [route.id],
        expiresAt: '',
        dailyRequestLimit: 10,
        dailyTokenAlert: null,
        dailyCostAlertMicros: null,
      },
    })
  ).json().client;
  const price = (
    await app.inject({
      method: 'POST',
      url: '/api/gateway/prices',
      headers: auth.headers,
      payload: {
        adapter: 'openai',
        model: 'test-model',
        currency: 'USD',
        inputPerMillion: '1',
        outputPerMillion: '2',
        cachedInputPerMillion: '0.5',
        startsAt: '2026-01-01T00:00:00Z',
      },
    })
  ).json().price;
  const backup = (
    await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  const key = await derive('backup-passphrase', Buffer.from(backup.salt, 'base64'));
  const logical = JSON.parse(decrypt(JSON.stringify(backup), key, 'keydesk-backup:1'));
  const malformed = JSON.parse(logical.tables.gateway_prices[0].json);
  malformed.inputPerMillion = 'not-a-price';
  logical.tables.gateway_prices[0].json = JSON.stringify(malformed);
  const sealed = JSON.parse(encrypt(JSON.stringify(logical), key, 'keydesk-backup:1'));
  key.fill(0);
  const rejected = await app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: auth.headers,
    payload: {
      password: 'backup-passphrase',
      ownerPassword: password,
      backup: { ...backup, ...sealed },
    },
  });
  assert.equal(rejected.statusCode, 400, rejected.body);
  assert.equal(
    (await app.inject({ url: '/api/gateway/prices', headers: auth.headers })).json().prices[0]
      .inputPerMillion,
    price.inputPerMillion,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/gateway/clients/${client.id}`,
        headers: auth.headers,
        payload: { revoked: true },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/api/gateway/routes/${route.id}`,
        headers: auth.headers,
      })
    ).statusCode,
    200,
  );
  const historical = (
    await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  const restored = await app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: auth.headers,
    payload: { password: 'backup-passphrase', ownerPassword: password, backup: historical },
  });
  assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(
    app.context.db.prepare('SELECT count(*) AS count FROM gateway_routes').get()!.count,
    0,
  );
  assert.equal(
    JSON.parse(app.context.db.prepare('SELECT json FROM gateway_clients').get()!.json as string)
      .revoked,
    true,
  );
});
test('restore also refuses a revoked session when the verified owner password remains unchanged', async (t) => {
  const { app, dataDir } = await fixture(t);
  const auth = await owner(app, dataDir);
  const backup = (
    await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: auth.headers,
      payload: { password: 'backup-passphrase', ownerPassword: password },
    })
  ).json().backup;
  await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth.headers,
    payload: { name: '세션 폐기 후 유지' },
  });
  const response = await withRestoreSnapshotHook(
    t,
    dataDir,
    () => app.context.db.prepare('DELETE FROM sessions').run(),
    () =>
      app.inject({
        method: 'POST',
        url: '/api/backups/restore',
        headers: auth.headers,
        payload: { password: 'backup-passphrase', ownerPassword: password, backup },
      }),
  );
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(app.context.db.prepare('SELECT count(*) AS count FROM projects').get()!.count, 1);
});
