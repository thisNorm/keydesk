import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { once } from 'node:events';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerGateway } from '../../src/gateway/index.ts';
import type { GatewayOptions } from '../../src/gateway/index.ts';
import { pinDestination, providerRequest } from '../../src/gateway/transport.ts';
import { classifyOperation } from '../../src/gateway/operations.ts';
import type { CoreContext } from '../../src/context.ts';
import { digest } from '../../src/crypto.ts';
async function fixture(
  handler: Parameters<typeof createServer>[0] extends never ? never : any = (_req: any, res: any) =>
    res.end('{"ok":true}'),
  options: GatewayOptions = {},
  secure = false,
) {
  const previousRoots = secure ? getCACertificates() : undefined;
  const certificate = secure
    ? readFileSync(new URL('../fixtures/query-relay-cert.pem', import.meta.url), 'utf8')
    : undefined;
  // Trust this disposable fixture certificate without disabling TLS validation.
  if (certificate) setDefaultCACertificates([...previousRoots!, certificate]);
  const provider = certificate
    ? createHttpsServer(
        {
          cert: certificate,
          key: readFileSync(new URL('../fixtures/query-relay-key.pem', import.meta.url)),
        },
        handler,
      )
    : createServer(handler);
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const port = (provider.address() as any).port;
  const db = new DatabaseSync(':memory:');
  db.exec(
    `CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,created_at TEXT); INSERT INTO projects VALUES('p','프로젝트','2026-11-05'); INSERT INTO projects VALUES('other','다른 프로젝트','2026-11-05'); CREATE TABLE credentials(id TEXT PRIMARY KEY,entry_id TEXT,json TEXT); INSERT INTO credentials VALUES('cred','entry','{}'); CREATE TABLE entry_projects(entry_id TEXT,project_id TEXT); INSERT INTO entry_projects VALUES('entry','p');`,
  );
  const context: CoreContext = {
    db,
    now: () => new Date('2026-11-05T12:00:00Z'),
    getSettings: () => ({
      timeZone: 'Asia/Seoul',
      retentionDays: 30,
      krwExchangeRate: '1400',
      exchangeRateDate: '2026-11-05',
      smtp: {
        host: '',
        port: 587,
        secure: false,
        user: '',
        from: '',
        to: '',
      },
    }),
    getCredential: () => ({
      id: 'cred',
      entryId: 'entry',
      version: 2,
      value: 'provider-secret',
      status: 'active',
      expiresAt: '2027-01-01',
    }),
    audit: () => {},
  };
  const app = Fastify();
  await app.register(cookie);
  await registerGateway(app, context, options);
  await app.ready();
  const route = async (extra = {}) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/gateway/routes',
      payload: {
        name: '테스트',
        slug: 'test',
        projectId: 'p',
        credentialId: 'cred',
        baseUrl: `${secure ? 'https' : 'http'}://127.0.0.1:${port}/v1/`,
        allowedMethods: ['GET', 'POST'],
        adapter: 'openai',
        enabled: true,
        allowPrivateNetwork: true,
        ...extra,
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().route;
  };
  const client = async (routeIds: string[], extra = {}) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/gateway/clients',
      payload: {
        name: '클라이언트',
        projectId: 'p',
        routeIds,
        expiresAt: '2027-01-01',
        dailyRequestLimit: null,
        dailyTokenAlert: null,
        dailyCostAlertMicros: null,
        ...extra,
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  return {
    app,
    db,
    context,
    providerOrigin: `${secure ? 'https' : 'http'}://127.0.0.1:${port}`,
    route,
    client,
    close: async () => {
      provider.closeAllConnections();
      await app.close();
      await new Promise<void>((r) => provider.close(() => r()));
      db.close();
      if (previousRoots) setDefaultCACertificates(previousRoots);
    },
  };
}
test('usage counts API operations separately and excludes request values from its history', async () => {
  const f = await fixture();
  try {
    const route = await f.route({
      adapter: 'generic',
      operationRules: [
        { name: '상세 조회', method: 'GET', path: '/v1/places/{id}' },
        { name: '검색', method: 'GET', path: '/v1/places/search' },
      ],
    });
    const { client, token } = await f.client([route.id], { dailyRequestLimit: 8 });
    for (const suffix of [
      'places/search?q=secret-query',
      'places/private-id',
      'places/next',
      'other',
    ]) {
      const response = await f.app.inject({
        url: '/gw/test/' + suffix,
        headers: { authorization: 'Bearer ' + token },
      });
      assert.equal(response.statusCode, 200);
    }
    const response = await f.app.inject({ url: '/api/usage?days=7&projectId=p' });
    const report = response.json();
    assert.deepEqual(
      Object.fromEntries(report.operations.map((row: any) => [row.name ?? '미분류', row.requests])),
      { 검색: 1, '상세 조회': 2, 미분류: 1 },
    );
    assert.equal(report.routeTotals[0].requests, 4);
    assert.deepEqual(
      report.dailyLimits.map((row: any) => [row.clientId, row.used, row.max]),
      [[client.id, 4, 8]],
    );
    assert.doesNotMatch(response.body, /private-id|secret-query/);
    assert.doesNotMatch(
      JSON.stringify(f.db.prepare('SELECT json FROM gateway_usage').all()),
      /private-id|secret-query/,
    );
  } finally {
    await f.close();
  }
});

test('documented Maps and Local APIs are classified by official target and method', () => {
  const operation = (url: string, method = 'GET') => classifyOperation(new URL(url), method);
  const forward = operation('https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=example');
  const reverse = operation('https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc');
  assert.equal(forward?.name, '주소 → 좌표 (Geocoding)');
  assert.equal(reverse?.name, '좌표 → 주소 (Reverse Geocoding)');
  assert.notEqual(forward?.id, reverse?.id);
  const kakao = 'https://dapi.kakao.com/v2/local/search/';
  const address = operation(kakao + 'address.json');
  const keyword = operation(kakao + 'keyword.json');
  const category = operation(kakao + 'category.json');
  assert.equal(new Set([address?.id, keyword?.id, category?.id]).size, 3);
  assert.equal(operation(kakao + 'address.xml')?.id, address?.id);
  assert.equal(operation(kakao + 'address.json', 'POST'), undefined);
  assert.equal(
    operation('https://dapi.kakao.com.example.com/v2/local/search/address.json'),
    undefined,
  );
});

test('period summaries include retained records beyond the detail cap', async () => {
  const f = await fixture();
  try {
    const route = await f.route({ adapter: 'generic' });
    const record = {
      id: '',
      projectId: 'p',
      clientId: 'client',
      routeId: route.id,
      createdAt: '2026-11-04T12:00:00Z',
      model: null,
      usageSource: '미확인',
      inputTokens: null,
      outputTokens: null,
      costMicros: null,
    };
    const insert = f.db.prepare('INSERT INTO gateway_usage VALUES(?,?,?,?,?)');
    for (let i = 0; i < 1001; i++) {
      const row = { ...record, id: 'history-' + i };
      insert.run(row.id, row.projectId, row.clientId, row.createdAt, JSON.stringify(row));
    }
    for (const row of [
      { ...record, id: 'other-project', projectId: 'other' },
      { ...record, id: 'outside-period', createdAt: '2026-10-20T00:00:00Z' },
    ]) {
      insert.run(row.id, row.projectId, row.clientId, row.createdAt, JSON.stringify(row));
    }
    const report = (await f.app.inject('/api/usage?projectId=p&days=7')).json();
    assert.equal(report.records.length, 1000);
    assert.equal(report.summary.requests, 1001);
    assert.equal(report.operations[0].requests, 1001);
    assert.equal(report.operations[0].operationId, null);
    assert.equal(report.routeTotals[0].requests, 1001);
  } finally {
    await f.close();
  }
});

test('Gemini usage records the response model and final reported tokens without adding SSE chunks', async () => {
  const f = await fixture((req: any, res: any) => {
    if (req.url.includes('incomplete')) {
      res.setHeader('content-type', 'text/event-stream');
      res.end(
        'data: ' +
          JSON.stringify({
            modelVersion: 'gemini-incomplete',
            candidates: [{ index: 0, finishReason: 'STOP' }, { index: 1 }],
            usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1, totalTokenCount: 5 },
          }) +
          '\n\n',
      );
      return;
    }
    const modelVersion = req.url.includes('fallback') ? 'gemini-second' : 'gemini-first';
    if (req.url.includes('stream')) {
      res.setHeader('content-type', 'text/event-stream');
      res.write(
        'data: ' +
          JSON.stringify({
            modelVersion,
            usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1, totalTokenCount: 5 },
          }) +
          '\n\n',
      );
      res.end(
        'data: ' +
          JSON.stringify({
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 4,
              candidatesTokenCount: 3,
              totalTokenCount: 9,
              thoughtsTokenCount: 2,
            },
          }) +
          '\n\n',
      );
    } else {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          modelVersion,
          usageMetadata: {
            promptTokenCount: 8,
            candidatesTokenCount: 2,
            totalTokenCount: 10,
            cachedContentTokenCount: 3,
          },
        }),
      );
    }
    assert.equal(req.headers['x-goog-api-key'], 'provider-secret');
    assert.equal(req.headers.authorization, undefined);
  });
  try {
    const route = await f.route({ adapter: 'gemini' });
    const { token } = await f.client([route.id]);
    for (const suffix of ['generate', 'stream-fallback', 'incomplete']) {
      const response = await f.app.inject({
        url: '/gw/test/' + suffix,
        headers: { authorization: 'Bearer ' + token },
      });
      assert.equal(response.statusCode, 200);
    }
    const { models, records } = (await f.app.inject({ url: '/api/usage' })).json();
    assert.deepEqual(
      models
        .map((row: any) => [
          row.model,
          row.requests,
          row.inputTokens,
          row.outputTokens,
          row.totalTokens,
          row.reasoningTokens,
          row.cachedInputTokens,
        ])
        .sort(),
      [
        ['gemini-first', 1, 8, 2, 10, null, 3],
        ['gemini-incomplete', 1, null, null, null, null, null],
        ['gemini-second', 1, 4, 3, 9, 2, null],
      ],
    );
    assert.equal(records.find((row: any) => row.model === 'gemini-incomplete')?.outcome, 'error');
    assert.equal(records.filter((row: any) => row.outcome === 'success').length, 2);
  } finally {
    await f.close();
  }
});

