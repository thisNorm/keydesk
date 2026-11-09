import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type {
  GatewayRoute,
  GatewayClient,
  ModelPrice,
  UsageRecord,
  UsageSummary,
} from '@keydesk/contracts';
import type { CoreContext } from '../context.ts';
import {
  bad,
  parse,
  routeSchema,
  clientSchema,
  clientUpdate,
  priceSchema,
  expired,
  localDay,
} from './validation.ts';
import {
  MAX_REQUEST,
  MAX_RESPONSE,
  pinDestination,
  providerRequest,
  targetUrl,
  validateBase,
} from './transport.ts';
import { GatewayAdmission } from './limits.ts';
import {
  UsageParser,
  priceCost,
  storedCostUnits,
  exactMicros,
  roundedMicros,
  SCALE,
} from './usage.ts';
declare module 'fastify' {
  interface FastifyInstance {
    gatewayWaitForIdle: () => Promise<void>;
  }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type StoredUsage = UsageRecord & {
  priceSnapshot: ModelPrice | null;
  costExactMicros: string | null;
  softAlerts: string[];
  cacheCreationInputTokens: number | null;
  costStatus: NonNullable<UsageRecord['costStatus']>;
};
export interface GatewayOptions {
  resolveDestination?: typeof pinDestination;
  limits?: Partial<import('./limits.ts').GatewayLimits>;
}
export async function registerGateway(
  app: FastifyInstance,
  context: CoreContext,
  options: GatewayOptions = {},
): Promise<void> {
  context.db.exec(
    `CREATE TABLE IF NOT EXISTS gateway_routes(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,credential_id TEXT NOT NULL,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS gateway_clients(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS gateway_prices(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS gateway_usage(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,client_id TEXT NOT NULL,created_at TEXT NOT NULL,json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS gateway_usage_created ON gateway_usage(created_at); CREATE INDEX IF NOT EXISTS gateway_usage_client_created ON gateway_usage(client_id,created_at); CREATE TABLE IF NOT EXISTS gateway_daily(client_id TEXT NOT NULL,day TEXT NOT NULL,requests INTEGER NOT NULL,PRIMARY KEY(client_id,day));`,
  );
  const all = <T>(table: string): T[] =>
    context.db
      .prepare(`SELECT json FROM ${table}`)
      .all()
      .map((r) => JSON.parse(String(r.json)) as T);
  const find = <T>(table: string, id: string): T => {
    const row = context.db.prepare(`SELECT json FROM ${table} WHERE id=?`).get(id);
    if (!row) bad('항목을 찾을 수 없습니다.', 404);
    return JSON.parse(String(row.json)) as T;
  };
  const project = (id: string) => {
    if (!context.db.prepare('SELECT id FROM projects WHERE id=?').get(id))
      bad('프로젝트를 찾을 수 없습니다.');
  };
  const credentialScope = (credentialId: string, projectId: string) => {
    if (
      !context.db
        .prepare(
          'SELECT c.id FROM credentials c JOIN entry_projects p ON p.entry_id=c.entry_id WHERE c.id=? AND p.project_id=?',
        )
        .get(credentialId, projectId)
    )
      bad('해당 프로젝트에 연결된 인증값이 아닙니다.');
  };
  const saveClient = (client: GatewayClient) =>
    context.db
      .prepare('UPDATE gateway_clients SET json=? WHERE id=?')
      .run(JSON.stringify(client), client.id);
  const prune = () => {
    const cutoff = new Date(
      context.now().getTime() - context.getSettings().retentionDays * 86400000,
    ).toISOString();
    context.db.prepare('DELETE FROM gateway_usage WHERE created_at<?').run(cutoff);
    context.db.prepare('DELETE FROM gateway_daily WHERE day<?').run(cutoff.slice(0, 10));
  };
  function scopedRoutes(projectId: string, ids: string[]) {
    project(projectId);
    for (const id of ids) {
      const route = find<GatewayRoute>('gateway_routes', id);
      if (route.projectId !== projectId) bad('다른 프로젝트의 경로를 할당할 수 없습니다.');
    }
  }
  function checkRoute(draft: any, id?: string) {
    project(draft.projectId);
    credentialScope(draft.credentialId, draft.projectId);
    validateBase(draft.baseUrl, draft.allowPrivateNetwork);
    if (all<GatewayRoute>('gateway_routes').some((r) => r.slug === draft.slug && r.id !== id))
      bad('이미 사용 중인 경로 별칭입니다.', 409);
    if (
      id &&
      all<GatewayClient>('gateway_clients').some(
        (c) => c.routeIds.includes(id) && c.projectId !== draft.projectId,
      )
    )
      bad('사용 중인 경로의 프로젝트를 변경할 수 없습니다.', 409);
  }
  app.get('/api/gateway/routes', async () => ({
    routes: all<GatewayRoute>('gateway_routes'),
  }));
  app.post('/api/gateway/routes', async (req) => {
    const draft = parse(routeSchema, req.body);
    checkRoute(draft);
    const now = context.now().toISOString();
    const route = {
      ...draft,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    context.db
      .prepare('INSERT INTO gateway_routes VALUES(?,?,?,?)')
      .run(route.id, route.projectId, route.credentialId, JSON.stringify(route));
    context.audit('gateway.route.create', {
      id: route.id,
    });
    return {
      route,
    };
  });
  app.put('/api/gateway/routes/:id', async (req) => {
    const id = (req.params as any).id;
    const previous = find<GatewayRoute>('gateway_routes', id);
    const draft = parse(routeSchema, req.body);
    checkRoute(draft, id);
    const route = {
      ...draft,
      id,
      createdAt: previous.createdAt,
      updatedAt: context.now().toISOString(),
    };
    context.db
      .prepare('UPDATE gateway_routes SET project_id=?,credential_id=?,json=? WHERE id=?')
      .run(route.projectId, route.credentialId, JSON.stringify(route), id);
    context.audit('gateway.route.update', {
      id,
    });
    return {
      route,
    };
  });
  app.delete('/api/gateway/routes/:id', async (req) => {
    const id = (req.params as any).id;
    find('gateway_routes', id);
    if (all<GatewayClient>('gateway_clients').some((c) => !c.revoked && c.routeIds.includes(id)))
      bad('클라이언트가 사용하는 경로입니다.', 409);
    context.db.prepare('DELETE FROM gateway_routes WHERE id=?').run(id);
    context.audit('gateway.route.delete', {
      id,
    });
    return {
      deleted: true,
    };
  });
  app.get('/api/gateway/clients', async () => ({
    clients: all<GatewayClient>('gateway_clients'),
  }));
  app.post('/api/gateway/clients', async (req) => {
    const draft = parse(clientSchema, req.body);
    scopedRoutes(draft.projectId, draft.routeIds);
    const token = 'kd_' + randomBytes(32).toString('base64url');
    const client: GatewayClient = {
      ...draft,
      id: randomUUID(),
      routeIds: [...new Set(draft.routeIds)],
      prefix: token.slice(0, 11),
      revoked: false,
      createdAt: context.now().toISOString(),
      lastUsedAt: null,
    };
    context.db
      .prepare('INSERT INTO gateway_clients VALUES(?,?,?,?)')
      .run(client.id, client.projectId, hash(token), JSON.stringify(client));
    context.audit('gateway.client.create', {
      id: client.id,
    });
    return {
      client,
      token,
    };
  });
  app.put('/api/gateway/clients/:id', async (req) => {
    const id = (req.params as any).id;
    const previous = find<GatewayClient>('gateway_clients', id);
    const changes = parse(clientUpdate, req.body);
    if (previous.revoked && changes.revoked === false)
      bad('폐기한 키는 다시 활성화할 수 없습니다.');
    const client = {
      ...previous,
      ...changes,
    };
    saveClient(client);
    context.audit('gateway.client.update', {
      id,
      revoked: client.revoked,
    });
    return {
      client,
    };
  });
  app.get('/api/gateway/prices', async () => ({
    prices: all<ModelPrice>('gateway_prices'),
  }));
  app.post('/api/gateway/prices', async (req) => {
    const draft = parse(priceSchema, req.body);
    const price = {
      ...draft,
      id: randomUUID(),
      createdAt: context.now().toISOString(),
    };
    context.db
      .prepare('INSERT INTO gateway_prices VALUES(?,?)')
      .run(price.id, JSON.stringify(price));
    context.audit('gateway.price.create', {
      id: price.id,
    });
    return {
      price,
    };
  });
  app.get('/api/usage', async (req) => {
    const q = req.query as Record<string, string>;
    if (Object.keys(q).some((k) => !['projectId', 'days'].includes(k))) bad();
    const days = q.days === undefined ? 30 : Number(q.days);
    if (!Number.isInteger(days) || days < 1 || days > 366) bad();
    if (q.projectId) project(q.projectId);
    prune();
    const cutoff = new Date(context.now().getTime() - days * 86400000).toISOString();
    const rows = q.projectId
      ? context.db
          .prepare(
            'SELECT json FROM gateway_usage WHERE created_at>=? AND project_id=? ORDER BY created_at DESC',
          )
          .all(cutoff, q.projectId)
      : context.db
          .prepare('SELECT json FROM gateway_usage WHERE created_at>=? ORDER BY created_at DESC')
          .all(cutoff);
    const records = rows.map((r) => JSON.parse(String(r.json)) as StoredUsage);
    const summary: UsageSummary = {
      requests: records.length,
      inputTokens: 0,
      outputTokens: 0,
      unknownUsageCount: 0,
      costs: [],
    };
    const costs = new Map<string, bigint>();
    for (const r of records) {
      summary.inputTokens += r.inputTokens ?? 0;
      summary.outputTokens += r.outputTokens ?? 0;
      if (r.inputTokens === null || r.outputTokens === null) summary.unknownUsageCount++;
      const exact = storedCostUnits(r);
      if (r.currency && exact !== null)
        costs.set(r.currency, (costs.get(r.currency) ?? 0n) + exact);
    }
    for (const [currency, total] of costs) {
      const amountMicros = roundedMicros(total);
      const item = {
        currency,
        amountMicros,
        amountExactMicros: exactMicros(total),
        overflow: amountMicros === null,
      } as UsageSummary['costs'][number];
      if (amountMicros !== null && currency === 'USD')
        item.krwEstimate = (amountMicros / 1e6) * Number(context.getSettings().krwExchangeRate);
      if (amountMicros !== null && currency === 'KRW') item.krwEstimate = amountMicros / 1e6;
      summary.costs.push(item);
    }
    return {
      records: records.slice(0, 1000),
      summary,
    };
  });
  function authorize(req: FastifyRequest): {
    route: GatewayRoute;
    client: GatewayClient;
    credential: ReturnType<CoreContext['getCredential']>;
  } {
    const bearer = req.headers.authorization;
    if (typeof bearer !== 'string' || !/^Bearer kd_[A-Za-z0-9_-]{43}$/.test(bearer))
      bad('클라이언트 키가 필요합니다.', 401);
    const row = context.db
      .prepare('SELECT json FROM gateway_clients WHERE token_hash=?')
      .get(hash(bearer.slice(7)));
    if (!row) bad('클라이언트 키가 올바르지 않습니다.', 401);
    const client = JSON.parse(String(row.json)) as GatewayClient;
    if (client.revoked || expired(client.expiresAt, context.now(), context.getSettings().timeZone))
      bad('폐기되었거나 만료된 클라이언트 키입니다.', 401);
    const route = all<GatewayRoute>('gateway_routes').find(
      (r) => r.slug === (req.params as any).slug,
    );
    if (
      !route ||
      !route.enabled ||
      route.projectId !== client.projectId ||
      !client.routeIds.includes(route.id)
    )
      bad('허용되지 않는 중계 경로입니다.', 403);
    if (!route.allowedMethods.includes(req.method)) bad('허용되지 않는 요청 메서드입니다.', 405);
    credentialScope(route.credentialId, route.projectId);
    const credential = context.getCredential(route.credentialId);
    if (
      credential.status !== 'active' ||
      expired(credential.expiresAt, context.now(), context.getSettings().timeZone)
    )
      bad('사용할 수 없는 제공사 인증값입니다.', 403);
    return {
      route,
      client,
      credential,
    };
  }
  const admission = new GatewayAdmission(() => context.now().getTime(), options.limits);
  app.decorate('gatewayWaitForIdle', () => admission.waitForIdle());
  const leases = new WeakMap<
    FastifyRequest,
    {
      release: () => void;
      ownedByRelay: boolean;
    }
  >();
  async function relay(req: FastifyRequest, reply: FastifyReply) {
    const lease = leases.get(req);
    if (lease) lease.ownedByRelay = true;
    let cancelled = req.raw.aborted || reply.raw.destroyed;
    let upstream: ReturnType<typeof providerRequest> | undefined;
    let reserved:
      | {
          clientId: string;
          day: string;
        }
      | undefined;
    let dispatched = false;
    const drainAbort = new AbortController();
    const onClose = () => {
      if (!reply.raw.writableEnded) {
        cancelled = true;
        drainAbort.abort();
        upstream?.destroy(new Error('클라이언트 연결이 종료되었습니다.'));
      }
    };
    reply.raw.once('close', onClose);
    req.raw.once('aborted', onClose);
    try {
      if (cancelled) {
        reply.hijack();
        return;
      }
      let authorized = authorize(req);
      const raw = req.raw.url ?? req.url;
      const prefix = '/gw/' + (req.params as any).slug + '/';
      if (!raw.startsWith(prefix)) bad('요청 경로가 올바르지 않습니다.');
      const url = targetUrl(
        authorized.route.baseUrl,
        raw.slice(prefix.length),
        authorized.route.allowPrivateNetwork,
      );
      let pin: Awaited<ReturnType<typeof pinDestination>>;
      try {
        pin = await (options.resolveDestination ?? pinDestination)(
          url,
          authorized.route.allowPrivateNetwork,
        );
      } catch {
        bad('제공사 목적지에 연결할 수 없습니다.', 502);
      }
      if (cancelled || req.raw.aborted || reply.raw.destroyed) {
        reply.hijack();
        return;
      }
      const previousRoute = JSON.stringify(authorized.route);
      authorized = authorize(req);
      if (JSON.stringify(authorized.route) !== previousRoute)
        bad('경로 설정이 변경되었습니다. 다시 요청해 주세요.', 409);
      const { route, client, credential } = authorized;
      let body: Buffer | undefined;
      if (req.body !== undefined) {
        if (Buffer.isBuffer(req.body)) body = req.body;
        else if (typeof req.body === 'string') body = Buffer.from(req.body);
        else body = Buffer.from(JSON.stringify(req.body));
        if (body.length > MAX_REQUEST) bad('요청 크기 제한을 초과했습니다.', 413);
      }
      if (/[\r\n]/.test(credential.value)) bad('제공사 인증값이 올바르지 않습니다.', 502);
      const day = localDay(context.now(), context.getSettings().timeZone);
      context.db.prepare('INSERT OR IGNORE INTO gateway_daily VALUES(?,?,0)').run(client.id, day);
      const admitted = context.db
        .prepare(
          'UPDATE gateway_daily SET requests=requests+1 WHERE client_id=? AND day=? AND (? IS NULL OR requests<?)',
        )
        .run(client.id, day, client.dailyRequestLimit, client.dailyRequestLimit);
      if (admitted.changes !== 1) bad('일일 호출 수 제한에 도달했습니다.', 429);
      reserved = {
        clientId: client.id,
        day,
      };
      client.lastUsedAt = context.now().toISOString();
      saveClient(client);
      const createdAt = context.now().toISOString();
      const started = performance.now();
      const prices = all<ModelPrice>('gateway_prices')
        .reverse()
        .filter(
          (p) => p.adapter === route.adapter && Date.parse(p.startsAt) <= Date.parse(createdAt),
        )
        .sort(
          (a, b) =>
            Date.parse(b.startsAt) - Date.parse(a.startsAt) ||
            b.createdAt.localeCompare(a.createdAt),
        );
      const headers: Record<string, string> = Object.create(null);
      for (const key of ['accept', 'content-type']) {
        const value = req.headers[key];
        if (typeof value === 'string') headers[key] = value;
      }
      if (route.adapter === 'anthropic') {
        headers['x-api-key'] = credential.value;
        headers['anthropic-version'] =
          typeof req.headers['anthropic-version'] === 'string'
            ? req.headers['anthropic-version']
            : '2023-06-01';
      } else if (route.adapter === 'generic')
        headers[(route.authHeader ?? 'authorization').toLowerCase()] =
          (route.authScheme === 'raw' ? '' : 'Bearer ') + credential.value;
      else headers.authorization = 'Bearer ' + credential.value;
      if (body) headers['content-length'] = String(body.length);
      headers['accept-encoding'] = 'identity';
      let statusCode: number | null = null;
      let outcome: UsageRecord['outcome'] = 'error';
      let parser: UsageParser | undefined;
      let recorded = false;
      let responseStarted = false;
      function record() {
        if (!dispatched || recorded) return;
        recorded = true;
        const known = parser?.known === true;
        const price = known ? prices.find((p) => p.model === parser!.model) : undefined;
        const unsupportedCacheWrite = (parser?.cacheCreationInputTokens ?? 0) > 0;
        const cost =
          price && !unsupportedCacheWrite
            ? priceCost(price, parser!.input!, parser!.output!, parser!.cached ?? 0)
            : undefined;
        const r: StoredUsage = {
          id: randomUUID(),
          createdAt,
          projectId: route.projectId,
          clientId: client.id,
          routeId: route.id,
          credentialId: credential.id,
          credentialVersion: credential.version,
          model: parser?.model ?? null,
          statusCode,
          durationMs: Math.round(performance.now() - started),
          outcome,
          inputTokens: known ? parser!.input : null,
          outputTokens: known ? parser!.output : null,
          cachedInputTokens: known ? parser!.cached : null,
          usageSource: known ? route.adapter + (parser!.sse ? ' SSE' : ' JSON') : '미확인',
          currency: price?.currency ?? null,
          costMicros: cost?.costMicros ?? null,
          priceSnapshot: price ?? null,
          costExactMicros: cost?.costExactMicros ?? null,
          softAlerts: [],
          cacheCreationInputTokens: known ? parser!.cacheCreationInputTokens : null,
          costStatus: unsupportedCacheWrite
            ? 'unsupported-cache-write'
            : cost
              ? cost.costMicros === null
                ? 'overflow'
                : 'estimated'
              : known
                ? 'unpriced'
                : 'unknown-usage',
        };
        if (client.dailyTokenAlert !== null || client.dailyCostAlertMicros !== null) {
          const prior = context.db
            .prepare('SELECT json FROM gateway_usage WHERE client_id=? AND created_at>=?')
            .all(client.id, new Date(Date.parse(createdAt) - 48 * 3600000).toISOString())
            .map((row) => JSON.parse(String(row.json)) as StoredUsage)
            .filter(
              (row) => localDay(new Date(row.createdAt), context.getSettings().timeZone) === day,
            );
          const tokens =
            prior.reduce((sum, row) => sum + (row.inputTokens ?? 0) + (row.outputTokens ?? 0), 0) +
            (r.inputTokens ?? 0) +
            (r.outputTokens ?? 0);
          if (client.dailyTokenAlert !== null && tokens >= client.dailyTokenAlert)
            r.softAlerts.push('일일 토큰 알림 한도에 도달했습니다.');
          if (client.dailyCostAlertMicros !== null && r.currency) {
            const knownCosts = [...prior.filter((row) => row.currency === r.currency), r]
              .map(storedCostUnits)
              .filter((cost): cost is bigint => cost !== null);
            const cost = knownCosts.reduce((sum, amount) => sum + amount, 0n);
            if (knownCosts.length > 0 && cost >= BigInt(client.dailyCostAlertMicros) * SCALE)
              r.softAlerts.push(`${r.currency} 일일 예상 비용 알림 한도에 도달했습니다.`);
          }
        }
        context.db
          .prepare('INSERT INTO gateway_usage VALUES(?,?,?,?,?)')
          .run(r.id, r.projectId, r.clientId, r.createdAt, JSON.stringify(r));
        prune();
      }
      try {
        upstream = providerRequest(url, pin!, req.method, headers);
      } catch {
        bad('제공사 연결을 시작하지 못했습니다.', 502);
      }
      // Request errors can arrive after the response promise resolved; the response iterator records them.
      upstream.on('error', () => {});
      const hardTimeout = setTimeout(
        () => upstream?.destroy(new Error('제공사 요청 시간이 초과되었습니다.')),
        120000,
      );
      const connectTimeout = setTimeout(
        () => upstream?.destroy(new Error('제공사 연결 시간이 초과되었습니다.')),
        10000,
      );
      upstream.once('socket', (socket) =>
        socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () =>
          clearTimeout(connectTimeout),
        ),
      );
      try {
        if (cancelled || req.raw.aborted || reply.raw.destroyed) {
          reply.hijack();
          return;
        }
        const responsePromise = once(upstream, 'response');
        dispatched = true;
        upstream.end(body);
        const [response] = (await responsePromise) as [import('node:http').IncomingMessage];
        statusCode = response.statusCode ?? 502;
        if (statusCode >= 300 && statusCode < 400) {
          response.destroy();
          throw new Error('리다이렉트는 허용되지 않습니다.');
        }
        const contentType = String(response.headers['content-type'] ?? 'application/octet-stream');
        if (
          response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity'
        ) {
          response.destroy();
          throw new Error('압축 응답은 지원하지 않습니다.');
        }
        parser = new UsageParser(
          route.adapter,
          contentType.toLowerCase().includes('text/event-stream'),
        );
        reply.hijack();
        responseStarted = true;
        reply.raw.writeHead(statusCode, {
          'content-type': contentType,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        let bytes = 0;
        for await (const chunk of response) {
          const buffer = Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > MAX_RESPONSE) {
            response.destroy();
            throw new Error('응답 크기 제한을 초과했습니다.');
          }
          parser.push(buffer);
          if (!reply.raw.write(buffer))
            await once(reply.raw, 'drain', {
              signal: AbortSignal.any([drainAbort.signal, AbortSignal.timeout(15000)]),
            });
        }
        parser.finish();
        outcome =
          statusCode < 400 &&
          (!parser.sse || parser.complete) &&
          !parser.malformed &&
          !parser.providerIncomplete
            ? 'success'
            : 'error';
        record();
        reply.raw.end();
      } catch {
        outcome = cancelled ? 'cancelled' : 'error';
        record();
        if (responseStarted) reply.raw.destroy();
        else if (!cancelled)
          reply.code(502).send({
            message: '제공사 요청을 완료하지 못했습니다.',
          });
      } finally {
        clearTimeout(hardTimeout);
        clearTimeout(connectTimeout);
        upstream.destroy();
      }
    } finally {
      reply.raw.off('close', onClose);
      req.raw.off('aborted', onClose);
      if (reserved && !dispatched)
        context.db
          .prepare('UPDATE gateway_daily SET requests=requests-1 WHERE client_id=? AND day=?')
          .run(reserved.clientId, reserved.day);
      lease?.release();
    }
  }
  // Encapsulated raw body parsing preserves arbitrary REST payloads without parsing or reserializing secrets.
  await app.register(async (gateway) => {
    gateway.addHook('onRequest', async (req, reply) => {
      let releaseIp: (() => void) | undefined;
      let releaseClient: (() => void) | undefined;
      const lease = {
        ownedByRelay: false,
        release: () => {
          releaseClient?.();
          releaseIp?.();
        },
      };
      try {
        releaseIp = admission.acquireIp(req.ip);
        leases.set(req, lease);
        const releaseEarly = () => {
          if (!lease.ownedByRelay) lease.release();
        };
        reply.raw.once('close', releaseEarly);
        reply.raw.once('finish', releaseEarly);
        const { client } = authorize(req);
        releaseClient = admission.acquireClient(client.id);
      } catch (error) {
        lease.release();
        if (
          (
            error as {
              statusCode?: number;
            }
          ).statusCode === 429
        )
          reply.header('retry-after', '60');
        throw error;
      }
    });
    gateway.removeAllContentTypeParsers();
    gateway.addContentTypeParser(
      '*',
      {
        parseAs: 'buffer',
        bodyLimit: MAX_REQUEST,
      },
      (_req, body, done) => done(null, body),
    );
    gateway.route({
      method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      url: '/gw/:slug/*',
      bodyLimit: MAX_REQUEST,
      handler: relay,
    });
  });
}
