import { randomUUID } from 'node:crypto';
import type { Credential, Entry, GatewayRoute, MailOverview } from '@keydesk/contracts';
import type { CoreContext } from './context.ts';
import { transaction } from './db.ts';
import { openRouterKeyUrl, openRouterSource, readOpenRouterUsage } from './gateway/openrouter.ts';
import { pinDestination, providerRequest } from './gateway/transport.ts';
import { expired } from './gateway/validation.ts';
import { cleanMailName, insertMail, mailEnabled, mailEpoch, warningStage } from './mail-outbox.ts';

export interface MailLookupOptions {
  resolveDestination?: typeof pinDestination;
  requestProvider?: typeof providerRequest;
}
type Poll = { version: number; nextAt: number; stage: 0 | 80 | 100 };
const HOUR = 3600000;

export function openRouterMail(context: CoreContext, options: MailLookupOptions = {}) {
  const { db } = context;
  function sources() {
    const settings = context.getSettings();
    const now = context.now();
    const eligible = new Map<
      string,
      { route: GatewayRoute; credential: Credential; name: string; project: string }
    >();
    for (const row of db
      .prepare(
        `SELECT r.json AS route_json,c.json AS credential_json,e.json AS entry_json,p.name AS project
      FROM gateway_routes r JOIN credentials c ON c.id=r.credential_id
      JOIN entries e ON e.id=c.entry_id
      JOIN entry_projects ep ON ep.entry_id=e.id AND ep.project_id=r.project_id
      JOIN projects p ON p.id=r.project_id ORDER BY r.id`,
      )
      .all()) {
      const route = JSON.parse(String(row.route_json)) as GatewayRoute;
      if (!openRouterSource(route)) continue;
      const credential = JSON.parse(String(row.credential_json)) as Credential;
      if (
        eligible.has(credential.id) ||
        credential.status !== 'active' ||
        expired(credential.expiresAt, now, settings.timeZone)
      )
        continue;
      const entry = JSON.parse(String(row.entry_json)) as Entry;
      eligible.set(credential.id, {
        route,
        credential,
        name: cleanMailName(entry.name + ' · ' + credential.label),
        project: cleanMailName(String(row.project)),
      });
    }
    return eligible;
  }
  function available(): MailOverview['openRouterKeys'] {
    return [...sources()].map(([credentialId, { name, project }]) => ({
      credentialId,
      name,
      project,
    }));
  }
  const pollKey = (id: string) => 'mail-openrouter:' + id;
  function state(id: string, version: number): Poll {
    const json = db.prepare('SELECT value FROM meta WHERE key=?').get(pollKey(id))?.value;
    const current = typeof json === 'string' ? (JSON.parse(json) as Poll) : undefined;
    return current?.version === version ? current : { version, nextAt: 0, stage: 0 };
  }
  function save(id: string, value: Poll) {
    db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(pollKey(id), JSON.stringify(value));
  }
  async function refresh() {
    const settings = context.getSettings();
    if (!mailEnabled(settings, 'providerLimit')) return;
    const at = context.now();
    const generation = mailEpoch(db);
    const eligible = sources();
    const due = (settings.mailAlerts?.openRouterKeys ?? [])
      .flatMap((id) => {
        const source = eligible.get(id);
        if (!source) return [];
        const poll = state(id, source.credential.version);
        return poll.nextAt <= at.getTime() ? [{ id, source, poll }] : [];
      })
      .sort((a, b) => a.poll.nextAt - b.poll.nextAt);
    for (const { id, source, poll } of due.slice(0, 2)) {
      const before = JSON.stringify(source);
      function stillApproved() {
        const latest = context.getSettings();
        return (
          mailEpoch(db) === generation &&
          mailEnabled(latest, 'providerLimit') &&
          latest.mailAlerts?.openRouterKeys.includes(id) &&
          JSON.stringify(sources().get(id)) === before
        );
      }
      if (!stillApproved()) continue;
      poll.nextAt = at.getTime() + HOUR;
      save(id, poll);
      try {
        const pin = await (options.resolveDestination ?? pinDestination)(openRouterKeyUrl(), false);
        if (!stillApproved()) continue;
        const credential = context.getCredential(id);
        if (credential.version !== source.credential.version || credential.status !== 'active')
          continue;
        const usage = await readOpenRouterUsage(
          options.requestProvider ?? providerRequest,
          pin,
          credential.value,
        );
        if (!stillApproved()) continue;
        const free = usage.freeRequests;
        if (!free || free.used === null || free.max === null || free.max <= 0) continue;
        const next = warningStage(BigInt(free.used), BigInt(free.max));
        transaction(db, () => {
          if (next > poll.stage) {
            const checkedAt = context.now();
            insertMail(db, {
              id: 'provider:' + id + ':' + randomUUID(),
              kind: 'providerLimit',
              createdAt: checkedAt.toISOString(),
              subject: `OpenRouter 무료 요청 한도 ${next === 100 ? '도달' : '임박'}`,
              body: [
                `연결 키: ${source.name}`,
                `연결 프로젝트 예: ${source.project}`,
                `제공사 집계: 일일 무료 요청 ${free.used}회 / ${free.max}회`,
                `알림 기준: ${next}%`,
                ...(free.remaining === null ? [] : [`제공사 보고 잔여: ${free.remaining}회`]),
                `조회: ${checkedAt.toLocaleString('ko-KR', { timeZone: settings.timeZone })} (${settings.timeZone}) · 약 1시간 간격`,
              ].join('\n'),
            });
          }
          if (next === 0 || next > poll.stage) {
            poll.stage = next;
            save(id, poll);
          }
        });
      } catch {
        // Keep the next check time; an unavailable number is not zero or a reset.
      }
    }
  }
  return { available, refresh };
}
