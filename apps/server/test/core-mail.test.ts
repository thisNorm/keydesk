import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/app.ts';
import type { TestContext } from 'node:test';
import { decrypt, derive, encrypt } from '../src/crypto.ts';
import { providerRequest } from '../src/gateway/transport.ts';

async function localSmtp(t: TestContext) {
  const sockets = new Set<Socket>(),
    messages: string[] = [];
  const smtp = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 local.test ESMTP\r\n');
    let buffer = '',
      data = false,
      message = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line === '.') {
            messages.push(message);
            message = '';
            data = false;
            socket.write('250 queued\r\n');
          } else message += line + '\r\n';
          continue;
        }
        if (line.startsWith('EHLO') || line.startsWith('HELO')) socket.write('250 local.test\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 continue\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 bye\r\n');
        } else socket.write('250 OK\r\n');
      }
    });
  });
  smtp.listen(0, '127.0.0.1');
  await once(smtp, 'listening');
  const address = smtp.address();
  assert.ok(address && typeof address === 'object');
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
  });
  return { port: address.port, messages };
}

function mailText(raw: string): string {
  const divider = raw.indexOf('\r\n\r\n');
  const headers = raw.slice(0, divider);
  const body = raw.slice(divider + 4);
  if (/^Content-Transfer-Encoding: base64$/im.test(headers))
    return Buffer.from(body, 'base64').toString('utf8');
  if (/^Content-Transfer-Encoding: quoted-printable$/im.test(headers))
    return Buffer.from(
      body
        .replace(/=\r\n/g, '')
        .replace(/=([0-9a-f]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16))),
      'latin1',
    ).toString('utf8');
  return body;
}