test('OpenRouter keeps reported model costs and shared key usage separate', async () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  const calls: [string, string][] = [];
  let rotate = false;
  let logout = false;
  let malformedKeyReport = false;
  f = await fixture(
    (req: any, res: any) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/v1/key') {
        res.end(
          malformedKeyReport
            ? '{"data":{"usage":"NaN","usage_daily":0,"usage_monthly":2.5e-9,"limit":"-1","limit_remaining":"0","limit_reset":[],"free_model_daily_requests":{"used":"0","limit":"1000","remaining":0}}}'
            : '{"data":{"label":"private-label","usage":0,"limit":null,"limit_remaining":null,"free_model_daily_requests":{"used":0,"limit":1000,"remaining":1000}}}',
        );
      } else if (req.url.endsWith('/free')) {
        res.end(
          '{"model":"org/selected:free","usage":{"prompt_tokens":5,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens":2,"total_tokens":7,"cost":0}}',
        );
      } else {
        res.end(
          '{"model":"org/selected-paid","usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"cost":2.5e-9}}',
        );
      }
    },
    {
      resolveDestination: async () => {
        if (logout) f.db.prepare('DELETE FROM sessions').run();
        if (rotate) {
          const previous = f.context.getCredential;
          f.context.getCredential = (id) => ({ ...previous(id), version: 3 });
        }
        return { address: '93.184.216.34', family: 4 };
      },
      requestProvider: (url, _pin, method, headers) => {
        calls.push([url.href, method]);
        return providerRequest(
          new URL(url.pathname, f.providerOrigin),
          { address: '127.0.0.1', family: 4 },
          method,
          headers,
        );
      },
    },
  );
  try {
    f.db.exec(
      'CREATE TABLE sessions(hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at TEXT NOT NULL)',
    );
    f.db
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(digest('fixture-owner-session'), 'test-csrf', '2026-11-06T12:00:00Z');
    const route = await f.route({
      baseUrl: 'https://openrouter.ai/api/v1/',
      allowPrivateNetwork: false,
    });
    const foreign = await f.route({
      slug: 'foreign',
      baseUrl: 'https://openrouter.ai.example.com/api/v1/',
    });
    const metadata = (id: string) =>
      f.app.inject({
        method: 'POST',
        url: '/api/usage/openrouter/' + id,
        headers: { cookie: 'keydesk_session=fixture-owner-session' },
      });
    assert.equal((await metadata(foreign.id)).statusCode, 400);
    const result = await metadata(route.id);
    assert.equal(result.statusCode, 200);
    assert.doesNotMatch(result.body, /private-label|provider-secret/);
    assert.deepEqual(result.json().freeRequests, { used: 0, max: 1000, remaining: 1000 });
    assert.equal(result.json().limitStatus, 'unset');
    assert.equal(result.json().usage, '0');
    assert.deepEqual(calls, [['https://openrouter.ai/api/v1/key', 'GET']]);
    malformedKeyReport = true;
    const malformed = await metadata(route.id);
    assert.equal(malformed.statusCode, 200);
    assert.deepEqual(malformed.json().freeRequests, { used: null, max: null, remaining: 0 });
    assert.equal(malformed.json().limitStatus, 'unknown');
    assert.equal(malformed.json().limit, null);
    assert.equal(malformed.json().limitRemaining, null);
    assert.equal(malformed.json().limitReset, null);
    assert.equal(malformed.json().usage, null);
    assert.equal(malformed.json().usageDaily, '0');
    assert.equal(malformed.json().usageMonthly, '0.0000000025');
    const { token } = await f.client([route.id]);
    for (const suffix of ['free', 'paid']) {
      assert.equal(
        (
          await f.app.inject({
            method: 'POST',
            url: '/gw/test/' + suffix,
            headers: { authorization: 'Bearer ' + token },
            payload: { model: 'openrouter/auto' },
          })
        ).statusCode,
        200,
      );
    }
    const report = (await f.app.inject('/api/usage')).json();
    assert.equal(report.summary.requests, 2);
    assert.deepEqual(
      report.models
        .map((row: any) => [row.model, row.reportedCostUsd, row.cachedInputTokens])
        .sort(),
      [
        ['org/selected-paid', '0.0000000025', null],
        ['org/selected:free', '0', 0],
      ],
    );
    rotate = true;
    assert.equal((await metadata(route.id)).statusCode, 409);
    rotate = false;
    logout = true;
    assert.equal((await metadata(route.id)).statusCode, 401);
    assert.equal(calls.length, 4);
  } finally {
    await f.close();
  }
});

