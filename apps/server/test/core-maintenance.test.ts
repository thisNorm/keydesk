import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createApp } from '../src/app.ts';
import { MaintenanceCoordinator } from '../src/maintenance.ts';
test('maintenance drains existing work, skips background writes, and clears its fence after a bounded timeout', async () => {
  const coordinator = new MaintenanceCoordinator(25);
  const release = coordinator.enter();
  const failed = coordinator.exclusive(async () => {});
  assert.throws(() => coordinator.enter(), /복원 중/);
  let backgroundRan = false;
  await coordinator.background(async () => {
    backgroundRan = true;
  });
  assert.equal(backgroundRan, false);
  await assert.rejects(failed, /복원을 취소/);
  const admitted = coordinator.enter();
  admitted();
  release();
  const finish = await coordinator.exclusive(async () => {});
  assert.throws(() => coordinator.enter(), /복원 중/);
  finish();
  const after = coordinator.enter();
  after();
});
test(
  'restore drains an actual cancelled gateway stream before snapshotting its final usage',
  { timeout: 20000 },
  async (t) => {
    const sockets = new Set<Socket>();
    let providerCalls = 0;
    const provider = createServer((_request, response) => {
      providerCalls++;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"object":"chat.completion.chunk","choices":[]}\n\n');
    });
    provider.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const providerPort = (provider.address() as any).port;
    const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-restore-drain-')),
      origin = 'http://localhost:8088',
      password = 'strong owner password';
    const app = await createApp({
      dataDir,
      origin,
      now: () => new Date('2026-11-05T03:00:00Z'),
      backgroundJobs: false,
    });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    t.after(async () => {
      await reader?.cancel().catch(() => {});
      await app.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      await rm(dataDir, { recursive: true, force: true });
    });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      headers: { origin },
      payload: {
        token: (await readFile(join(dataDir, 'bootstrap-token'), 'utf8')).trim(),
        name: '소유자',
        password,
      },
    });
    const headers = {
      origin,
      cookie: (setup.headers['set-cookie'] as string).split(';')[0],
      'x-csrf-token': setup.json().csrfToken,
    };
    const project = (
      await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers,
        payload: { name: '진행 중인 호출' },
      })
    ).json().project;
    const entry = (
      await app.inject({
        method: 'POST',
        url: '/api/entries',
        headers,
        payload: {
          name: '호출용',
          provider: '로컬',
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
              label: '키',
              value: 'provider-private-secret',
              status: 'active',
              issuedAt: '',
              expiresAt: '',
            },
          ],
        },
      })
    ).json().entry;
    const route = (
      await app.inject({
        method: 'POST',
        url: '/api/gateway/routes',
        headers,
        payload: {
          name: '스트림',
          slug: 'drain',
          projectId: project.id,
          credentialId: entry.credentials[0].id,
          baseUrl: `http://127.0.0.1:${providerPort}`,
          allowedMethods: ['POST'],
          adapter: 'openai',
          enabled: true,
          allowPrivateNetwork: true,
        },
      })
    ).json().route;
    const client = (
      await app.inject({
        method: 'POST',
        url: '/api/gateway/clients',
        headers,
        payload: {
          name: '호출자',
          projectId: project.id,
          routeIds: [route.id],
          expiresAt: '',
          dailyRequestLimit: null,
          dailyTokenAlert: null,
          dailyCostAlertMicros: null,
        },
      })
    ).json();
    const backup = (
      await app.inject({
        method: 'POST',
        url: '/api/backups',
        headers,
        payload: { password: 'backup-passphrase', ownerPassword: password },
      })
    ).json().backup;
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as any).port;
    const response = await fetch(`http://127.0.0.1:${port}/gw/drain/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${client.token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 200);
    reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false);
    let restored = false;
    const pending = app
      .inject({
        method: 'POST',
        url: '/api/backups/restore',
        headers,
        payload: { password: 'backup-passphrase', ownerPassword: password, backup },
      })
      .then((result) => {
        restored = true;
        return result;
      });
    let blocked = false;
    for (let index = 0; index < 50; index++) {
      await nextTurn();
      if ((await app.inject({ url: '/api/projects', headers })).statusCode === 503) {
        blocked = true;
        break;
      }
    }
    assert.equal(blocked, true);
    assert.equal(restored, false);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/gw/drain/chat/completions',
          headers: { authorization: `Bearer ${client.token}` },
          payload: {},
        })
      ).statusCode,
      503,
    );
    assert.equal(providerCalls, 1);
    await reader.cancel();
    reader = undefined;
    const result = await pending;
    assert.equal(result.statusCode, 200, result.body);
    const snapshot = (await readdir(dataDir)).find(
      (name) => name.startsWith('pre-restore-') && name.endsWith('.sqlite'),
    );
    assert.ok(snapshot);
    const preserved = new DatabaseSync(join(dataDir, snapshot), { readOnly: true });
    try {
      const row = preserved.prepare('SELECT json FROM gateway_usage').get();
      assert.ok(row);
      assert.equal(JSON.parse(row.json as string).outcome, 'cancelled');
    } finally {
      preserved.close();
    }
    assert.equal(
      app.context.db.prepare('SELECT count(*) AS count FROM gateway_usage').get()!.count,
      0,
    );
  },
);