test('local SMTP receives test and expiry mail without credential values, while SMTP password stays encrypted', async (t) => {
  const { port, messages } = await localSmtp(t);
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-mail-'));
  const origin = 'http://localhost:8088';
  const app = await createApp({
    dataDir,
    origin,
    now: () => new Date('2026-11-05T03:00:00Z'),
    backgroundJobs: false,
  });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: { origin },
    payload: {
      token: (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim(),
      name: '나',
      password: 'secure owner password',
    },
  });
  const headers = {
    origin,
    cookie: (setup.headers['set-cookie'] as string).split(';')[0],
    'x-csrf-token': setup.json().csrfToken,
  };
  const current = (await app.inject({ url: '/api/settings', headers })).json().settings;
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers,
    payload: {
      ...current,
      smtp: {
        host: '127.0.0.1',
        port,
        secure: false,
        user: '',
        password: 'smtp-plain-secret',
        from: 'owner@example.test',
        to: 'owner@example.test',
      },
    },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.body.includes('smtp-plain-secret'), false);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/settings/smtp/test',
        headers,
        payload: {},
      })
    ).statusCode,
    200,
  );
  const d = {
    name: 'EntryForMail',
    provider: 'LocalProvider',
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
    credentials: [
      {
        label: 'key',
        value: 'never-send-provider-secret',
        status: 'active',
        issuedAt: '2026-11-01',
        expiresAt: '2026-11-12',
      },
    ],
  };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/entries',
        headers,
        payload: d,
      })
    ).statusCode,
    200,
  );
  const beforeExpiry = await app.inject({
    method: 'POST',
    url: '/api/backups',
    headers,
    payload: { password: 'backup-passphrase', ownerPassword: 'secure owner password' },
  });
  assert.equal(beforeExpiry.statusCode, 200, beforeExpiry.body);
  const backup = beforeExpiry.json().backup;
  const backupKey = await derive('backup-passphrase', Buffer.from(backup.salt, 'base64'));
  const logical = JSON.parse(decrypt(JSON.stringify(backup), backupKey, 'keydesk-backup:1'));
  delete logical.tables.gateway_budget_rollups;
  const oldBackup = {
    ...backup,
    ...JSON.parse(encrypt(JSON.stringify(logical), backupKey, 'keydesk-backup:1')),
  };
  backupKey.fill(0);
  for (let i = 0; i < 2; i++)
    await app.inject({
      method: 'POST',
      url: '/api/notifications/refresh',
      headers,
      payload: {},
    });
  assert.equal(messages.length, 2);
  assert.match(messages[1], /EntryForMail/);
  assert.match(messages[1], /LocalProvider/);
  assert.equal(messages.join('').includes('never-send-provider-secret'), false);
  const notifications = (await app.inject({ url: '/api/notifications', headers })).json()
    .notifications;
  assert.equal(notifications[0].mailStatus, 'sent');
  const sentBackup = await app.inject({
    method: 'POST',
    url: '/api/backups',
    headers,
    payload: { password: 'backup-passphrase', ownerPassword: 'secure owner password' },
  });
  assert.equal(sentBackup.statusCode, 200);
  // Simulate an installation importing a portable record of a mail sent elsewhere.
  app.context.db.exec("DELETE FROM notifications; DELETE FROM mail_outbox WHERE kind='expiry'");
  const importSent = await app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers,
    payload: {
      backup: sentBackup.json().backup,
      password: 'backup-passphrase',
      ownerPassword: 'secure owner password',
    },
  });
  assert.equal(importSent.statusCode, 200, importSent.body);
  const importedLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { password: 'secure owner password' },
  });
  assert.equal(importedLogin.statusCode, 200);
  const restored = await app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: {
      origin,
      cookie: (importedLogin.headers['set-cookie'] as string).split(';')[0],
      'x-csrf-token': importedLogin.json().csrfToken,
    },
    payload: {
      backup: oldBackup,
      password: 'backup-passphrase',
      ownerPassword: 'secure owner password',
    },
  });
  assert.equal(restored.statusCode, 200, restored.body);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { password: 'secure owner password' },
  });
  assert.equal(login.statusCode, 200);
  const afterRestore = {
    origin,
    cookie: (login.headers['set-cookie'] as string).split(';')[0],
    'x-csrf-token': login.json().csrfToken,
  };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/notifications/refresh',
        headers: afterRestore,
        payload: {},
      })
    ).statusCode,
    200,
  );
  assert.equal(messages.length, 2, 'restoring an older backup does not replay expiry mail');
  const restoredNotifications = (
    await app.inject({
      url: '/api/notifications',
      headers: afterRestore,
    })
  ).json().notifications;
  assert.equal(restoredNotifications.length, 1);
  assert.equal(restoredNotifications[0].mailStatus, 'sent');
  for (const file of ['keydesk.sqlite', 'keydesk.sqlite-wal']) {
    try {
      assert.equal(
        (await readFile(join(dataDir, file))).includes(Buffer.from('smtp-plain-secret')),
        false,
      );
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
});

