import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/app.ts';
test('local SMTP receives test and expiry mail without credential values, while SMTP password stays encrypted', async (t) => {
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
  const port = (smtp.address() as any).port;
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
