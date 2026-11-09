import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Credential, Entry } from '@keydesk/contracts';
import type { Storage } from './db.ts';
import { transaction, tableExists } from './db.ts';
import { encrypt, decrypt } from './crypto.ts';
import { validDate } from './dates.ts';
import { HttpError, invalid, missing } from './errors.ts';
const text = z.string().max(10000);
const url = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  });
const date = z.string().max(40).refine(validDate);
export const credentialDraftSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(200),
  value: z.string().min(1).max(65536).optional(),
  status: z.enum(['active', 'paused', 'revoked']),
  issuedAt: date,
  expiresAt: date,
});
export const entryDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  provider: z.string().max(200),
  description: text,
  websiteUrl: url,
  consoleUrl: url,
  docsUrl: url,
  endpointUrl: url,
  owner: z.string().max(200),
  tags: z.array(z.string().max(100)).max(50),
  plan: z.string().max(1000),
  quota: z.string().max(1000),
  notes: text,
  projectIds: z.array(z.string().uuid()).max(100),
  credentials: z.array(credentialDraftSchema).max(100).default([]),
});
export function listEntries(storage: Storage): Entry[] {
  const { db } = storage;
  return db
    .prepare('SELECT * FROM entries ORDER BY rowid DESC')
    .all()
    .map((row: any) => ({
      ...JSON.parse(row.json),
      credentials: db
        .prepare('SELECT json FROM credentials WHERE entry_id=? ORDER BY rowid')
        .all(row.id)
        .map((c: any) => JSON.parse(c.json)),
    }));
}
export function resolveCredential(storage: Storage, id: string, version?: number) {
  const row = storage.db.prepare('SELECT * FROM credentials WHERE id=?').get(id) as any;
  if (!row) return missing();
  const meta: Credential = JSON.parse(row.json);
  const selected = version ?? meta.version;
  const encrypted = storage.db
    .prepare('SELECT value FROM credential_versions WHERE credential_id=? AND version=?')
    .get(id, selected) as any;
  if (!encrypted) return missing();
  const value = decrypt(
    encrypted.value,
    storage.rootKey,
    `credential:${row.entry_id}:${id}:${selected}`,
  );
  return {
    id,
    entryId: row.entry_id,
    version: selected,
    value,
    status: meta.status,
    expiresAt: meta.expiresAt,
  };
}
export function writeEntry(storage: Storage, raw: unknown, now: () => Date, id?: string): Entry {
  const body = entryDraftSchema.parse(raw);
  const { db } = storage;
  const oldRow = id
    ? (db.prepare('SELECT json FROM entries WHERE id=?').get(id) as any)
    : undefined;
  if (id && !oldRow) return missing();
  if (new Set(body.projectIds).size !== body.projectIds.length)
    invalid('프로젝트가 중복되었습니다.');
  for (const project of body.projectIds)
    if (!db.prepare('SELECT id FROM projects WHERE id=?').get(project))
      invalid('연결할 프로젝트를 찾을 수 없습니다.');
  if (id && tableExists(db, 'gateway_routes'))
    for (const route of db
      .prepare(
        'SELECT r.project_id FROM gateway_routes r JOIN credentials c ON c.id=r.credential_id WHERE c.entry_id=?',
      )
      .all(id) as any[])
      if (!body.projectIds.includes(route.project_id))
        throw new HttpError(
          409,
          '게이트웨이 경로에서 사용하는 프로젝트 연결입니다. 경로를 먼저 변경해 주세요.',
        );
  const old = oldRow ? JSON.parse(oldRow.json) : undefined;
  const entryId = id || randomUUID(),
    at = now().toISOString();
  const prior = db.prepare('SELECT * FROM credentials WHERE entry_id=?').all(entryId) as any[];
  const known = new Map(prior.map((row) => [row.id, JSON.parse(row.json) as Credential]));
  const seen = new Set<string>();
  for (const draft of body.credentials) {
    if (draft.id && (!known.has(draft.id) || seen.has(draft.id)))
      invalid('인증값 식별자가 올바르지 않거나 중복되었습니다.');
    if (!draft.id && !draft.value) invalid('새 인증값을 입력해 주세요.');
    if (draft.id) seen.add(draft.id);
    if (draft.issuedAt && draft.expiresAt) {
      const bothDates = draft.issuedAt.length === 10 && draft.expiresAt.length === 10;
      const bothInstants = draft.issuedAt.length > 10 && draft.expiresAt.length > 10;
      if (
        (bothDates && draft.issuedAt > draft.expiresAt) ||
        (bothInstants && Date.parse(draft.issuedAt) > Date.parse(draft.expiresAt))
      )
        invalid('만료일은 발급일보다 빠를 수 없습니다.');
    }
  }
  const { credentials: _, ...fields } = body;
  const entry = {
    ...fields,
    id: entryId,
    createdAt: old?.createdAt || at,
    updatedAt: at,
  };
  db.prepare(
    'INSERT INTO entries VALUES (?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',
  ).run(entryId, JSON.stringify(entry));
  db.prepare('DELETE FROM entry_projects WHERE entry_id=?').run(entryId);
  for (const projectId of body.projectIds)
    db.prepare('INSERT INTO entry_projects VALUES (?,?)').run(entryId, projectId);
  const metadata: Credential[] = [];
  for (const draft of body.credentials) {
    const credentialId = draft.id || randomUUID();
    const prev = draft.id ? known.get(draft.id) : undefined;
    const replaced = Boolean(
      draft.value && (!prev || resolveCredential(storage, credentialId).value !== draft.value),
    );
    const version = prev ? prev.version + (replaced ? 1 : 0) : 1;
    const credential: Credential = {
      id: credentialId,
      label: draft.label,
      status: draft.status,
      issuedAt: draft.issuedAt,
      expiresAt: draft.expiresAt,
      version,
      createdAt: prev?.createdAt || at,
      updatedAt: at,
    };
    db.prepare(
      'INSERT INTO credentials VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',
    ).run(credentialId, entryId, JSON.stringify(credential));
    if (!prev || replaced)
      db.prepare('INSERT INTO credential_versions VALUES (?,?,?,?,?)').run(
        credentialId,
        version,
        encrypt(draft.value!, storage.rootKey, `credential:${entryId}:${credentialId}:${version}`),
        at,
        prev ? '인증값 교체' : '최초 등록',
      );
    if (
      credential.status !== 'active' ||
      prev?.version !== version ||
      prev?.expiresAt !== credential.expiresAt
    )
      db.prepare('DELETE FROM notifications WHERE credential_id=?').run(credentialId);
    metadata.push(credential);
    seen.add(credentialId);
  }
  for (const prev of prior)
    if (!seen.has(prev.id)) {
      assertCredentialUnreferenced(storage, prev.id);
      db.prepare('DELETE FROM credentials WHERE id=?').run(prev.id);
    }
  return { ...entry, credentials: metadata };
}
function assertCredentialUnreferenced(storage: Storage, id: string) {
  if (
    tableExists(storage.db, 'gateway_routes') &&
    storage.db.prepare('SELECT id FROM gateway_routes WHERE credential_id=?').get(id)
  )
    throw new HttpError(
      409,
      '게이트웨이 경로에서 사용하는 인증값입니다. 경로를 먼저 변경해 주세요.',
    );
}
export async function registerVault(
  app: FastifyInstance,
  storage: Storage,
  now: () => Date,
  audit: (action: string, details: Record<string, unknown>) => void,
) {
  const { db } = storage;
  app.get('/api/projects', async () => ({
    projects: db
      .prepare('SELECT id,name,created_at AS createdAt FROM projects ORDER BY created_at,id')
      .all(),
  }));
  app.post('/api/projects', async (request) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
    const project = { id: randomUUID(), name, createdAt: now().toISOString() };
    db.prepare('INSERT INTO projects VALUES (?,?,?)').run(project.id, name, project.createdAt);
    audit('프로젝트 생성', { id: project.id });
    return { project };
  });
  app.delete('/api/projects/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) return missing();
    if (
      db.prepare('SELECT 1 FROM entry_projects WHERE project_id=?').get(id) ||
      ['gateway_routes', 'gateway_clients'].some(
        (table) =>
          tableExists(db, table) && db.prepare(`SELECT 1 FROM ${table} WHERE project_id=?`).get(id),
      )
    )
      throw new HttpError(
        409,
        '사용 중인 프로젝트입니다. 연결된 항목과 게이트웨이를 먼저 변경해 주세요.',
      );
    db.prepare('DELETE FROM projects WHERE id=?').run(id);
    audit('프로젝트 삭제', { id });
    return { deleted: true };
  });
  app.get('/api/entries', async () => ({ entries: listEntries(storage) }));
  app.post('/api/entries', async (request) => {
    const entry = transaction(db, () => writeEntry(storage, request.body, now));
    audit('항목 생성', { id: entry.id });
    return { entry };
  });
  app.put('/api/entries/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const entry = transaction(db, () => writeEntry(storage, request.body, now, id));
    audit('항목 수정', { id });
    return { entry };
  });
  app.delete('/api/entries/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!db.prepare('SELECT id FROM entries WHERE id=?').get(id)) return missing();
    transaction(db, () => {
      for (const row of db.prepare('SELECT id FROM credentials WHERE entry_id=?').all(id) as any[])
        assertCredentialUnreferenced(storage, row.id);
      db.prepare('DELETE FROM entries WHERE id=?').run(id);
    });
    audit('항목 삭제', { id });
    return { deleted: true };
  });
  app.post('/api/entries/import', async (request) => {
    const body = z
      .object({
        entries: z
          .array(entryDraftSchema.extend({ entryId: z.string().uuid().optional() }))
          .min(1)
          .max(500),
      })
      .parse(request.body);
    const ids = body.entries.flatMap((entry) => (entry.entryId ? [entry.entryId] : []));
    if (new Set(ids).size !== ids.length) invalid('한 항목을 한 번에 여러 번 가져올 수 없습니다.');
    const entries = transaction(db, () =>
      body.entries.map((entry) => writeEntry(storage, entry, now, entry.entryId)),
    );
    audit('항목 가져오기', { count: entries.length });
    return { entries };
  });
  app.post('/api/credentials/:id/reveal', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { version } = z
      .object({ version: z.number().int().min(1).max(1000000).optional() })
      .parse(request.body ?? {});
    const credential = resolveCredential(storage, id, version);
    reply.header('Cache-Control', 'no-store');
    audit('인증값 조회', { id, version: credential.version });
    return { value: credential.value };
  });
  app.get('/api/credentials/:id/versions', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!db.prepare('SELECT id FROM credentials WHERE id=?').get(id)) return missing();
    return {
      versions: db
        .prepare(
          'SELECT version,created_at AS createdAt,reason FROM credential_versions WHERE credential_id=? ORDER BY version DESC',
        )
        .all(id),
    };
  });
}
