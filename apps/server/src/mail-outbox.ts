import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { MailAlertSettings, MailDelivery, Settings } from '@keydesk/contracts';

export const MAIL_ALERTS_OFF: MailAlertSettings = {
  registration: false,
  requestLimit: false,
  budget: false,
  openRouterKeys: [],
};

type Kind = MailDelivery['kind'];
type NewKind = Exclude<Kind, 'expiry'>;
type Status = MailDelivery['status'];
type Event = { id: string; kind: Kind; subject: string; body: string; createdAt: string };
const epochKey = 'mail-alert-epoch';
const epoch = (db: DatabaseSync) =>
  String(db.prepare('SELECT value FROM meta WHERE key=?').get(epochKey)?.value ?? '');

export function smtpReady(settings: Settings): boolean {
  const { host, from, to } = settings.smtp;
  return Boolean(host && from && to);
}

export function mailEnabled(settings: Settings, kind: NewKind): boolean {
  const alerts = settings.mailAlerts ?? MAIL_ALERTS_OFF;
  return (
    smtpReady(settings) &&
    (kind === 'providerLimit' ? alerts.openRouterKeys.length > 0 : alerts[kind])
  );
}

export function invalidatePendingMail(db: DatabaseSync): void {
  db.prepare("UPDATE mail_outbox SET status='cancelled',body='' WHERE status='pending'").run();
  advanceMailEpoch(db);
}

export function advanceMailEpoch(db: DatabaseSync): void {
  const next = randomUUID();
  db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(epochKey, next);
  db.prepare("UPDATE mail_outbox SET epoch=? WHERE status='pending'").run(next);
}

export function cancelPendingMail(db: DatabaseSync, kind: NewKind, providerKey?: string): void {
  db.prepare(
    "UPDATE mail_outbox SET status='cancelled',body='' WHERE status='pending' AND kind=? AND (? IS NULL OR id GLOB ?)",
  ).run(kind, providerKey ?? null, providerKey ? 'provider:' + providerKey + ':*' : null);
}

export function mailEpoch(db: DatabaseSync): string {
  return epoch(db);
}

export function cleanMailName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 160);
}

export function warningStage(used: bigint, max: bigint): 0 | 80 | 100 {
  return max <= 0n ? 0 : used >= max ? 100 : used * 5n >= max * 4n ? 80 : 0;
}

export function insertMail(db: DatabaseSync, event: Event, status: Status = 'pending'): boolean {
  return (
    db
      .prepare('INSERT OR IGNORE INTO mail_outbox VALUES (?,?,?,?,?,?,?)')
      .run(
        event.id,
        event.kind,
        epoch(db),
        event.createdAt,
        status,
        '[Keydesk] ' + cleanMailName(event.subject),
        event.body.slice(0, 12000),
      ).changes === 1
  );
}

export function mailStatus(db: DatabaseSync, id: string): Status | undefined {
  return db.prepare('SELECT status FROM mail_outbox WHERE id=?').get(id)?.status as
    | Status
    | undefined;
}

export function finishMail(db: DatabaseSync, id: string, status: 'sent' | 'failed'): void {
  db.prepare("UPDATE mail_outbox SET status=?,body='' WHERE id=? AND status='sending'").run(
    status,
    id,
  );
}

export function expiryMailId(credentialId: string, version: number, stage: number): string {
  return `expiry:${credentialId}:${version}:${stage}`;
}

export function initializeMailOutbox(db: DatabaseSync): void {
  db.prepare("UPDATE mail_outbox SET status='uncertain',body='' WHERE status='sending'").run();
  preserveExpiryHistory(db);
}

export function preserveExpiryHistory(db: DatabaseSync): void {
  db.exec(`INSERT INTO mail_outbox
    SELECT 'expiry:' || credential_id || ':' || version || ':' || stage,
      'expiry', '', json_extract(json, '$.createdAt'), 'sent', '[Keydesk] 인증값 만료 알림', ''
    FROM notifications WHERE json_extract(json, '$.mailStatus') = 'sent'
    ON CONFLICT(id) DO UPDATE SET status='sent',body=''`);
}

export function mailDeliveries(db: DatabaseSync): MailDelivery[] {
  return db
    .prepare(
      'SELECT id,kind,created_at AS createdAt,status,subject FROM mail_outbox ORDER BY created_at DESC,rowid DESC LIMIT 20',
    )
    .all() as unknown as MailDelivery[];
}

export async function flushMailOutbox(
  db: DatabaseSync,
  getSettings: () => Settings,
  send: (subject: string, body: string) => Promise<void>,
  now: Date,
): Promise<void> {
  const ids = db
    .prepare("SELECT id FROM mail_outbox WHERE status='pending' ORDER BY created_at,rowid LIMIT 8")
    .all();
  const pending = db.prepare(
    "SELECT id,kind,epoch,subject,body FROM mail_outbox WHERE id=? AND status='pending'",
  );
  for (const { id } of ids) {
    const row = pending.get(id!) as (Event & { epoch: string; kind: NewKind }) | undefined;
    if (!row) continue;
    if (row.epoch !== epoch(db) || !mailEnabled(getSettings(), row.kind)) {
      db.prepare(
        "UPDATE mail_outbox SET status='cancelled',body='' WHERE id=? AND status='pending'",
      ).run(row.id);
      continue;
    }
    if (
      db
        .prepare("UPDATE mail_outbox SET status='sending' WHERE id=? AND status='pending'")
        .run(row.id).changes !== 1
    )
      continue;
    try {
      await send(row.subject, row.body);
      finishMail(db, row.id, 'sent');
    } catch {
      finishMail(db, row.id, 'failed');
    }
  }
  const cutoff = new Date(
    now.getTime() - Math.max(2, getSettings().retentionDays) * 86400000,
  ).toISOString();
  db.prepare(
    "DELETE FROM mail_outbox WHERE kind!='expiry' AND created_at<? AND status NOT IN ('pending','sending')",
  ).run(cutoff);
}
