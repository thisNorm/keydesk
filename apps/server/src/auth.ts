import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Storage } from './db.ts';
import { transaction } from './db.ts';
import { digest, equal, hashPassword, verifyPassword, token } from './crypto.ts';
import { HttpError } from './errors.ts';
export const passwordSchema = z.string().min(12).max(256);
export function assertOwnerCurrent(storage: Storage, expectedHash: string) {
  const owner = storage.db.prepare('SELECT * FROM owner WHERE id=1').get() as any;
  if (!owner || owner.password_hash !== expectedHash)
    throw new HttpError(401, '인증 정보가 변경되었습니다. 다시 로그인해 주세요.');
  return owner;
}
export function assertSessionCurrent(storage: Storage, raw: string | undefined, now: () => Date) {
  if (
    !raw ||
    !storage.db
      .prepare('SELECT hash FROM sessions WHERE hash=? AND expires_at>?')
      .get(digest(raw), now().toISOString())
  )
    throw new HttpError(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.');
}
export async function requireOwnerPassword(storage: Storage, password: string) {
  const owner = storage.db.prepare('SELECT * FROM owner WHERE id=1').get() as any;
  if (!owner || !(await verifyPassword(password, owner.password_hash)))
    throw new HttpError(401, '소유자 비밀번호가 올바르지 않습니다.');
  return assertOwnerCurrent(storage, owner.password_hash);
}
export async function registerAuth(
  app: FastifyInstance,
  storage: Storage,
  origin: string,
  now: () => Date,
) {
  await app.register(cookie);
  const { db } = storage;
  const session = (request: FastifyRequest) => {
    const raw = request.cookies.keydesk_session;
    if (!raw || raw.length > 256) return undefined;
    const found = db
      .prepare('SELECT * FROM sessions WHERE hash=? AND expires_at>?')
      .get(digest(raw), now().toISOString()) as any;
    return found;
  };
  const state = (request: FastifyRequest) => {
    const owner = db.prepare('SELECT name FROM owner WHERE id=1').get() as any;
    const current = session(request);
    return {
      initialized: Boolean(owner),
      authenticated: Boolean(owner && current),
      ...(owner && current ? { user: { name: owner.name }, csrfToken: current.csrf } : {}),
    };
  };
  const issue = (reply: FastifyReply, expectedHash: string) => {
    const raw = token(),
      csrf = token();
    const expires = new Date(now().getTime() + 12 * 3600000);
    const owner = transaction(db, () => {
      const current = assertOwnerCurrent(storage, expectedHash);
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now().toISOString());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
        digest(raw),
        csrf,
        expires.toISOString(),
      );
      return current;
    });
    reply.setCookie('keydesk_session', raw, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: origin.startsWith('https:'),
      maxAge: 43200,
    });
    return {
      initialized: true,
      authenticated: true,
      user: { name: owner.name },
      csrfToken: csrf,
    };
  };
  app.addHook('onRequest', async (request, reply) => {
    const path = request.routeOptions.url || request.url.split('?')[0];
    if (!path.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (path === '/api/status' && request.method === 'GET') return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== origin)
      throw new HttpError(403, '허용되지 않은 요청 출처입니다.');
    const publicPath =
      (path === '/api/auth/state' && request.method === 'GET') ||
      (['/api/auth/setup', '/api/auth/login'].includes(path) && request.method === 'POST');
    if (publicPath) return;
    const current = session(request);
    if (!current) throw new HttpError(401, '로그인이 필요합니다.');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      (typeof request.headers['x-csrf-token'] !== 'string' ||
        !equal(request.headers['x-csrf-token'], current.csrf))
    )
      throw new HttpError(403, '요청 확인 토큰이 올바르지 않습니다. 다시 로그인해 주세요.');
  });
  app.get('/api/auth/state', async (request) => state(request));
  app.post('/api/auth/setup', async (request, reply) => {
    if (db.prepare('SELECT id FROM owner').get())
      throw new HttpError(409, '초기 설정이 이미 완료되었습니다.');
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip))
      throw new HttpError(403, '초기 설정은 서버의 로컬 연결에서만 가능합니다.');
    const body = z
      .object({
        token: z.string().min(20).max(128),
        name: z.string().trim().min(1).max(100),
        password: passwordSchema,
      })
      .parse(request.body);
    const stored = db.prepare("SELECT value FROM meta WHERE key='bootstrap-hash'").get() as any;
    if (!stored || !equal(digest(body.token), stored.value))
      throw new HttpError(403, '초기 설정 토큰이 올바르지 않습니다.');
    const hash = await hashPassword(body.password);
    transaction(db, () => {
      if (db.prepare('SELECT id FROM owner').get())
        throw new HttpError(409, '초기 설정이 이미 완료되었습니다.');
      db.prepare('INSERT INTO owner VALUES (1,?,?)').run(body.name, hash);
      db.prepare("DELETE FROM meta WHERE key='bootstrap-hash'").run();
    });
    try {
      unlinkSync(join(storage.dataDir, 'bootstrap-token'));
    } catch {}
    return issue(reply, hash);
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.post('/api/auth/login', async (request, reply) => {
    const body = z.object({ password: z.string().min(1).max(256) }).parse(request.body);
    const key = request.ip;
    if (attempts.size > 1000)
      for (const [ip, entry] of attempts) if (entry.until < now().getTime()) attempts.delete(ip);
    const bucket = attempts.get(key);
    if (bucket && bucket.until > now().getTime() && bucket.count >= 10)
      throw new HttpError(429, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    attempts.set(
      key,
      bucket && bucket.until > now().getTime()
        ? { ...bucket, count: bucket.count + 1 }
        : { count: 1, until: now().getTime() + 900000 },
    );
    const owner = await requireOwnerPassword(storage, body.password);
    attempts.delete(key);
    return issue(reply, owner.password_hash);
  });
  app.post('/api/auth/logout', async (request, reply) => {
    db.prepare('DELETE FROM sessions WHERE hash=?').run(
      digest(request.cookies.keydesk_session || ''),
    );
    reply.clearCookie('keydesk_session', { path: '/' });
    return { loggedOut: true };
  });
  app.post('/api/auth/password', async (request, reply) => {
    const body = z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: passwordSchema,
      })
      .parse(request.body);
    const owner = await requireOwnerPassword(storage, body.currentPassword);
    const hash = await hashPassword(body.newPassword);
    transaction(db, () => {
      assertSessionCurrent(storage, request.cookies.keydesk_session, now);
      const current = db.prepare('SELECT password_hash FROM owner WHERE id=1').get() as any;
      if (current.password_hash !== owner.password_hash)
        throw new HttpError(409, '비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
      db.prepare('UPDATE owner SET password_hash=? WHERE id=1').run(hash);
      db.prepare('DELETE FROM sessions').run();
    });
    reply.clearCookie('keydesk_session', { path: '/' });
    return { changed: true };
  });
}