test('generic auth bindings inject paired headers and custom prefixes without caller override', async () => {
  let received: any;
  const f = await fixture((req: any, res: any) => {
    received = req.headers;
    res.end('{"ok":true}');
  });
  try {
    f.db.prepare("INSERT INTO credentials VALUES('second','entry','{}')").run();
    const original = f.context.getCredential;
    f.context.getCredential = (id) => ({
      ...original(id),
      id,
      value: id === 'second' ? 'secondary-test-key' : 'provider-secret',
    });
    const route = await f.route({
      adapter: 'generic',
      authBindings: [
        { credentialId: 'cred', location: 'header', name: 'X-NCP-APIGW-API-KEY' },
        { credentialId: 'second', location: 'header', name: 'X-NCP-APIGW-API-KEY-ID' },
        { credentialId: 'cred', location: 'header', name: 'Authorization', prefix: 'KakaoAK' },
      ],
    });
    const c = await f.client([route.id]);
    const response = await f.app.inject({
      url: '/gw/test/models',
      headers: {
        authorization: `Bearer ${c.token}`,
        'x-ncp-apigw-api-key': 'caller-key',
        'x-ncp-apigw-api-key-id': 'caller-id',
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(received['x-ncp-apigw-api-key'], 'provider-secret');
    assert.equal(received['x-ncp-apigw-api-key-id'], 'secondary-test-key');
    assert.equal(received.authorization, 'KakaoAK provider-secret');
    assert.equal(JSON.stringify(route).includes('provider-secret'), false);
    assert.equal(
      JSON.stringify(f.db.prepare('SELECT * FROM gateway_usage').all()).includes(
        'secondary-test-key',
      ),
      false,
    );
  } finally {
    await f.close();
  }
});
test('query auth bindings encode once and replace caller keys without forwarding client authorization', async () => {
  let received: any;
  const f = await fixture(
    (req: any, res: any) => {
      const url = new URL(req.url, 'https://example.invalid');
      received = {
        query: url.searchParams,
        rawQuery: url.search,
        headers: req.headers,
      };
      res.end('{"ok":true}');
    },
    {},
    true,
  );
  try {
    const secret = 'test key+/=%한글';
    const original = f.context.getCredential;
    f.context.getCredential = (id) => ({ ...original(id), value: secret });
    const route = await f.route({
      adapter: 'generic',
      authBindings: [{ credentialId: 'cred', location: 'query', name: 'serviceKey' }],
    });
    const c = await f.client([route.id]);
    const response = await f.app.inject({
      url: '/gw/test/cities?serviceKey=caller&?note=kept&q=two%20words&flag&serviceKey=duplicate&tag=a%2fb&SERVICEKEY=upper&tag=a+b&city=seoul',
      headers: { authorization: `Bearer ${c.token}` },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(received.query.getAll('serviceKey'), [secret]);
    assert.equal(received.query.has('SERVICEKEY'), false);
    assert.equal(received.query.get('city'), 'seoul');
    assert.equal(
      received.rawQuery,
      '??note=kept&q=two%20words&flag&tag=a%2fb&tag=a+b&city=seoul&' +
        new URLSearchParams([['serviceKey', secret]]).toString(),
    );
    assert.equal(received.headers.authorization, undefined);
    assert.equal(
      JSON.stringify(f.db.prepare('SELECT * FROM gateway_usage').all()).includes(secret),
      false,
    );
  } finally {
    await f.close();
  }
});
test('auth bindings reject unsafe names, duplicates, mismatched primary and foreign credentials', async () => {
  const f = await fixture();
  try {
    f.db.exec(
      "INSERT INTO credentials VALUES('foreign','foreign-entry','{}'); INSERT INTO entry_projects VALUES('foreign-entry','other');",
    );
    const route = await f.route({ adapter: 'generic' });
    const binding = { credentialId: 'cred', location: 'header', name: 'X-API-Key' };
    const cases = [
      { authBindings: [] },
      { authBindings: [{ ...binding, name: 'Host' }] },
      { authBindings: [{ ...binding, name: 'Cookie' }] },
      { authBindings: [{ ...binding, prefix: 'bad\r\nprefix' }] },
      { authBindings: [binding, { ...binding, name: 'x-api-key' }] },
      { authBindings: [{ ...binding, credentialId: 'foreign' }] },
      { authBindings: [binding, { ...binding, name: 'X-Other', credentialId: 'foreign' }] },
      { authBindings: [binding, { ...binding, name: 'X-Other', credentialId: 'missing' }] },
      { authBindings: [{ ...binding, location: 'query', name: 'bad&name' }] },
      { baseUrl: 'not-a-url', authBindings: [{ ...binding, location: 'query', name: 'apiKey' }] },
      { authBindings: [{ ...binding, location: 'query', prefix: 'Bearer' }] },
      {
        baseUrl: 'http://api.example.com/',
        allowPrivateNetwork: false,
        authBindings: [{ ...binding, location: 'query', name: 'apiKey' }],
      },
      {
        baseUrl: 'http://127.0.0.1:8088/',
        allowPrivateNetwork: true,
        authBindings: [{ ...binding, location: 'query', name: 'apiKey' }],
      },
      { adapter: 'openai', authBindings: [binding] },
    ];
    for (const extra of cases) {
      const response = await f.app.inject({
        method: 'PUT',
        url: `/api/gateway/routes/${route.id}`,
        payload: { ...route, ...extra },
      });
      assert.equal(response.statusCode, 400, JSON.stringify(extra));
    }
  } finally {
    await f.close();
  }
});
test('inactive additional auth bindings never dispatch provider requests', async () => {
  let dispatched = 0;
  const f = await fixture((_req: any, res: any) => {
    dispatched++;
    res.end('{}');
  });
  try {
    f.db.prepare("INSERT INTO credentials VALUES('second','entry','{}')").run();
    const original = f.context.getCredential;
    f.context.getCredential = (id) => ({
      ...original(id),
      id,
      status: id === 'second' ? 'paused' : 'active',
    });
    const route = await f.route({
      adapter: 'generic',
      authBindings: [
        { credentialId: 'cred', location: 'header', name: 'X-Key' },
        { credentialId: 'second', location: 'header', name: 'X-ID' },
      ],
    });
    const c = await f.client([route.id]);
    const response = await f.app.inject({
      url: '/gw/test/models',
      headers: { authorization: `Bearer ${c.token}` },
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(dispatched, 0);
  } finally {
    await f.close();
  }
});
test('client tokens are one-time, hashed, scoped, expiring and revocable', async () => {
  const f = await fixture();
  try {
    const route = await f.route();
    const c = await f.client([route.id]);
    assert.match(c.token, /^kd_/);
    assert.equal(
      JSON.stringify(f.db.prepare('SELECT * FROM gateway_clients').all()).includes(c.token),
      false,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/gateway/clients',
        })
      ).body.includes(c.token),
      false,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${c.token}`,
          },
        })
      ).statusCode,
      200,
    );
    await f.app.inject({
      method: 'PUT',
      url: `/api/gateway/clients/${c.client.id}`,
      payload: {
        revoked: true,
      },
    });
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${c.token}`,
          },
        })
      ).statusCode,
      401,
    );
    const expired = await f.client([route.id], {
      expiresAt: '2026-01-01',
    });
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${expired.token}`,
          },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/gateway/clients',
          payload: {
            name: 'x',
            projectId: 'other',
            routeIds: [route.id],
          },
        })
      ).statusCode,
      400,
    );
  } finally {
    await f.close();
  }
});
test('injects provider auth and removes cookies and incompatible provider headers', async () => {
  let headers: any,
    path = '';
  const f = await fixture((req: any, res: any) => {
    headers = req.headers;
    path = req.url;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        model: 'm',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 3,
          prompt_tokens_details: {
            cached_tokens: 2,
          },
        },
      }),
    );
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    const result = await f.app.inject({
      url: '/gw/test/chat?x=1',
      headers: {
        authorization: `Bearer ${c.token}`,
        cookie: 'session=owner',
        'x-api-key': 'bad',
        'openai-organization': 'bad',
      },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(headers.authorization, 'Bearer provider-secret');
    assert.equal(headers.cookie, undefined);
    assert.equal(headers['x-api-key'], undefined);
    assert.equal(headers['openai-organization'], undefined);
    assert.equal(path, '/v1/chat?x=1');
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.summary.inputTokens, 10);
    assert.equal(u.records[0].credentialVersion, 2);
  } finally {
    await f.close();
  }
});
test('daily hard admission counts only dispatched attempts under concurrency', async () => {
  let calls = 0;
  const f = await fixture((_req: any, res: any) => {
    calls++;
    setTimeout(() => res.end('{}'), 10);
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id], {
      dailyRequestLimit: 3,
    });
    const responses = await Promise.all(
      Array.from(
        {
          length: 12,
        },
        () =>
          f.app.inject({
            url: '/gw/test/x',
            headers: {
              authorization: `Bearer ${c.token}`,
            },
          }),
      ),
    );
    assert.equal(responses.filter((r) => r.statusCode === 200).length, 3);
    assert.equal(responses.filter((r) => r.statusCode === 429).length, 9);
    assert.equal(calls, 3);
    const usage = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(usage.summary.requests, 3);
    assert.equal(usage.summary.unknownUsageCount, 3);
  } finally {
    await f.close();
  }
});
test('rejects private networks without opt in, path escapes and redirects', async () => {
  let calls = 0;
  const f = await fixture((_req: any, res: any) => {
    calls++;
    res.writeHead(302, {
      location: 'http://127.0.0.1:1/',
    });
    res.end();
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    const h = {
      authorization: `Bearer ${c.token}`,
    };
    assert.ok(
      [400, 404].includes(
        (
          await f.app.inject({
            url: '/gw/test/%2e%2e/secret',
            headers: h,
          })
        ).statusCode,
      ),
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/%252e%252e/secret',
          headers: h,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/redirect',
          headers: h,
        })
      ).statusCode,
      502,
    );
    assert.equal(calls, 1);
    await f.app.inject({
      method: 'PUT',
      url: `/api/gateway/routes/${r.id}`,
      payload: {
        ...r,
        baseUrl: r.baseUrl.replace('http:', 'https:'),
        allowPrivateNetwork: false,
      },
    });
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: h,
        })
      ).statusCode,
      502,
    );
    assert.equal(calls, 1);
  } finally {
    await f.close();
  }
});
test('immutable exact decimal price snapshots preserve original currencies', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        model: 'm',
        usage: {
          input_tokens: 10,
          output_tokens: 3,
          input_tokens_details: {
            cached_tokens: 2,
          },
        },
      }),
    );
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    const price = await f.app.inject({
      method: 'POST',
      url: '/api/gateway/prices',
      payload: {
        adapter: 'openai',
        model: 'm',
        currency: 'USD',
        inputPerMillion: '1.25',
        outputPerMillion: '5',
        cachedInputPerMillion: '0.125',
        startsAt: '2026-01-01T00:00:00Z',
      },
    });
    assert.equal(price.statusCode, 200, price.body);
    await f.app.inject({
      url: '/gw/test/responses',
      headers: {
        authorization: `Bearer ${c.token}`,
      },
    });
    const usage = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(usage.records[0].costMicros, 25);
    assert.equal(usage.records[0].currency, 'USD');
    assert.equal(usage.summary.costs[0].amountMicros, 25);
    assert.ok(usage.records[0].priceSnapshot);
  } finally {
    await f.close();
  }
});
test('OpenAI and Anthropic SSE usage is parsed incrementally; truncated usage stays unknown', async () => {
  for (const adapter of ['openai', 'anthropic']) {
    const f = await fixture((_req: any, res: any) => {
      res.setHeader('content-type', 'text/event-stream');
      if (adapter === 'openai') {
        res.write('data: {"model":"m","usage":{"prompt_tokens":4,"completion_tokens":2}}\n\n');
        setTimeout(() => res.end('data: [DONE]\n\n'), 5);
      } else {
        res.write(
          'event: message_start\ndata: {"type":"message_start","message":{"model":"m","usage":{"input_tokens":4,"output_tokens":0}}}\n\n',
        );
        res.write(
          'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
        );
        setTimeout(() => res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n'), 5);
      }
    });
    try {
      const r = await f.route({
        adapter,
      });
      const c = await f.client([r.id]);
      const result = await f.app.inject({
        url: '/gw/test/stream',
        headers: {
          authorization: `Bearer ${c.token}`,
        },
      });
      assert.equal(result.statusCode, 200);
      assert.match(result.body, /data:/);
      const u = (
        await f.app.inject({
          url: '/api/usage',
        })
      ).json();
      assert.equal(u.records[0].inputTokens, 4);
      assert.equal(u.records[0].outputTokens, 2);
      assert.equal(u.records[0].outcome, 'success');
    } finally {
      await f.close();
    }
  }
});
test('truncated or malformed SSE is never reported as successful measured usage', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'text/event-stream');
    res.end('data: {"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\ndata: {broken}\n\n');
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    await f.app.inject({
      url: '/gw/test/stream',
      headers: {
        authorization: `Bearer ${c.token}`,
      },
    });
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.records[0].outcome, 'error');
    assert.equal(u.summary.unknownUsageCount, 1);
  } finally {
    await f.close();
  }
});
test('generic REST bytes and malformed JSON stay successful with unknown usage', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'text/plain');
    res.end('plain REST response');
  });
  try {
    const r = await f.route({
      adapter: 'generic',
    });
    const c = await f.client([r.id]);
    const reply = await f.app.inject({
      url: '/gw/test/plain',
      headers: {
        authorization: `Bearer ${c.token}`,
      },
    });
    assert.equal(reply.body, 'plain REST response');
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.records[0].outcome, 'success');
    assert.equal(u.summary.unknownUsageCount, 1);
  } finally {
    await f.close();
  }
});
test('opt-in generic JSON errors change the usage outcome without changing the response', async () => {
  const providerError = '{"error":[{"code":"500","message":"mock authentication error"}]}';
  const responses = {
    'array-error': ['application/json', providerError],
    'object-error': ['text/plain; charset=utf-8', '{"error":{"msg":"연결 실패"}}'],
    'json-suffix': ['application/problem+json', '{"error":{"code":500}}'],
    'empty-error': ['application/json', '{"error":[],"result":[1]}'],
    'null-error': ['application/json', '{"error":null,"result":[1]}'],
    nonjson: ['text/plain', 'plain REST response'],
    binary: ['application/octet-stream', providerError],
    stream: ['text/event-stream', 'data: ' + providerError + '\n\n'],
    large: [
      'application/json',
      JSON.stringify({ error: { code: 500 }, padding: 'x'.repeat(65 * 1024) }),
    ],
  } as const;
  const f = await fixture((req: any, res: any) => {
    const [contentType, body] = responses[req.url.split('/').at(-1) as keyof typeof responses];
    res.setHeader('content-type', contentType);
    res.end(body);
  });
  try {
    const optedIn = await f.route({ adapter: 'generic', detectJsonError: true });
    const legacy = await f.route({ adapter: 'generic', slug: 'legacy' });
    const c = await f.client([optedIn.id, legacy.id]);
    for (const [slug, path, expectedOutcome] of [
      ['test', 'array-error', 'error'],
      ['test', 'object-error', 'error'],
      ['test', 'json-suffix', 'error'],
      ['test', 'empty-error', 'success'],
      ['test', 'null-error', 'success'],
      ['test', 'nonjson', 'success'],
      ['test', 'binary', 'success'],
      ['test', 'stream', 'success'],
      ['test', 'large', 'success'],
      ['legacy', 'array-error', 'success'],
    ] as const) {
      const reply = await f.app.inject({
        url: '/gw/' + slug + '/' + path,
        headers: { authorization: `Bearer ${c.token}` },
      });
      assert.equal(reply.statusCode, 200);
      assert.equal(reply.body, responses[path][1]);
      const row = String(
        f.db.prepare('SELECT json FROM gateway_usage ORDER BY rowid DESC LIMIT 1').get()!.json,
      );
      const record = JSON.parse(row);
      assert.equal(record.outcome, expectedOutcome, slug + '/' + path);
      assert.equal(record.statusCode, 200);
      assert.equal(record.inputTokens, null);
      assert.equal(row.includes('mock authentication error'), false);
    }
  } finally {
    await f.close();
  }
});
test('JSON error detection persists on generic routes and is rejected on AI adapters', async () => {
  const f = await fixture();
  try {
    const route = await f.route({ adapter: 'generic', detectJsonError: true });
    const listed = await f.app.inject('/api/gateway/routes');
    assert.equal(listed.json().routes[0].detectJsonError, true);
    for (const adapter of ['openai', 'anthropic']) {
      const invalid = await f.app.inject({
        method: 'PUT',
        url: '/api/gateway/routes/' + route.id,
        payload: { ...route, adapter, detectJsonError: true },
      });
      assert.equal(invalid.statusCode, 400);
    }
    const updated = await f.app.inject({
      method: 'PUT',
      url: '/api/gateway/routes/' + route.id,
      payload: { ...route, detectJsonError: false },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().route.detectJsonError, false);
  } finally {
    await f.close();
  }
});
test('Anthropic cached inputs survive later SSE deltas and receive cached pricing', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'text/event-stream');
    res.end(
      'data: {"type":"message_start","message":{"model":"claude","usage":{"input_tokens":8,"cache_read_input_tokens":2,"output_tokens":0}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\ndata: {"type":"message_stop"}\n\n',
    );
  });
  try {
    const r = await f.route({
      adapter: 'anthropic',
    });
    const c = await f.client([r.id]);
    await f.app.inject({
      method: 'POST',
      url: '/api/gateway/prices',
      payload: {
        adapter: 'anthropic',
        model: 'claude',
        currency: 'EUR',
        inputPerMillion: '1.25',
        outputPerMillion: '5',
        cachedInputPerMillion: '0.125',
        startsAt: '2026-01-01T00:00:00Z',
      },
    });
    await f.app.inject({
      url: '/gw/test/messages',
      headers: {
        authorization: `Bearer ${c.token}`,
      },
    });
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.records[0].inputTokens, 10);
    assert.equal(u.records[0].cachedInputTokens, 2);
    assert.equal(u.records[0].costMicros, 25);
    assert.equal(u.summary.costs[0].currency, 'EUR');
    assert.equal(u.summary.costs[0].krwEstimate, undefined);
  } finally {
    await f.close();
  }
});
test('forwards exact request bytes and rejects oversized bodies before dispatch', async () => {
  let calls = 0,
    received = '';
  const f = await fixture(async (req: any, res: any) => {
    calls++;
    for await (const chunk of req) received += chunk;
    res.end('{}');
  });
  try {
    const r = await f.route({
      adapter: 'generic',
    });
    const c = await f.client([r.id]);
    const headers = {
      authorization: `Bearer ${c.token}`,
      'content-type': 'application/json',
    };
    const payload = '{ "a" : 1 }';
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/gw/test/raw',
          headers,
          payload,
        })
      ).statusCode,
      200,
    );
    assert.equal(received, payload);
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/gw/test/large',
          headers,
          payload: 'x'.repeat(2 * 1024 * 1024 + 1),
        })
      ).statusCode,
      413,
    );
    assert.equal(calls, 1);
  } finally {
    await f.close();
  }
});
test('soft token and per-currency cost alerts never become unsafe hard admission', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'application/json');
    res.end('{"model":"m","usage":{"input_tokens":1,"output_tokens":1}}');
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id], {
      dailyTokenAlert: 1,
      dailyCostAlertMicros: 0,
    });
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await f.app.inject({
            url: '/gw/test/x',
            headers: {
              authorization: `Bearer ${c.token}`,
            },
          })
        ).statusCode,
        200,
      );
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.summary.requests, 2);
    assert.ok(u.records.every((row: any) => row.softAlerts.length > 0));
  } finally {
    await f.close();
  }
});
test('real SSE cancellation reaches provider and records a cancelled attempt', async () => {
  let providerClosed!: () => void;
  const closed = new Promise<void>((r) => (providerClosed = r));
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'text/event-stream');
    res.write('data: {"choices":[{"delta":{"content":"first"}}]}\n\n');
    const timer = setInterval(() => res.write(': heartbeat\n\n'), 25);
    res.on('close', () => {
      clearInterval(timer);
      providerClosed();
    });
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    await f.app.listen({
      host: '127.0.0.1',
      port: 0,
    });
    const address = f.app.server.address() as any;
    const { get } = await import('node:http');
    await new Promise<void>((resolve, reject) => {
      const request = get(
        `http://127.0.0.1:${address.port}/gw/test/stream`,
        {
          headers: {
            authorization: `Bearer ${c.token}`,
          },
        },
        (response) => {
          response.once('data', (chunk) => {
            assert.match(chunk.toString(), /first/);
            response.destroy();
            request.destroy();
            resolve();
          });
        },
      );
      request.on('error', reject);
    });
    await Promise.race([
      closed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('provider cancellation timeout')), 2000).unref(),
      ),
    ]);
    await new Promise((r) => setImmediate(r));
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.summary.requests, 1);
    assert.equal(u.records[0].outcome, 'cancelled');
    assert.equal(u.summary.unknownUsageCount, 1);
  } finally {
    await f.close();
  }
});
test('price changes apply to later calls without changing previous snapshots', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'application/json');
    res.end('{"model":"m","usage":{"input_tokens":1,"output_tokens":0}}');
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    for (const rate of ['1', '2']) {
      await f.app.inject({
        method: 'POST',
        url: '/api/gateway/prices',
        payload: {
          adapter: 'openai',
          model: 'm',
          currency: 'USD',
          inputPerMillion: rate,
          outputPerMillion: '0',
          cachedInputPerMillion: '0',
          startsAt: '2026-01-01T00:00:00Z',
        },
      });
      await f.app.inject({
        url: '/gw/test/x',
        headers: {
          authorization: `Bearer ${c.token}`,
        },
      });
    }
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.deepEqual(u.records.map((r: any) => r.costMicros).sort(), [1, 2]);
  } finally {
    await f.close();
  }
});
test('provider HTTP errors count attempts and paused credentials never dispatch', async () => {
  let calls = 0;
  const f = await fixture((_req: any, res: any) => {
    calls++;
    res.writeHead(503, {
      'content-type': 'application/json',
    });
    res.end('{"error":{"message":"unavailable"}}');
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    const headers = {
      authorization: `Bearer ${c.token}`,
    };
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/error',
          headers,
        })
      ).statusCode,
      503,
    );
    const original = f.context.getCredential;
    f.context.getCredential = (id) => ({
      ...original(id),
      status: 'paused',
    });
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/error',
          headers,
        })
      ).statusCode,
      403,
    );
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(calls, 1);
    assert.equal(u.summary.requests, 1);
    assert.equal(u.records[0].outcome, 'error');
  } finally {
    await f.close();
  }
});
test('unknown route assignments and cross-project credentials are rejected', async () => {
  const f = await fixture();
  try {
    const denied = await f.app.inject({
      method: 'POST',
      url: '/api/gateway/routes',
      payload: {
        name: 'x',
        slug: 'x',
        projectId: 'other',
        credentialId: 'cred',
        baseUrl: 'https://example.com/',
        allowedMethods: ['GET'],
        adapter: 'generic',
        enabled: true,
        allowPrivateNetwork: false,
      },
    });
    assert.equal(denied.statusCode, 400);
    const r = await f.route();
    const second = await f.route({
      slug: 'second',
    });
    const c = await f.client([r.id]);
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/second/x',
          headers: {
            authorization: `Bearer ${c.token}`,
          },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/usage',
        })
      ).json().summary.requests,
      0,
    );
    assert.ok(second.id);
  } finally {
    await f.close();
  }
});
test('oversized provider response is aborted and never recorded as successful', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'application/octet-stream');
    res.end(Buffer.alloc(33 * 1024 * 1024, 120));
  });
  try {
    const r = await f.route({
      adapter: 'generic',
    });
    const c = await f.client([r.id]);
    await assert.rejects(
      f.app.inject({
        url: '/gw/test/large',
        headers: {
          authorization: `Bearer ${c.token}`,
        },
      }),
    );
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.summary.requests, 1);
    assert.equal(u.records[0].outcome, 'error');
    assert.equal(u.summary.unknownUsageCount, 1);
  } finally {
    await f.close();
  }
});
test('aggregate costs and daily alerts add exact sub-micro values before rounding', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'application/json');
    res.end('{"model":"m","usage":{"input_tokens":1,"output_tokens":0}}');
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id], {
      dailyCostAlertMicros: 1,
    });
    await f.app.inject({
      method: 'POST',
      url: '/api/gateway/prices',
      payload: {
        adapter: 'openai',
        model: 'm',
        currency: 'USD',
        inputPerMillion: '0.15',
        outputPerMillion: '0',
        cachedInputPerMillion: '0',
        startsAt: '2026-01-01T00:00:00Z',
      },
    });
    for (let i = 0; i < 7; i++)
      await f.app.inject({
        url: '/gw/test/x',
        headers: {
          authorization: `Bearer ${c.token}`,
        },
      });
    const usage = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(usage.summary.costs[0].amountMicros, 1);
    assert.equal(usage.summary.costs[0].amountExactMicros, '1.050000000');
    assert.equal(usage.records.filter((r: any) => r.softAlerts.length > 0).length, 1);
    const first = usage.records[0];
    for (let i = 0; i < 93; i++) {
      const row = {
        ...first,
        id: 'extra-' + i,
        softAlerts: [],
      };
      f.db
        .prepare('INSERT INTO gateway_usage VALUES(?,?,?,?,?)')
        .run(row.id, row.projectId, row.clientId, row.createdAt, JSON.stringify(row));
    }
    const total = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(total.summary.costs[0].amountMicros, 15);
    assert.equal(total.summary.costs[0].amountExactMicros, '15.000000000');
  } finally {
    await f.close();
  }
});
test('aggregate overflow returns exact fixed-point amount without unsafe numeric cost', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 2; i++) {
      const r = {
        id: 'overflow-' + i,
        createdAt: f.context.now().toISOString(),
        projectId: 'p',
        clientId: 'c',
        routeId: 'r',
        credentialId: 'cred',
        credentialVersion: 1,
        model: 'm',
        statusCode: 200,
        durationMs: 0,
        outcome: 'success',
        inputTokens: 1,
        outputTokens: 0,
        cachedInputTokens: 0,
        usageSource: 'openai JSON',
        currency: 'USD',
        costMicros: Number.MAX_SAFE_INTEGER,
        costExactMicros: Number.MAX_SAFE_INTEGER + '.000000000',
      };
      f.db
        .prepare('INSERT INTO gateway_usage VALUES(?,?,?,?,?)')
        .run(r.id, r.projectId, r.clientId, r.createdAt, JSON.stringify(r));
    }
    const usage = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(usage.summary.costs[0].amountMicros, null);
    assert.equal(usage.summary.costs[0].amountExactMicros, '18014398509481982.000000000');
    assert.equal(usage.summary.costs[0].overflow, true);
  } finally {
    await f.close();
  }
});
test('Responses incomplete, failed and in-progress JSON never report successful completion', async () => {
  for (const status of ['incomplete', 'failed', 'in_progress', 'queued']) {
    const f = await fixture((_req: any, res: any) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          object: 'response',
          status,
          model: 'm',
          usage: {
            input_tokens: 4,
            output_tokens: 2,
          },
        }),
      );
    });
    try {
      const r = await f.route();
      const c = await f.client([r.id]);
      await f.app.inject({
        url: '/gw/test/responses',
        headers: {
          authorization: `Bearer ${c.token}`,
        },
      });
      const u = (
        await f.app.inject({
          url: '/api/usage',
        })
      ).json();
      assert.equal(u.records[0].outcome, 'error', status);
      assert.equal(
        u.records[0].inputTokens,
        4,
        'trusted observed usage remains known despite non-success outcome',
      );
    } finally {
      await f.close();
    }
  }
});
test('Anthropic cache-write usage preserves token categories and marks unsupported cost unknown', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        model: 'claude',
        usage: {
          input_tokens: 3,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 2,
          output_tokens: 4,
        },
      }),
    );
  });
  try {
    const r = await f.route({
      adapter: 'anthropic',
    });
    const c = await f.client([r.id]);
    await f.app.inject({
      method: 'POST',
      url: '/api/gateway/prices',
      payload: {
        adapter: 'anthropic',
        model: 'claude',
        currency: 'USD',
        inputPerMillion: '3',
        outputPerMillion: '15',
        cachedInputPerMillion: '0.3',
        startsAt: '2026-01-01T00:00:00Z',
      },
    });
    await f.app.inject({
      url: '/gw/test/messages',
      headers: {
        authorization: `Bearer ${c.token}`,
      },
    });
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(u.records[0].inputTokens, 1005);
    assert.equal(u.records[0].cacheCreationInputTokens, 1000);
    assert.equal(u.records[0].costMicros, null);
    assert.equal(u.records[0].costExactMicros, null);
    assert.equal(u.records[0].costStatus, 'unsupported-cache-write');
    assert.equal(u.records[0].priceSnapshot.model, 'claude');
    assert.equal(u.summary.unknownUsageCount, 0);
  } finally {
    await f.close();
  }
});
test('disconnect during delayed destination resolution never dispatches or reserves a daily attempt', async () => {
  let calls = 0,
    enter!: () => void,
    release!: () => void,
    exit!: () => void;
  const entered = new Promise<void>((r) => (enter = r));
  const gate = new Promise<void>((r) => (release = r));
  const exited = new Promise<void>((r) => (exit = r));
  const f = await fixture(
    (_req: any, res: any) => {
      calls++;
      res.end('{}');
    },
    {
      limits: {
        globalInFlight: 1,
      },
      resolveDestination: async (url: URL, allowPrivate: boolean) => {
        enter();
        await gate;
        const pin = await pinDestination(url, allowPrivate);
        exit();
        return pin;
      },
    },
  );
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    await f.app.listen({
      host: '127.0.0.1',
      port: 0,
    });
    const address = f.app.server.address() as any;
    const { get } = await import('node:http');
    const serverClosed = new Promise<void>((resolve) =>
      f.app.server.once('connection', (socket) => socket.once('close', () => resolve())),
    );
    const request = get(
      `http://127.0.0.1:${address.port}/gw/test/x`,
      {
        headers: {
          authorization: `Bearer ${c.token}`,
        },
      },
      (response) => response.resume(),
    );
    request.on('error', () => {});
    const didEnter = await Promise.race([
      entered.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 100)),
    ]);
    assert.equal(didEnter, true, 'gateway must use the destination resolver dependency');
    const clientClosed = new Promise<void>((resolve) => request.once('close', () => resolve()));
    request.destroy();
    await clientClosed;
    await serverClosed;
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${c.token}`,
          },
        })
      ).statusCode,
      429,
      'pending DNS work must retain its global in-flight slot',
    );
    release();
    await exited;
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 0);
    assert.equal(
      f.db.prepare('SELECT COALESCE(SUM(requests),0) AS n FROM gateway_daily').get()!.n,
      0,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/usage',
        })
      ).json().summary.requests,
      0,
    );
  } finally {
    release();
    await f.close();
  }
});
test('early unauthenticated IP rate limiting bounds invalid key bursts and expires windows', async () => {
  let resolutions = 0;
  const f = await fixture(undefined, {
    limits: {
      ipRequestsPerMinute: 2,
    },
    resolveDestination: async (url: URL, allowPrivate: boolean) => {
      resolutions++;
      return pinDestination(url, allowPrivate);
    },
  });
  try {
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await f.app.inject({
            url: '/gw/test/x',
            remoteAddress: '192.0.2.3',
          })
        ).statusCode,
        401,
      );
    const limited = await f.app.inject({
      url: '/gw/test/x',
      remoteAddress: '192.0.2.3',
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers['retry-after'], '60');
    assert.equal(resolutions, 0);
    f.context.now = () => new Date('2026-11-05T12:01:01Z');
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          remoteAddress: '192.0.2.3',
        })
      ).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
test('per-client in-flight admission bounds real provider concurrency and releases slots', async () => {
  let active = 0,
    maxActive = 0,
    calls = 0;
  const f = await fixture(
    (_req: any, res: any) => {
      calls++;
      active++;
      maxActive = Math.max(active, maxActive);
      setTimeout(() => {
        active--;
        res.end('{}');
      }, 25);
    },
    {
      limits: {
        clientInFlight: 2,
      },
    },
  );
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    const responses = await Promise.all(
      Array.from(
        {
          length: 6,
        },
        () =>
          f.app.inject({
            url: '/gw/test/x',
            headers: {
              authorization: `Bearer ${c.token}`,
            },
          }),
      ),
    );
    assert.equal(responses.filter((r) => r.statusCode === 200).length, 2);
    assert.equal(responses.filter((r) => r.statusCode === 429).length, 4);
    assert.equal(maxActive, 2);
    assert.equal(calls, 2);
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${c.token}`,
          },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/usage',
        })
      ).json().summary.requests,
      3,
    );
  } finally {
    await f.close();
  }
});
test('client request rate and global in-flight bounds stay separate from daily quota', async () => {
  const f = await fixture((_req: any, res: any) => setTimeout(() => res.end('{}'), 20), {
    limits: {
      clientRequestsPerMinute: 2,
      globalInFlight: 2,
      clientInFlight: 8,
    },
  });
  try {
    const r = await f.route();
    const c = await f.client([r.id]);
    const other = await f.client([r.id]);
    const responses = await Promise.all(
      [c, c, other, other].map((client) =>
        f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${client.token}`,
          },
        }),
      ),
    );
    assert.equal(responses.filter((r) => r.statusCode === 200).length, 2);
    assert.equal(responses.filter((r) => r.statusCode === 429).length, 2);
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${c.token}`,
          },
        })
      ).statusCode,
      429,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/usage',
        })
      ).json().summary.requests,
      2,
    );
  } finally {
    await f.close();
  }
});
test('generic routes inject owner-selected bounded authentication headers without caller override', async () => {
  let headers: any;
  const f = await fixture((req: any, res: any) => {
    headers = req.headers;
    res.end('ok');
  });
  try {
    const r = await f.route({
      adapter: 'generic',
      authHeader: 'appkey',
      authScheme: 'raw',
    });
    const c = await f.client([r.id]);
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          headers: {
            authorization: `Bearer ${c.token}`,
            appkey: 'caller-key',
            cookie: 'owner',
          },
        })
      ).statusCode,
      200,
    );
    assert.equal(headers.appkey, 'provider-secret');
    assert.equal(headers.authorization, undefined);
    assert.equal(headers.cookie, undefined);
    for (const authHeader of [
      'Host',
      'Connection',
      'Cookie',
      'Content-Type',
      'X-Forwarded-For',
      'proxy-authorization',
      'Accept-Encoding',
      'bad\r\nheader',
      'x'.repeat(65),
    ]) {
      const rejected = await f.app.inject({
        method: 'PUT',
        url: `/api/gateway/routes/${r.id}`,
        payload: {
          ...r,
          authHeader,
        },
      });
      assert.equal(rejected.statusCode, 400, authHeader);
    }
  } finally {
    await f.close();
  }
});
test('IP admission bucket storage is bounded and expired identities are reclaimed', async () => {
  const f = await fixture(undefined, {
    limits: {
      maxBuckets: 2,
      ipRequestsPerMinute: 2,
    },
  });
  try {
    for (const ip of ['192.0.2.1', '192.0.2.2'])
      assert.equal(
        (
          await f.app.inject({
            url: '/gw/test/x',
            remoteAddress: ip,
          })
        ).statusCode,
        401,
      );
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          remoteAddress: '192.0.2.3',
        })
      ).statusCode,
      429,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          remoteAddress: '192.0.2.1',
        })
      ).statusCode,
      401,
    );
    f.context.now = () => new Date('2026-11-05T12:01:01Z');
    assert.equal(
      (
        await f.app.inject({
          url: '/gw/test/x',
          remoteAddress: '192.0.2.3',
        })
      ).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
test('unknown cache-write cost does not trigger a zero-cost alert as measured zero', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      '{"model":"claude","usage":{"input_tokens":0,"cache_creation_input_tokens":2,"output_tokens":0}}',
    );
  });
  try {
    const r = await f.route({
      adapter: 'anthropic',
    });
    const c = await f.client([r.id], {
      dailyCostAlertMicros: 0,
    });
    await f.app.inject({
      method: 'POST',
      url: '/api/gateway/prices',
      payload: {
        adapter: 'anthropic',
        model: 'claude',
        currency: 'USD',
        inputPerMillion: '3',
        outputPerMillion: '15',
        cachedInputPerMillion: '0.3',
        startsAt: '2026-01-01T00:00:00Z',
      },
    });
    await f.app.inject({
      url: '/gw/test/x',
      headers: {
        authorization: `Bearer ${c.token}`,
      },
    });
    const u = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.deepEqual(u.records[0].softAlerts, []);
    assert.deepEqual(u.summary.costs, []);
  } finally {
    await f.close();
  }
});
test('dedicated adapters accept only their prescribed authentication header and scheme', async () => {
  const f = await fixture();
  try {
    await f.route({
      authHeader: 'Authorization',
      authScheme: 'bearer',
    });
    const bad = await f.app.inject({
      method: 'POST',
      url: '/api/gateway/routes',
      payload: {
        name: 'bad',
        slug: 'bad',
        projectId: 'p',
        credentialId: 'cred',
        baseUrl: 'https://example.com/',
        allowedMethods: ['GET'],
        adapter: 'anthropic',
        enabled: true,
        allowPrivateNetwork: false,
        authHeader: 'authorization',
        authScheme: 'bearer',
      },
    });
    assert.equal(bad.statusCode, 400);
    await f.route({
      slug: 'anthropic',
      adapter: 'anthropic',
      authHeader: 'X-API-Key',
      authScheme: 'raw',
    });
  } finally {
    await f.close();
  }
});
test('gateway idle drain waits for cancelled relay accounting after downstream closes', async () => {
  const f = await fixture((_req: any, res: any) => {
    res.setHeader('content-type', 'text/event-stream');
    res.write('data: {"choices":[]}\n\n');
    const timer = setInterval(() => res.write(': heartbeat\n\n'), 25);
    res.once('close', () => clearInterval(timer));
  });
  try {
    assert.equal(typeof f.app.gatewayWaitForIdle, 'function');
    const r = await f.route();
    const c = await f.client([r.id]);
    await f.app.listen({
      host: '127.0.0.1',
      port: 0,
    });
    const address = f.app.server.address() as any;
    const { get } = await import('node:http');
    let started!: () => void;
    const first = new Promise<void>((resolve) => (started = resolve));
    const request = get(
      `http://127.0.0.1:${address.port}/gw/test/stream`,
      {
        headers: {
          authorization: `Bearer ${c.token}`,
        },
      },
      (response) => response.once('data', () => started()),
    );
    request.on('error', () => {});
    await first;
    let drained = false;
    const idle = f.app.gatewayWaitForIdle().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drained, false);
    request.destroy();
    await idle;
    const usage = (
      await f.app.inject({
        url: '/api/usage',
      })
    ).json();
    assert.equal(usage.summary.requests, 1);
    assert.equal(usage.records[0].outcome, 'cancelled');
  } finally {
    await f.close();
  }
});
