import type {
  GatewayClient,
  GatewayRoute,
  UsageModelSummary,
  UsageOperationSummary,
  UsageRecord,
  UsageReport,
  UsageSummary,
} from '@keydesk/contracts';
import type { CoreContext } from '../context.ts';
import { usageProvider } from './operations.ts';
import { openRouterSource } from './openrouter.ts';
import { expired, localDay } from './validation.ts';
import {
  exactMicros,
  formatUsd,
  roundedMicros,
  storedCostUnits,
  usdPattern,
  usdUnits,
} from './usage.ts';

const tokenFields = [
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'cachedInputTokens',
  'reasoningTokens',
] as const;

export function groupUsage(
  records: UsageRecord[],
  currentRoutes: GatewayRoute[],
): Pick<UsageReport, 'routeTotals' | 'operations' | 'models'> {
  const routes = new Map(currentRoutes.map((route) => [route.id, route]));
  const routeTotals = new Map<string, UsageReport['routeTotals'][number]>();
  const operations = new Map<string, UsageOperationSummary>();
  const models = new Map<string, UsageModelSummary>();
  for (const row of records) {
    const { projectId, routeId } = row;
    const scope = { projectId, routeId, requests: 0 };
    const routeKey = JSON.stringify([projectId, routeId]);
    let total = routeTotals.get(routeKey);
    if (!total) {
      const current = routes.get(routeId);
      const route = current?.projectId === projectId ? current : undefined;
      total = {
        ...scope,
        name: route?.name ?? null,
        currentProvider: route ? (usageProvider(new URL(route.baseUrl)) ?? null) : null,
      };
      routeTotals.set(routeKey, total);
    }
    total.requests++;
    const provider = row.provider ?? null;
    const ai =
      row.adapter !== undefined
        ? row.adapter !== 'generic'
        : row.model !== null || /^(openai|anthropic) /.test(row.usageSource);
    if (!ai) {
      const operationId = row.operation?.id ?? null;
      const key = JSON.stringify([projectId, routeId, provider, operationId]);
      let item = operations.get(key);
      if (!item) {
        item = { ...scope, provider, operationId, name: row.operation?.name ?? null };
        operations.set(key, item);
      }
      item.requests++;
      continue;
    }
    const adapter = row.adapter ?? null;
    const originId = row.originId ?? null;
    const key = JSON.stringify([projectId, routeId, adapter, provider, originId, row.model]);
    let item = models.get(key);
    if (!item) {
      item = {
        ...scope,
        adapter,
        provider,
        originId,
        model: row.model,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        cachedInputTokens: null,
        reasoningTokens: null,
        tokenReports: 0,
        reportedCostUsd: null,
        costReports: 0,
      };
      models.set(key, item);
    }
    item.requests++;
    if (row.inputTokens !== null || row.outputTokens !== null || row.totalTokens != null)
      item.tokenReports++;
    for (const field of tokenFields) {
      const amount = row[field];
      if (amount != null) item[field] = (item[field] ?? 0) + amount;
    }
    if (provider === 'openrouter' && row.reportedCostUsd && usdPattern.test(row.reportedCostUsd)) {
      item.costReports++;
      item.reportedCostUsd = formatUsd(
        usdUnits(item.reportedCostUsd ?? '0') + usdUnits(row.reportedCostUsd),
      );
    }
  }
  const byRequests = (a: { requests: number }, b: { requests: number }) => b.requests - a.requests;
  return {
    routeTotals: [...routeTotals.values()].sort(byRequests),
    operations: [...operations.values()].sort(byRequests),
    models: [...models.values()].sort(byRequests),
  };
}

export function readUsageReport(
  context: CoreContext,
  days: number,
  projectId: string | undefined,
  routes: GatewayRoute[],
  clients: GatewayClient[],
): UsageReport {
  const now = context.now();
  const settings = context.getSettings();
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  const rows = projectId
    ? context.db
        .prepare(
          'SELECT json FROM gateway_usage WHERE created_at>=? AND project_id=? ORDER BY created_at DESC',
        )
        .all(cutoff, projectId)
    : context.db
        .prepare('SELECT json FROM gateway_usage WHERE created_at>=? ORDER BY created_at DESC')
        .all(cutoff);
  const records = rows.map((r) => JSON.parse(String(r.json)) as UsageRecord);
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
    if (r.currency && exact !== null) costs.set(r.currency, (costs.get(r.currency) ?? 0n) + exact);
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
      item.krwEstimate = (amountMicros / 1e6) * Number(settings.krwExchangeRate);
    if (amountMicros !== null && currency === 'KRW') item.krwEstimate = amountMicros / 1e6;
    summary.costs.push(item);
  }
  const day = localDay(now, settings.timeZone);
  const daily = new Map(
    context.db
      .prepare('SELECT client_id,requests FROM gateway_daily WHERE day=?')
      .all(day)
      .map((row) => [String(row.client_id), Number(row.requests)]),
  );
  const dailyLimits = clients
    .filter(
      (c) =>
        !c.revoked &&
        (!projectId || c.projectId === projectId) &&
        !expired(c.expiresAt, now, settings.timeZone),
    )
    .map((c) => ({
      clientId: c.id,
      name: c.name,
      projectId: c.projectId,
      used: daily.get(c.id) ?? 0,
      max: c.dailyRequestLimit,
    }));
  const sourceKeys = new Set<string>();
  const openRouterSources: UsageReport['openRouterSources'] = [];
  for (const route of routes) {
    if (
      (projectId && route.projectId !== projectId) ||
      !openRouterSource(route) ||
      sourceKeys.has(route.credentialId)
    )
      continue;
    sourceKeys.add(route.credentialId);
    openRouterSources.push({ routeId: route.id, name: route.name, projectId: route.projectId });
  }
  return {
    records: records.slice(0, 1000),
    summary,
    ...groupUsage(records, routes),
    dailyLimits,
    day,
    timeZone: settings.timeZone,
    retentionDays: settings.retentionDays,
    openRouterSources,
  };
}
