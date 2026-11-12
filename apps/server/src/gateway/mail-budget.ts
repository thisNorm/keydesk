import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { GatewayRoute, Settings, UsageRecord } from '@keydesk/contracts';
import { tableExists } from '../db.ts';
import {
  cancelPendingMail,
  cleanMailName,
  insertMail,
  mailEnabled,
  warningStage,
} from '../mail-outbox.ts';
import { localDay } from './validation.ts';
import { formatUsd, storedCostUnits, usdPattern, usdUnits } from './usage.ts';

const dateTime = z.string().datetime({ offset: true });
export const budgetRollupSchema = z
  .object({
    id: z.string().uuid(),
    scope: z.string().regex(/^[0-9a-f]{64}$/),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    configuredAt: dateTime,
    startedAt: dateTime,
    units: z.string().regex(/^\d{1,80}$/),
    unknown: z.number().int().nonnegative(),
    otherCurrency: z.number().int().nonnegative(),
    stage: z.union([z.literal(0), z.literal(80), z.literal(100)]),
  })
  .strict();
type BudgetRollup = z.infer<typeof budgetRollupSchema>;
function scopeOf(route: GatewayRoute, timeZone: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        route.projectId,
        route.adapter,
        new URL(route.baseUrl).href,
        route.mailBudget?.basis,
        route.mailBudget?.currency,
        timeZone,
      ]),
    )
    .digest('hex');
}
function readBudget(db: DatabaseSync, routeId: string): BudgetRollup | undefined {
  const json = db
    .prepare('SELECT json FROM gateway_budget_rollups WHERE route_id=?')
    .get(routeId)?.json;
  return typeof json === 'string' ? budgetRollupSchema.parse(JSON.parse(json)) : undefined;
}
export function removeBudget(db: DatabaseSync, routeId: string): void {
  const old = readBudget(db, routeId);
  if (!old) return;
  db.prepare(
    "UPDATE mail_outbox SET status='cancelled',body='' WHERE status='pending' AND id IN (?,?)",
  ).run('budget:' + old.id + ':80', 'budget:' + old.id + ':100');
  db.prepare('DELETE FROM gateway_budget_rollups WHERE route_id=?').run(routeId);
}

export function trackBudget(
  db: DatabaseSync,
  route: GatewayRoute,
  settings: Settings,
  now: Date,
  usage?: UsageRecord,
): void {
  const budget = route.mailBudget;
  if (!budget) {
    if (!usage) removeBudget(db, route.id);
    return;
  }
  const scope = scopeOf(route, settings.timeZone);
  const at = now.toISOString();
  const month = localDay(now, settings.timeZone).slice(0, 7);
  const old = readBudget(db, route.id);
  if (old && old.scope !== scope) removeBudget(db, route.id);
  const sameScope = old?.scope === scope;
  const row: BudgetRollup =
    sameScope && old.month === month
      ? old
      : {
          id: randomUUID(),
          scope,
          month,
          configuredAt: sameScope ? old.configuredAt : (usage?.createdAt ?? at),
          startedAt: at,
          units: '0',
          unknown: 0,
          otherCurrency: 0,
          stage: 0,
        };
  if (usage && Date.parse(usage.createdAt) < Date.parse(row.configuredAt)) return;
  if (usage) {
    const exact =
      budget.basis === 'reported'
        ? usage.reportedCostUsd && usdPattern.test(usage.reportedCostUsd)
          ? usdUnits(usage.reportedCostUsd)
          : null
        : // Estimates are in micros of their own currency, with 9 further decimal places.
          (() => {
            const micros = storedCostUnits(usage);
            return micros === null ? null : micros * 1000000000n;
          })();
    const currency = budget.basis === 'reported' ? 'USD' : usage.currency;
    if (exact === null || !currency) row.unknown++;
    else if (currency !== budget.currency) row.otherCurrency++;
    else row.units = (BigInt(row.units) + exact).toString();
  }
  const stage = warningStage(BigInt(row.units), usdUnits(budget.amount));
  if (stage > row.stage) {
    row.stage = stage;
    if (mailEnabled(settings, 'budget')) {
      const project = cleanMailName(
        String(
          db.prepare('SELECT name FROM projects WHERE id=?').get(route.projectId)?.name ??
            '이전 프로젝트',
        ),
      );
      const amount = (value: string) => budget.currency + ' ' + value;
      insertMail(db, {
        id: `budget:${row.id}:${stage}`,
        kind: 'budget',
        createdAt: at,
        subject: `${route.name} 월 예산 ${stage === 100 ? '도달' : '임박'}`,
        body: [
          `중계 경로: ${cleanMailName(route.name)}`,
          `프로젝트: ${project}`,
          `사용: ${amount(formatUsd(BigInt(row.units)))} / ${amount(budget.amount)}`,
          `알림 기준: ${stage}%`,
          `근거: ${budget.basis === 'reported' ? 'OpenRouter 보고 비용' : 'Keydesk 단가 기반 추정 비용'}`,
          `집계: ${month} (${settings.timeZone}), 시작 ${localDay(new Date(row.startedAt), settings.timeZone)}`,
          `미보고 호출: ${row.unknown}건 · 다른 통화: ${row.otherCurrency}건 (합계에서 제외)`,
          '이 알림 이후에도 API 호출은 계속됩니다.',
        ].join('\n'),
      });
    }
  }
  db.prepare('INSERT OR REPLACE INTO gateway_budget_rollups VALUES (?,?)').run(
    route.id,
    JSON.stringify(row),
  );
}

export function resetBudgetsForTimeZone(db: DatabaseSync, settings: Settings, now: Date): void {
  if (!tableExists(db, 'gateway_budget_rollups')) return;
  cancelPendingMail(db, 'budget');
  for (const row of db.prepare('SELECT json FROM gateway_routes').all()) {
    const route = JSON.parse(String(row.json)) as GatewayRoute;
    if (route.mailBudget) trackBudget(db, route, settings, now);
  }
}

export function matchesBudget(
  dispatch: GatewayRoute,
  current: GatewayRoute,
  timeZone: string,
): boolean {
  return Boolean(
    dispatch.mailBudget &&
      current.mailBudget &&
      scopeOf(dispatch, timeZone) === scopeOf(current, timeZone),
  );
}