test('mail reports successful registrations, project changes, daily calls and monthly estimated cost once', async (t) => {
  const { port, messages } = await localSmtp(t);
  let signalHeld!: () => void;
  let releaseHeld!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalHeld = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  const upstream = createHttpServer(async (req, res) => {
    if (req.url?.endsWith('/hold')) {
      signalHeld();
      await gate;
    }
    res.setHeader('content-type', 'application/json');
    res.end('{"model":"mail-model","usage":{"prompt_tokens":1000000,"completion_tokens":0}}');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-new-mail-'));
  const origin = 'http://localhost:8088';
  const options = {
    dataDir,
    origin,
    now: () => new Date('2026-11-12T03:00:00Z'),
    backgroundJobs: false,
  };
  let app = await createApp(options);
  t.after(async () => {
    releaseHeld();
    await app.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: { origin },
    payload: {
      token: (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim(),
      name: 'owner',
      password: 'secure owner password',
    },
  });
  const headers = {
    origin,
    cookie: (setup.headers['set-cookie'] as string).split(';')[0],
    'x-csrf-token': setup.json().csrfToken,
  };
  const api = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => {
    const res = await app.inject({ method, url, headers, payload });
    assert.equal(res.statusCode, 200, res.body);
    return res.json();
  };
  const settings = (await api('GET', '/api/settings')).settings;
  await api('PUT', '/api/settings', {
    ...settings,
    smtp: {
      host: '127.0.0.1',
      port,
      secure: false,
      user: '',
      from: 'owner@example.test',
      to: 'owner@example.test',
    },
    mailAlerts: { registration: true, requestLimit: true, budget: false, openRouterKeys: [] },
  });
  const project = (await api('POST', '/api/projects', { name: 'PinMate' })).project;
  const other = (await api('POST', '/api/projects', { name: 'OtherProject' })).project;
  const { entry } = await api('POST', '/api/entries', {
    name: 'EntryForAlerts',
    provider: 'TestProvider',
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
    projectIds: [project.id],
    credentials: [
      {
        label: 'KeyForAlerts',
        value: 'never-send-real-key',
        status: 'active',
        issuedAt: '',
        expiresAt: '',
      },
    ],
  });
  await api('PUT', '/api/entries/' + entry.id, { ...entry, projectIds: [project.id, other.id] });
  await api('PUT', '/api/entries/' + entry.id, {
    ...entry,
    name: 'RenamedEntry',
    projectIds: [project.id, other.id],
  });
  const { route } = await api('POST', '/api/gateway/routes', {
    name: 'RouteForAlerts',
    slug: 'alerts',
    projectId: project.id,
    credentialId: entry.credentials[0].id,
    baseUrl: 'http://127.0.0.1:' + address.port + '/v1/',
    allowedMethods: ['GET'],
    adapter: 'openai',
    enabled: true,
    allowPrivateNetwork: true,
    mailBudget: { amount: '10', currency: 'USD', basis: 'estimate' },
  });
  const withQueuedRegistration = (await api('GET', '/api/settings')).settings;
  await api('PUT', '/api/settings', {
    ...withQueuedRegistration,
    mailAlerts: { ...withQueuedRegistration.mailAlerts, budget: true },
  });
  await api('POST', '/api/gateway/prices', {
    adapter: 'openai',
    model: 'mail-model',
    currency: 'USD',
    inputPerMillion: '2',
    outputPerMillion: '0',
    cachedInputPerMillion: '0',
    startsAt: '2026-11-01T00:00:00Z',
  });
  const { token } = await api('POST', '/api/gateway/clients', {
    name: 'CallsForAlerts',
    projectId: project.id,
    routeIds: [route.id],
    dailyRequestLimit: 5,
  });
  const call = async () => {
    const res = await app.inject({
      url: '/gw/alerts/read?query=never-send-query',
      headers: { authorization: 'Bearer ' + token },
    });
    assert.equal(res.statusCode, 200, res.body);
  };
  for (let i = 0; i < 4; i++) await call();
  assert.equal(messages.length, 0, 'mail is sent by the worker after the request');
  await app.close();
  app = await createApp(options);
  await api('POST', '/api/notifications/refresh');
  assert.equal(messages.length, 5);
  assert.match(messages.map(mailText).join('\n'), /OtherProject/);
  assert.match(messages.map(mailText).join('\n'), /USD 8 \/ USD 10/);
  await api('PUT', '/api/gateway/routes/' + route.id, {
    ...route,
    mailBudget: { ...route.mailBudget, amount: '8' },
  });
  await api('POST', '/api/notifications/refresh');
  assert.equal(messages.length, 6, 'lowering the budget rechecks the existing exact total');
  await call();
  await api('POST', '/api/notifications/refresh');
  await app.close();
  app = await createApp(options);
  await api('POST', '/api/notifications/refresh');
  assert.equal(messages.length, 7, '80% and 100% are delivered once each');
  assert.doesNotMatch(
    messages.map(mailText).join('\n'),
    /never-send-real-key|never-send-query|kd_/,
  );
  const { deliveries } = await api('GET', '/api/settings/mail/overview');
  assert.equal(deliveries.filter((event: { status: string }) => event.status === 'sent').length, 7);
  await api('PUT', '/api/entries/' + entry.id, { ...entry, projectIds: [project.id] });
  const latest = (await api('GET', '/api/settings')).settings;
  await api('PUT', '/api/settings', {
    ...latest,
    smtp: { ...latest.smtp, to: 'next@example.test' },
  });
  await api('POST', '/api/notifications/refresh');
  assert.equal(messages.length, 7, 'old mail is not redirected to the new recipient');
  assert.ok(
    (await api('GET', '/api/settings/mail/overview')).deliveries.some(
      (event: { status: string }) => event.status === 'cancelled',
    ),
  );
  const configured = (await api('GET', '/api/settings')).settings;
  await api('PUT', '/api/settings', { ...configured, timeZone: 'UTC' });
  await api('PUT', '/api/settings', { ...configured, timeZone: 'Asia/Seoul' });
  const budgetRow = app.context.db
    .prepare('SELECT json FROM gateway_budget_rollups WHERE route_id=?')
    .get(route.id);
  assert.equal(
    JSON.parse(String(budgetRow?.json)).units,
    '0',
    'changing the time zone back starts a fresh budget',
  );
  const { token: parallel } = await api('POST', '/api/gateway/clients', {
    name: 'ParallelCalls',
    projectId: project.id,
    routeIds: [route.id],
    dailyRequestLimit: 5,
  });
  const get = (path: string) =>
    app.inject({ url: '/gw/alerts/' + path, headers: { authorization: 'Bearer ' + parallel } });
  for (let i = 0; i < 3; i++) assert.equal((await get('read')).statusCode, 200);
  const fourth = get('hold');
  try {
    await entered;
    assert.equal((await get('read')).statusCode, 200);
  } finally {
    releaseHeld();
    assert.equal((await fourth).statusCode, 200);
  }
  await api('POST', '/api/notifications/refresh');
  const daily = messages.map(mailText).filter((body) => body.includes('ParallelCalls'));
  assert.equal(daily.length, 2, 'the fourth call reached 80% even when the fifth settled first');
  assert.match(daily[0]!, /4회 \/ 5회/);
  assert.match(daily[1]!, /5회 \/ 5회/);
});

test('OpenRouter mail only polls approved keys and warns once until usage resets', async (t) => {
  const { port, messages } = await localSmtp(t);
  let used: number | null = 80;
  const upstream = createHttpServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/v1/key');
    assert.equal(req.headers.authorization, 'Bearer provider-mail-fixture');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: { free_model_daily_requests: { used, limit: 100 } } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-openrouter-mail-'));
  const origin = 'http://localhost:8088';
  let at = Date.parse('2026-11-12T03:00:00Z');
  let checks = 0;
  const app = await createApp({
    dataDir,
    origin,
    now: () => new Date(at),
    backgroundJobs: false,
    mailLookup: {
      resolveDestination: async (url, privateAllowed) => {
        assert.equal(url.href, 'https://openrouter.ai/api/v1/key');
        assert.equal(privateAllowed, false);
        return { address: '93.184.216.34', family: 4 };
      },
      requestProvider: (url, _pin, method, headers) => {
        checks++;
        return providerRequest(
          new URL(url.pathname, 'http://127.0.0.1:' + address.port),
          { address: '127.0.0.1', family: 4 },
          method,
          headers,
        );
      },
    },
  });
  t.after(async () => {
    await app.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: { origin },
    payload: {
      token: (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim(),
      name: 'owner',
      password: 'secure owner password',
    },
  });
  const headers = {
    origin,
    cookie: (setup.headers['set-cookie'] as string).split(';')[0],
    'x-csrf-token': setup.json().csrfToken,
  };
  const api = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => {
    const res = await app.inject({ method, url, headers, payload });
    assert.equal(res.statusCode, 200, res.body);
    return res.json();
  };
  const settings = (await api('GET', '/api/settings')).settings;
  const project = (await api('POST', '/api/projects', { name: 'PinMate' })).project;
  const { entry } = await api('POST', '/api/entries', {
    name: 'OpenRouter fixture',
    provider: 'OpenRouter',
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
    projectIds: [project.id],
    credentials: [
      {
        label: 'RouterKey',
        value: 'provider-mail-fixture',
        status: 'active',
        issuedAt: '',
        expiresAt: '',
      },
    ],
  });
  const credentialId = entry.credentials[0].id;
  for (const slug of ['openrouter-one', 'openrouter-two'])
    await api('POST', '/api/gateway/routes', {
      name: slug,
      slug,
      credentialId,
      projectId: project.id,
      baseUrl: 'https://openrouter.ai/api/v1/',
      adapter: 'openai',
      allowedMethods: ['POST'],
      enabled: true,
      allowPrivateNetwork: false,
    });
  const refresh = () => api('POST', '/api/notifications/refresh');
  const ready = {
    ...settings,
    smtp: {
      host: '127.0.0.1',
      port,
      secure: false,
      user: '',
      from: 'owner@example.test',
      to: 'owner@example.test',
    },
    mailAlerts: { registration: false, requestLimit: false, budget: false, openRouterKeys: [] },
  };
  await api('PUT', '/api/settings', ready);
  const overview = await api('GET', '/api/settings/mail/overview');
  assert.equal(overview.openRouterKeys.length, 1);
  assert.equal(overview.openRouterKeys[0].credentialId, credentialId);
  await refresh();
  assert.equal(checks, 0);
  await api('PUT', '/api/settings', {
    ...ready,
    mailAlerts: { ...ready.mailAlerts, openRouterKeys: [credentialId] },
  });
  await refresh();
  await refresh();
  assert.equal(checks, 1, 'two routes sharing one key are checked once per hour');
  assert.equal(messages.length, 1);
  assert.match(mailText(messages[0]!), /제공사 집계.*80회 \/ 100회/);
  for (const count of [null, 90, 100, 0, 80]) {
    used = count;
    at += 3600000;
    await refresh();
  }
  assert.equal(checks, 6);
  assert.equal(messages.length, 3, 'missing numbers do not reset or send an alert');
  assert.doesNotMatch(messages.map(mailText).join('\n'), /provider-mail-fixture/);
});
test('authenticated SMTP refuses a server that strips STARTTLS before any AUTH command', async (t) => {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const smtp = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 test ESMTP\r\n');
    let buffer = '',
      data = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line === '.') {
            data = false;
            socket.write('250 queued\r\n');
          }
          continue;
        }
        commands.push(line.split(' ')[0]);
        if (line.startsWith('EHLO')) socket.write('250-test\r\n250 AUTH PLAIN\r\n');
        else if (line === 'STARTTLS') socket.write('500 STARTTLS unavailable\r\n');
        else if (line.startsWith('AUTH')) socket.write('235 authenticated\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 continue\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  smtp.listen(0, '127.0.0.1');
  await once(smtp, 'listening');
  const port = (smtp.address() as any).port;
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-smtp-tls-')),
    origin = 'http://localhost:8088';
  const app = await createApp({ dataDir, origin, backgroundJobs: false });
  t.after(async () => {
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: { origin },
    payload: {
      token: (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim(),
      name: '나',
      password: 'secure owner password',
    },
  });
  const headers = {
    origin,
    cookie: (setup.headers['set-cookie'] as string).split(';')[0],
    'x-csrf-token': setup.json().csrfToken,
  };
  const settings = (await app.inject({ url: '/api/settings', headers })).json().settings;
  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers,
    payload: {
      ...settings,
      smtp: {
        host: '127.0.0.1',
        port,
        secure: false,
        user: 'smtp-user',
        password: 'smtp-password-private',
        from: 'owner@example.test',
        to: 'owner@example.test',
      },
    },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/settings/smtp/test',
    headers,
    payload: {},
  });
  assert.equal(response.statusCode, 502, response.body);
  assert.equal(commands.includes('AUTH'), false);
  assert.equal(commands.includes('STARTTLS'), true);
});
