import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { ZodError } from 'zod';
import type { CoreContext } from './context.ts';
import { openStorage } from './db.ts';
import { registerAuth } from './auth.ts';
import { registerVault, resolveCredential } from './vault.ts';
import { registerSettings, getSettings } from './settings.ts';
import { registerNotifications } from './notifications.ts';
import { registerBackups } from './backup.ts';
import { registerGateway } from './gateway/index.ts';
import { installMaintenance } from './maintenance.ts';
import { createMailAlerts } from './mail-alerts.ts';
import type { MailLookupOptions } from './mail-provider.ts';
export interface AppOptions {
  dataDir: string;
  origin: string;
  now?: () => Date;
  backgroundJobs?: boolean;
  mailLookup?: MailLookupOptions;
}
declare module 'fastify' {
  interface FastifyInstance {
    context: CoreContext;
  }
}
export async function createApp(options: AppOptions) {
  const configured = new URL(options.origin);
  if (!['http:', 'https:'].includes(configured.protocol) || configured.origin !== options.origin)
    throw new Error('KEYDESK_ORIGIN에는 경로 없는 HTTP 또는 HTTPS 주소를 입력해 주세요.');
  const storage = openStorage(options.dataDir);
  const now = options.now ?? (() => new Date());
  const app = Fastify({
    logger: false,
    bodyLimit: 24 * 1024 * 1024,
    trustProxy: false,
    requestTimeout: 120000,
  });
  const maintenance = installMaintenance(app);
  const audit = (action: string, details: Record<string, unknown>) => {
    storage.db
      .prepare('INSERT INTO audit_events (created_at,action,details) VALUES (?,?,?)')
      .run(now().toISOString(), action, JSON.stringify(details));
  };
  const context: CoreContext = {
    db: storage.db,
    now,
    getSettings: () => getSettings(storage),
    getCredential: (id) => resolveCredential(storage, id),
    audit,
  };
  app.decorate('context', context);
  let interval: ReturnType<typeof setInterval> | undefined;
  let initialRefresh: ReturnType<typeof setTimeout> | undefined;
  let notifications: Awaited<ReturnType<typeof registerNotifications>> | undefined;
  app.addHook('onClose', async () => {
    if (interval) clearInterval(interval);
    if (initialRefresh) clearTimeout(initialRefresh);
    await notifications?.drain();
    storage.db.close();
    storage.rootKey.fill(0);
  });
  app.setErrorHandler((error, request, reply) => {
    const known = error as {
      statusCode?: number;
      message?: string;
      code?: string;
    };
    const status =
      error instanceof ZodError
        ? 400
        : typeof known.statusCode === 'number' && known.statusCode >= 400 && known.statusCode < 600
          ? known.statusCode
          : 500;
    const message =
      error instanceof ZodError
        ? '입력값을 확인해 주세요.'
        : status === 413
          ? '요청 데이터 크기가 허용 범위를 넘었습니다.'
          : status === 500
            ? '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
            : known.code?.startsWith('FST_ERR_')
              ? '요청 형식이 올바르지 않습니다. 입력값을 확인해 주세요.'
              : known.message || '요청을 처리하지 못했습니다.';
    reply.code(status).send({ message });
  });
  app.setNotFoundHandler((request, reply) => {
    if (
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/gw/') &&
      ['GET', 'HEAD'].includes(request.method) &&
      typeof reply.sendFile === 'function'
    )
      return reply.header('Cache-Control', 'no-store').sendFile('index.html');
    return reply.code(404).send({ message: '요청한 경로를 찾을 수 없습니다.' });
  });
  try {
    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    });
    await registerAuth(app, storage, options.origin, now);
    app.get('/api/status', async () => ({ status: 'ok' }));
    const mail = createMailAlerts(storage, context, options.mailLookup);
    context.mailAlerts = mail;
    await registerVault(app, storage, now, audit, mail);
    await registerSettings(app, storage, now);
    notifications = await registerNotifications(app, storage, now, mail);
    await registerGateway(app, context);
    mail.register(app);
    await registerBackups(app, storage, now, maintenance);
    if (options.backgroundJobs !== false) {
      const refresh = () => {
        void maintenance.background(() => notifications!.refresh()).catch(() => {});
      };
      initialRefresh = setTimeout(refresh, 0);
      initialRefresh.unref();
      interval = setInterval(refresh, 60000);
      interval.unref();
    }
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
