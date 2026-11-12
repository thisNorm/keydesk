import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Credential, Entry, VaultNotification } from '@keydesk/contracts';
import type { Storage } from './db.ts';
import { tableExists } from './db.ts';
import { getSettings, sendMail } from './settings.ts';
import { expiryDays } from './dates.ts';
import { missing } from './errors.ts';
import type { MailAlerts } from './mail-alerts.ts';
import {
  cleanMailName,
  expiryMailId,
  finishMail,
  insertMail,
  mailStatus,
  smtpReady,
} from './mail-outbox.ts';
export async function refreshNotifications(storage: Storage, now: () => Date) {
  const { db } = storage;
  const settings = getSettings(storage);
  const at = now();
  for (const row of db
    .prepare('SELECT c.*,e.json AS entry_json FROM credentials c JOIN entries e ON e.id=c.entry_id')
    .all() as any[]) {
    const credential: Credential = JSON.parse(row.json),
      entry = JSON.parse(row.entry_json) as Entry;
    if (credential.status !== 'active') {
      db.prepare('DELETE FROM notifications WHERE credential_id=?').run(credential.id);
      continue;
    }
    const days = expiryDays(credential.expiresAt, at, settings.timeZone);
    if (days === null) continue;
    const stage = days <= 0 ? 0 : days === 7 ? 7 : days === 30 ? 30 : null;
    if (stage === null) continue;
    if (
      db
        .prepare('SELECT 1 FROM notifications WHERE credential_id=? AND version=? AND stage=?')
        .get(credential.id, credential.version, stage)
    )
      continue;
    const configured = smtpReady(settings);
    const id = expiryMailId(credential.id, credential.version, stage);
    const priorMail = mailStatus(db, id);
    const notification: VaultNotification = {
      id: randomUUID(),
      entryId: entry.id,
      credentialId: credential.id,
      title: stage === 0 ? '인증값 만료일 확인' : '인증값 만료 예정',
      message: `${entry.name} · ${credential.label} · ${credential.expiresAt}`,
      createdAt: at.toISOString(),
      read: false,
      mailStatus:
        priorMail === 'sent'
          ? 'sent'
          : priorMail
            ? 'failed'
            : configured
              ? 'pending'
              : 'unconfigured',
    };
    db.prepare('INSERT INTO notifications VALUES (?,?,?,?,?)').run(
      notification.id,
      credential.id,
      credential.version,
      stage,
      JSON.stringify(notification),
    );
    if (configured && !priorMail) {
      const subject = `${cleanMailName(entry.name)} 인증값 ${stage === 0 ? '만료일 확인' : '만료 ' + stage + '일 전'}`;
      const projects = db
        .prepare(
          'SELECT p.name FROM entry_projects ep JOIN projects p ON p.id=ep.project_id WHERE ep.entry_id=?',
        )
        .all(entry.id)
        .map((row) => cleanMailName(String(row.name)))
        .join(', ');
      const body = [
        `항목: ${cleanMailName(entry.name)}`,
        `제공사: ${cleanMailName(entry.provider)}`,
        `키: ${cleanMailName(credential.label)}`,
        `만료일: ${credential.expiresAt}`,
        `연결된 프로젝트: ${projects || '없음'}`,
      ].join('\n');
      if (
        !insertMail(
          db,
          { id, kind: 'expiry', createdAt: notification.createdAt, subject, body: '' },
          'sending',
        )
      )
        continue;
      try {
        await sendMail(storage, '[Keydesk] ' + subject, body);
        notification.mailStatus = 'sent';
      } catch {
        notification.mailStatus = 'failed';
      }
      finishMail(db, id, notification.mailStatus);
      db.prepare('UPDATE notifications SET json=? WHERE id=?').run(
        JSON.stringify(notification),
        notification.id,
      );
    }
  }
  if (tableExists(db, 'gateway_usage'))
    db.prepare('DELETE FROM gateway_usage WHERE created_at<?').run(
      new Date(at.getTime() - settings.retentionDays * 86400000).toISOString(),
    );
  db.prepare('DELETE FROM audit_events WHERE created_at<?').run(
    new Date(at.getTime() - settings.retentionDays * 86400000).toISOString(),
  );
}
export async function registerNotifications(
  app: FastifyInstance,
  storage: Storage,
  now: () => Date,
  mail?: MailAlerts,
) {
  const { db } = storage;
  let running: Promise<void> | undefined;
  const refresh = () => {
    if (!running)
      running = refreshNotifications(storage, now)
        .then(() => mail?.refresh())
        .finally(() => {
          running = undefined;
        });
    return running;
  };
  app.get('/api/notifications', async () => ({
    notifications: db
      .prepare('SELECT json FROM notifications ORDER BY rowid DESC')
      .all()
      .map((row: any) => JSON.parse(row.json)),
  }));
  app.post('/api/notifications/refresh', async (request) => {
    z.object({}).parse(request.body ?? {});
    await refresh();
    return { refreshed: true };
  });
  app.put('/api/notifications/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    z.object({ read: z.literal(true) }).parse(request.body);
    const row = db.prepare('SELECT json FROM notifications WHERE id=?').get(id) as any;
    if (!row) return missing();
    const notification = { ...JSON.parse(row.json), read: true };
    db.prepare('UPDATE notifications SET json=? WHERE id=?').run(JSON.stringify(notification), id);
    return { notification };
  });
  return {
    refresh,
    drain: async () => {
      await running;
    },
  };
}
