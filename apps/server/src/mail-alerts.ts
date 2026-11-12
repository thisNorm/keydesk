import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  Entry,
  GatewayClient,
  GatewayRoute,
  MailOverview,
  UsageRecord,
} from '@keydesk/contracts';
import type { CoreContext } from './context.ts';
import type { Storage } from './db.ts';
import { matchesBudget, removeBudget, trackBudget } from './gateway/mail-budget.ts';
import {
  cleanMailName,
  flushMailOutbox,
  initializeMailOutbox,
  insertMail,
  mailDeliveries,
  mailEnabled,
  warningStage,
} from './mail-outbox.ts';
import { getSettings, sendMail } from './settings.ts';
import { openRouterMail, type MailLookupOptions } from './mail-provider.ts';

export function createMailAlerts(
  storage: Storage,
  context: CoreContext,
  lookup?: MailLookupOptions,
) {
  const { db } = storage;
  initializeMailOutbox(db);
  const provider = openRouterMail(context, lookup);
  const settings = () => getSettings(storage);
  const project = (id: string) =>
    cleanMailName(
      String(db.prepare('SELECT name FROM projects WHERE id=?').get(id)?.name ?? '이전 프로젝트'),
    );
  const projects = (ids: string[]) => ids.map(project).join(', ') || '없음';
  const linked = (before: string[], after: string[]) => ({
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  });
  const time = (at: Date, zone: string) =>
    new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: zone,
    }).format(at) +
    ' (' +
    zone +
    ')';
  function entrySnapshot(id: string) {
    if (!mailEnabled(settings(), 'registration')) return undefined;
    const json = db.prepare('SELECT json FROM entries WHERE id=?').get(id)?.json;
    if (typeof json !== 'string') return undefined;
    const { projectIds } = JSON.parse(json) as Entry;
    const credentialIds = db
      .prepare('SELECT id FROM credentials WHERE entry_id=?')
      .all(id)
      .map((row) => String(row.id));
    return { projectIds, credentialIds };
  }
  function entriesSaved(
    changes: { before?: ReturnType<typeof entrySnapshot>; entry: Entry }[],
    batch = false,
  ): void {
    const configured = settings();
    if (!mailEnabled(configured, 'registration')) return;
    const at = context.now();
    const descriptions = changes.flatMap(({ before, entry }) => {
      const { added, removed } = linked(before?.projectIds ?? [], entry.projectIds);
      const keys = entry.credentials.filter(
        (credential) => !before?.credentialIds.includes(credential.id),
      );
      if (before && !added.length && !removed.length && !keys.length) return [];
      const name = cleanMailName(entry.name);
      const action = !before
        ? '등록 완료'
        : added.length || removed.length
          ? '프로젝트 연결 변경'
          : '인증값 등록 완료';
      return [
        {
          title: name + ' ' + action,
          body: [
            `항목: ${name}`,
            `제공사: ${cleanMailName(entry.provider) || '미등록'}`,
            `연결된 프로젝트: ${projects(entry.projectIds)}`,
            ...(before && added.length ? [`추가: ${projects(added)}`] : []),
            ...(removed.length ? [`해제: ${projects(removed)}`] : []),
            ...(keys.length
              ? [`등록한 키: ${keys.map((key) => cleanMailName(key.label)).join(', ')}`]
              : []),
          ].join('\n'),
        },
      ];
    });
    if (!descriptions.length) return;
    insertMail(db, {
      id: randomUUID(),
      kind: 'registration',
      createdAt: at.toISOString(),
      subject: batch
        ? `가져오기 · ${descriptions.length}개 항목 등록 또는 연결 변경`
        : descriptions[0]!.title,
      body: [
        ...descriptions.slice(0, 10).map(({ body }) => body),
        ...(descriptions.length > 10 ? [`외 ${descriptions.length - 10}개 항목`] : []),
        `저장 시각: ${time(at, configured.timeZone)}`,
      ].join('\n\n'),
    });
  }
  function routeSaved(route: GatewayRoute, before?: GatewayRoute): void {
    const configured = settings();
    const at = context.now();
    if (route.mailBudget || before?.mailBudget) trackBudget(db, route, configured, at);
    if (!mailEnabled(configured, 'registration') || before?.projectId === route.projectId) return;
    const json = db
      .prepare('SELECT e.json FROM credentials c JOIN entries e ON e.id=c.entry_id WHERE c.id=?')
      .get(route.credentialId)?.json;
    const name = cleanMailName(route.name);
    const providerName =
      typeof json === 'string' ? cleanMailName((JSON.parse(json) as Entry).provider) : '';
    insertMail(db, {
      id: randomUUID(),
      kind: 'registration',
      createdAt: at.toISOString(),
      subject: name + (before ? ' 프로젝트 연결 변경' : ' 등록 완료'),
      body: [
        `중계 경로: ${name}`,
        `제공사: ${providerName || '미등록'}`,
        `연결된 프로젝트: ${project(route.projectId)}`,
        ...(before
          ? [`해제: ${project(before.projectId)}`, `추가: ${project(route.projectId)}`]
          : []),
        `저장 시각: ${time(at, configured.timeZone)}`,
      ].join('\n'),
    });
  }
  function recordDispatched(
    client: GatewayClient,
    used: number,
    day: string,
    dispatchZone: string,
  ): void {
    const configured = settings();
    if (configured.timeZone !== dispatchZone) return;
    if (mailEnabled(configured, 'requestLimit') && client.dailyRequestLimit !== null) {
      const max = client.dailyRequestLimit;
      const stage = warningStage(BigInt(used), BigInt(max));
      const previous = warningStage(BigInt(used - 1), BigInt(max));
      const prefix = `calls:${client.id}:${day}:`;
      if (stage > previous) {
        const name = cleanMailName(client.name);
        insertMail(db, {
          id: prefix + stage,
          kind: 'requestLimit',
          createdAt: context.now().toISOString(),
          subject: `${project(client.projectId)} 일일 호출 한도 ${stage === 100 ? '도달' : '임박'}`,
          body: [
            `클라이언트 키: ${name}`,
            `프로젝트: ${project(client.projectId)}`,
            `Keydesk 호출: ${used}회 / ${max}회 (남은 ${Math.max(0, max - used)}회)`,
            `알림 기준: ${stage}%`,
            `적용일: ${day} (${dispatchZone})`,
          ].join('\n'),
        });
      }
    }
  }
  function recordUsage(
    usage: UsageRecord,
    dispatchRoute: GatewayRoute,
    dispatchZone: string,
  ): void {
    if (dispatchRoute.mailBudget) {
      const configured = settings();
      if (configured.timeZone !== dispatchZone) return;
      const json = db
        .prepare('SELECT json FROM gateway_routes WHERE id=?')
        .get(dispatchRoute.id)?.json;
      const route = typeof json === 'string' ? (JSON.parse(json) as GatewayRoute) : undefined;
      if (route && matchesBudget(dispatchRoute, route, dispatchZone))
        trackBudget(db, route, configured, context.now(), usage);
    }
  }
  return {
    entrySnapshot,
    entriesSaved,
    routeSaved,
    recordDispatched,
    recordUsage,
    routeDeleted: (id: string) => removeBudget(db, id),
    async refresh() {
      await provider.refresh();
      await flushMailOutbox(
        db,
        settings,
        (subject, body) => sendMail(storage, subject, body),
        context.now(),
      );
    },
    register(app: FastifyInstance) {
      app.get(
        '/api/settings/mail/overview',
        async (): Promise<MailOverview> => ({
          deliveries: mailDeliveries(db),
          openRouterKeys: provider.available(),
        }),
      );
    },
  };
}
export type MailAlerts = ReturnType<typeof createMailAlerts>;
