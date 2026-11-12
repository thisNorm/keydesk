import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import type { Settings } from '@keydesk/contracts';
import type { Storage } from './db.ts';
import { transaction } from './db.ts';
import { encrypt, decrypt } from './crypto.ts';
import { HttpError } from './errors.ts';
import { validDate } from './dates.ts';
import { resetBudgetsForTimeZone } from './gateway/mail-budget.ts';
import {
  advanceMailEpoch,
  cancelPendingMail,
  invalidatePendingMail,
  MAIL_ALERTS_OFF,
} from './mail-outbox.ts';
const email = z
  .string()
  .max(254)
  .refine((value) => !value || z.string().email().safeParse(value).success);
export const settingsSchema = z.object({
  timeZone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  retentionDays: z.number().int().min(1).max(3650),
  krwExchangeRate: z
    .string()
    .max(30)
    .regex(/^\d{1,9}(\.\d{1,8})?$/)
    .refine((v) => Number(v) > 0),
  exchangeRateDate: z
    .string()
    .max(10)
    .refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && validDate(v))),
  mailAlerts: z
    .object({
      registration: z.boolean(),
      requestLimit: z.boolean(),
      budget: z.boolean(),
      openRouterKeys: z
        .array(z.string().uuid())
        .max(40)
        .transform((ids) => [...new Set(ids)].sort()),
    })
    .strict()
    .optional(),
  smtp: z.object({
    host: z
      .string()
      .max(253)
      .refine((v) => !/[\r\n/]/.test(v)),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    user: z.string().max(320),
    password: z.string().max(4096).optional(),
    passwordConfigured: z.boolean().optional(),
    from: email,
    to: email,
  }),
});
export const DEFAULT_SETTINGS: Settings = {
  timeZone: 'Asia/Seoul',
  retentionDays: 30,
  krwExchangeRate: '1350',
  exchangeRateDate: '',
  smtp: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    from: '',
    to: '',
    passwordConfigured: false,
  },
};
export function getSettings(storage: Storage): Settings {
  const row = storage.db.prepare('SELECT json FROM settings WHERE id=1').get() as any;
  if (!row) return structuredClone(DEFAULT_SETTINGS);
  const parsed = JSON.parse(row.json);
  const { passwordEncrypted, ...smtp } = parsed.smtp;
  return {
    ...parsed,
    smtp: { ...smtp, passwordConfigured: Boolean(passwordEncrypted) },
  };
}
export function smtpPassword(storage: Storage) {
  const row = storage.db.prepare('SELECT json FROM settings WHERE id=1').get() as any;
  const encrypted = row ? JSON.parse(row.json).smtp.passwordEncrypted : undefined;
  return encrypted ? decrypt(encrypted, storage.rootKey, 'smtp-password') : undefined;
}
export function saveSettings(storage: Storage, raw: unknown, now: () => Date = () => new Date()) {
  const settings = settingsSchema.parse(raw);
  const old = storage.db.prepare('SELECT json FROM settings WHERE id=1').get() as any;
  const prior = old ? JSON.parse(old.json) : undefined;
  const { password, passwordConfigured, ...smtp } = settings.smtp;
  const passwordEncrypted =
    password === undefined
      ? prior?.smtp.passwordEncrypted
      : password
        ? encrypt(password, storage.rootKey, 'smtp-password')
        : undefined;
  const mailAlerts = settings.mailAlerts ?? prior?.mailAlerts;
  transaction(storage.db, () => {
    storage.db
      .prepare('INSERT INTO settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json')
      .run(
        JSON.stringify({
          ...settings,
          mailAlerts,
          smtp: { ...smtp, ...(passwordEncrypted ? { passwordEncrypted } : {}) },
        }),
      );
    if (smtp.to !== (prior?.smtp.to ?? '')) invalidatePendingMail(storage.db);
    else {
      const before: NonNullable<Settings['mailAlerts']> = prior?.mailAlerts ?? MAIL_ALERTS_OFF;
      const after: NonNullable<Settings['mailAlerts']> = mailAlerts ?? MAIL_ALERTS_OFF;
      for (const kind of ['registration', 'requestLimit', 'budget'] as const)
        if (before[kind] && !after[kind]) cancelPendingMail(storage.db, kind);
      const removed = before.openRouterKeys.filter((id) => !after.openRouterKeys.includes(id));
      for (const id of removed) cancelPendingMail(storage.db, 'providerLimit', id);
      if (removed.length) advanceMailEpoch(storage.db);
    }
    if (settings.timeZone !== (prior?.timeZone ?? DEFAULT_SETTINGS.timeZone))
      resetBudgetsForTimeZone(storage.db, settings, now());
  });
  return getSettings(storage);
}
export async function sendMail(storage: Storage, subject: string, text: string) {
  const settings = getSettings(storage);
  const { smtp } = settings;
  if (!smtp.host || !smtp.from || !smtp.to)
    throw new HttpError(400, 'SMTP 서버와 보낸 사람, 받는 사람을 먼저 설정해 주세요.');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure && !(!smtp.user && ['127.0.0.1', '::1'].includes(smtp.host)),
    auth: smtp.user ? { user: smtp.user, pass: smtpPassword(storage) || '' } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: smtp.from,
      to: smtp.to,
      subject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } catch {
    throw new HttpError(502, '메일을 보내지 못했습니다. SMTP 주소와 인증 설정을 확인해 주세요.');
  } finally {
    transport.close();
  }
}
export async function registerSettings(app: FastifyInstance, storage: Storage, now: () => Date) {
  app.get('/api/settings', async () => ({ settings: getSettings(storage) }));
  app.put('/api/settings', async (request) => ({
    settings: saveSettings(storage, request.body, now),
  }));
  app.post('/api/settings/smtp/test', async (request) => {
    z.object({}).parse(request.body ?? {});
    await sendMail(storage, 'Keydesk 테스트 메일', 'Keydesk 메일 연결이 확인되었습니다.');
    return { sent: true };
  });
}
