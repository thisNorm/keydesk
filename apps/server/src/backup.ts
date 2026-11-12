import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EncryptedBackup } from '@keydesk/contracts';
import type { Storage } from './db.ts';
import { CORE_SCHEMA, transaction, tableExists } from './db.ts';
import { derive, encrypt, decrypt } from './crypto.ts';
import {
  requireOwnerPassword,
  passwordSchema,
  assertOwnerCurrent,
  assertSessionCurrent,
} from './auth.ts';
import type { MaintenanceCoordinator } from './maintenance.ts';
import { entryDraftSchema, credentialDraftSchema } from './vault.ts';
import { settingsSchema } from './settings.ts';
import { HttpError } from './errors.ts';
import { routeSchema, clientSchema, priceSchema } from './gateway/validation.ts';
import { usdPattern } from './gateway/usage.ts';
import { validateBase } from './gateway/transport.ts';
import { routeCredentialIds } from './gateway/authentication.ts';
import { budgetRollupSchema } from './gateway/mail-budget.ts';
import { invalidatePendingMail, MAIL_ALERTS_OFF, preserveExpiryHistory } from './mail-outbox.ts';
const MAX_BYTES = 16 * 1024 * 1024;
const TABLES = [
  'projects',
  'entries',
  'entry_projects',
  'credentials',
  'credential_versions',
  'notifications',
  'settings',
  'gateway_routes',
  'gateway_clients',
  'gateway_prices',
  'gateway_usage',
  'gateway_daily',
  'gateway_budget_rollups',
] as const;
type Row = Record<string, string | number | null>;
interface LogicalBackup {
  schemaVersion: 1;
  tables: Record<string, Row[]>;
}
const envelopeSchema = z
  .object({
    format: z.literal('keydesk-backup'),
    version: z.literal(1),
    kdf: z.literal('scrypt-131072-8-1'),
    salt: z.string().length(24),
    iv: z.string().length(16),
    tag: z.string().length(24),
    data: z.string().max(Math.ceil(MAX_BYTES / 3) * 4 + 4),
  })
  .strict();
function collect(storage: Storage): LogicalBackup {
  return transaction(storage.db, () => {
    const tables: Record<string, Row[]> = {};
    for (const name of TABLES)
      if (tableExists(storage.db, name))
        tables[name] = storage.db.prepare(`SELECT * FROM ${name}`).all() as Row[];
    const credentials = new Map(tables.credentials.map((row) => [row.id, row]));
    for (const row of tables.credential_versions) {
      const credential = credentials.get(row.credential_id)!;
      row.value = decrypt(
        row.value as string,
        storage.rootKey,
        `credential:${credential.entry_id}:${row.credential_id}:${row.version}`,
      );
    }
    for (const row of tables.settings) {
      const parsed = JSON.parse(row.json as string);
      if (parsed.smtp.passwordEncrypted) {
        parsed.smtp.password = decrypt(
          parsed.smtp.passwordEncrypted,
          storage.rootKey,
          'smtp-password',
        );
        delete parsed.smtp.passwordEncrypted;
      }
      row.json = JSON.stringify(parsed);
    }
    return { schemaVersion: 1, tables };
  });
}
export async function createBackup(storage: Storage, password: string): Promise<EncryptedBackup> {
  passwordSchema.parse(password);
  const data = JSON.stringify(collect(storage));
  if (Buffer.byteLength(data) > MAX_BYTES)
    throw new HttpError(413, '백업 데이터 크기가 허용 범위를 넘었습니다.');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  const sealed = JSON.parse(encrypt(data, key, 'keydesk-backup:1'));
  return {
    format: 'keydesk-backup',
    version: 1,
    kdf: 'scrypt-131072-8-1',
    salt: salt.toString('base64'),
    ...sealed,
  };
}
function verifyCandidate(storage: Storage, candidate: DatabaseSync) {
  const json = (row: Row) => JSON.parse(row.json as string);
  const id = z.string().uuid();
  const stamp = z.string().datetime({ offset: true });
  const priceRecordSchema = priceSchema.extend({ id, createdAt: stamp });
  for (const row of candidate.prepare('SELECT * FROM projects').all() as Row[])
    z.object({ id, name: z.string().trim().min(1).max(100), created_at: stamp })
      .strict()
      .parse(row);
  for (const row of candidate.prepare('SELECT * FROM entries').all() as Row[]) {
    const parsed = json(row);
    entryDraftSchema.parse(parsed);
    z.object({ id, createdAt: stamp, updatedAt: stamp }).parse(parsed);
    if (parsed.id !== row.id) throw new Error('entry identity');
    const linked = candidate
      .prepare('SELECT project_id FROM entry_projects WHERE entry_id=? ORDER BY project_id')
      .all(row.id) as any[];
    if (
      JSON.stringify(linked.map((r) => r.project_id)) !==
      JSON.stringify([...parsed.projectIds].sort())
    )
      throw new Error('project membership');
    if ('credentials' in parsed || 'value' in parsed) throw new Error('entry secret field');
  }
  for (const row of candidate.prepare('SELECT * FROM credentials').all() as Row[]) {
    const parsed = json(row);
    credentialDraftSchema
      .omit({ value: true })
      .extend({
        id,
        version: z.number().int().min(1).max(1000000),
        createdAt: stamp,
        updatedAt: stamp,
      })
      .strict()
      .parse(parsed);
    if (parsed.id !== row.id) throw new Error('credential identity');
    const latest = candidate
      .prepare('SELECT MAX(version) AS version FROM credential_versions WHERE credential_id=?')
      .get(row.id) as any;
    if (latest.version !== parsed.version) throw new Error('credential version');
  }
  for (const row of candidate.prepare('SELECT * FROM credential_versions').all() as Row[]) {
    z.object({
      credential_id: id,
      version: z.number().int().min(1).max(1000000),
      value: z.string().min(1).max(65536),
      created_at: stamp,
      reason: z.string().max(1000),
    })
      .strict()
      .parse(row);
    const credential = candidate
      .prepare('SELECT entry_id FROM credentials WHERE id=?')
      .get(row.credential_id) as any;
    candidate
      .prepare('UPDATE credential_versions SET value=? WHERE credential_id=? AND version=?')
      .run(
        encrypt(
          row.value as string,
          storage.rootKey,
          `credential:${credential.entry_id}:${row.credential_id}:${row.version}`,
        ),
        row.credential_id,
        row.version,
      );
  }
  for (const row of candidate.prepare('SELECT * FROM settings').all() as Row[]) {
    const parsed = settingsSchema.parse(json(row));
    const { password, passwordConfigured, ...smtp } = parsed.smtp;
    candidate.prepare('UPDATE settings SET json=? WHERE id=?').run(
      JSON.stringify({
        ...parsed,
        ...(parsed.mailAlerts ? { mailAlerts: MAIL_ALERTS_OFF } : {}),
        smtp: {
          ...smtp,
          ...(password
            ? {
                passwordEncrypted: encrypt(password, storage.rootKey, 'smtp-password'),
              }
            : {}),
        },
      }),
      row.id,
    );
  }
  for (const row of candidate.prepare('SELECT * FROM notifications').all() as Row[]) {
    const parsed = json(row);
    z.object({
      id,
      entryId: id,
      credentialId: id,
      title: z.string().max(200),
      message: z.string().max(2000),
      createdAt: stamp,
      read: z.boolean(),
      mailStatus: z.enum(['unconfigured', 'pending', 'sent', 'failed']),
    })
      .strict()
      .parse(parsed);
    if (parsed.id !== row.id || parsed.credentialId !== row.credential_id)
      throw new Error('notification identity');
  }
  if (tableExists(candidate, 'gateway_routes'))
    for (const row of candidate.prepare('SELECT * FROM gateway_routes').all() as Row[]) {
      const route = json(row);
      const { id: routeId, createdAt, updatedAt, ...draft } = route;
      const validated = routeSchema.parse(draft);
      for (const credentialId of routeCredentialIds(validated))
        if (
          !candidate
            .prepare(
              'SELECT 1 FROM credentials c JOIN entry_projects p ON p.entry_id=c.entry_id WHERE c.id=? AND p.project_id=?',
            )
            .get(credentialId, row.project_id)
        )
          throw new Error('gateway membership');
      z.object({ id, createdAt: stamp, updatedAt: stamp }).parse({
        id: routeId,
        createdAt,
        updatedAt,
      });
      validateBase(validated.baseUrl, validated.allowPrivateNetwork);
      if (
        route.id !== row.id ||
        route.projectId !== row.project_id ||
        route.credentialId !== row.credential_id
      )
        throw new Error('gateway identity');
    }
  if (tableExists(candidate, 'gateway_clients'))
    for (const row of candidate.prepare('SELECT * FROM gateway_clients').all() as Row[]) {
      const client = json(row);
      clientSchema
        .extend({
          id,
          prefix: z.string().regex(/^kd_[A-Za-z0-9_-]{8}$/),
          revoked: z.boolean(),
          createdAt: stamp,
          lastUsedAt: stamp.nullable(),
        })
        .parse(client);
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(row.token_hash);
      if (
        !candidate.prepare('SELECT 1 FROM projects WHERE id=?').get(row.project_id) ||
        client.id !== row.id ||
        client.projectId !== row.project_id
      )
        throw new Error('client project');
      if (!client.revoked)
        for (const routeId of client.routeIds) {
          const route = candidate
            .prepare('SELECT project_id FROM gateway_routes WHERE id=?')
            .get(routeId) as any;
          if (!route || route.project_id !== client.projectId)
            throw new Error('client route scope');
        }
      client.revoked = true;
      candidate
        .prepare('UPDATE gateway_clients SET json=? WHERE id=?')
        .run(JSON.stringify(client), row.id);
    }
  if (tableExists(candidate, 'gateway_prices'))
    for (const row of candidate.prepare('SELECT * FROM gateway_prices').all() as Row[]) {
      const price = priceRecordSchema.parse(json(row));
      if (price.id !== row.id) throw new Error('price identity');
    }
  if (tableExists(candidate, 'gateway_usage'))
    for (const row of candidate.prepare('SELECT * FROM gateway_usage').all() as Row[]) {
      const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
      const usage = z
        .object({
          id,
          createdAt: stamp,
          projectId: id,
          clientId: id,
          routeId: id,
          credentialId: id,
          credentialVersion: amount.min(1),
          model: z.string().max(200).nullable(),
          statusCode: z.number().int().min(100).max(999).nullable(),
          durationMs: amount,
          outcome: z.enum(['success', 'error', 'cancelled']),
          inputTokens: amount.nullable(),
          outputTokens: amount.nullable(),
          cachedInputTokens: amount.nullable(),
          usageSource: z.string().max(200),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .nullable(),
          costMicros: amount.nullable(),
          costExactMicros: z
            .string()
            .regex(/^\d{1,40}\.\d{1,9}$/)
            .nullable()
            .optional(),
          costStatus: z
            .enum(['estimated', 'unpriced', 'unknown-usage', 'unsupported-cache-write', 'overflow'])
            .optional(),
          cacheCreationInputTokens: amount.nullable().optional(),
          adapter: z.enum(['generic', 'openai', 'anthropic', 'gemini']).optional(),
          provider: z
            .enum([
              'naver-maps',
              'kakao-local',
              'kakao-mobility',
              'openrouter',
              'gemini',
              'openai',
              'anthropic',
            ])
            .optional(),
          originId: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          operation: z
            .object({
              id: z.string().regex(/^[a-f0-9]{64}$/),
              name: z.string().min(1).max(100),
            })
            .strict()
            .optional(),
          totalTokens: amount.nullable().optional(),
          reasoningTokens: amount.nullable().optional(),
          reportedCostUsd: z.string().regex(usdPattern).optional(),
          priceSnapshot: priceRecordSchema.nullable().optional(),
          softAlerts: z.array(z.string().max(500)).max(10).optional(),
        })
        .parse(json(row));
      if (
        usage.id !== row.id ||
        usage.projectId !== row.project_id ||
        usage.clientId !== row.client_id ||
        usage.createdAt !== row.created_at
      )
        throw new Error('usage identity');
    }
  if (tableExists(candidate, 'gateway_daily'))
    for (const row of candidate.prepare('SELECT * FROM gateway_daily').all() as Row[]) {
      z.object({
        client_id: id,
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })
        .strict()
        .parse(row);
    }
  if (tableExists(candidate, 'gateway_budget_rollups'))
    for (const row of candidate.prepare('SELECT * FROM gateway_budget_rollups').all() as Row[]) {
      const routeId = id.parse(row.route_id);
      const route = candidate.prepare('SELECT json FROM gateway_routes WHERE id=?').get(routeId);
      if (!route || !json(route as Row).mailBudget) throw new Error('budget route');
      budgetRollupSchema.parse(json(row));
    }
  if (candidate.prepare('PRAGMA foreign_key_check').all().length) throw new Error('foreign key');
  if ((candidate.prepare('PRAGMA integrity_check').get() as any).integrity_check !== 'ok')
    throw new Error('integrity');
}
export async function restoreBackup(
  storage: Storage,
  password: string,
  raw: unknown,
  authorize: () => void = () => {},
) {
  passwordSchema.parse(password);
  const envelope = envelopeSchema.parse(raw);
  let logical: LogicalBackup;
  try {
    for (const [field, length] of [
      ['salt', 16],
      ['iv', 12],
      ['tag', 16],
    ] as const) {
      const encoded = envelope[field];
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.length !== length || bytes.toString('base64') !== encoded)
        throw new Error('encoding');
    }
    if (Buffer.from(envelope.data, 'base64').length > MAX_BYTES) throw new Error('size');
    const key = await derive(password, Buffer.from(envelope.salt, 'base64'));
    const plaintext = decrypt(JSON.stringify(envelope), key, 'keydesk-backup:1');
    if (Buffer.byteLength(plaintext) > MAX_BYTES) throw new Error('size');
    logical = JSON.parse(plaintext);
    if (
      logical.schemaVersion !== 1 ||
      !logical.tables ||
      typeof logical.tables !== 'object' ||
      Array.isArray(logical.tables)
    )
      throw new Error('format');
  } catch {
    throw new HttpError(
      400,
      '백업 암호가 틀리거나 파일이 손상되었습니다. 기존 데이터는 변경하지 않았습니다.',
    );
  }
  let candidate: DatabaseSync | undefined;
  try {
    candidate = new DatabaseSync(':memory:');
    candidate.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;');
    candidate.exec(CORE_SCHEMA);
    const actual = TABLES.filter((table) => tableExists(storage.db, table));
    for (const table of actual.filter((name) => name.startsWith('gateway_'))) {
      const schema = storage.db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .get(table) as any;
      candidate.exec(schema.sql);
    }
    if (
      Object.keys(logical.tables).some((name) => !actual.includes(name as any)) ||
      actual.some(
        (name) =>
          !(name === 'gateway_budget_rollups' && !Object.hasOwn(logical.tables, name)) &&
          !Array.isArray(logical.tables[name]),
      )
    )
      throw new Error('tables');
    let count = 0;
    transaction(candidate, () => {
      for (const name of actual) {
        const columns = (candidate!.prepare(`PRAGMA table_info(${name})`).all() as any[]).map(
          (row) => row.name as string,
        );
        const rows = logical.tables[name] ?? [];
        count += rows.length;
        if (count > 100000) throw new Error('rows');
        const insert = candidate!.prepare(
          `INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        );
        for (const row of rows) {
          if (
            !row ||
            typeof row !== 'object' ||
            Object.keys(row).length !== columns.length ||
            Object.keys(row).some((key) => !columns.includes(key))
          )
            throw new Error('columns');
          for (const key of columns)
            if (row[key] !== null && typeof row[key] !== 'string' && typeof row[key] !== 'number')
              throw new Error('type');
          insert.run(...columns.map((key) => row[key]));
        }
      }
      verifyCandidate(storage, candidate!);
    });
    const snapshot = join(storage.dataDir, `pre-restore-${Date.now()}-${randomUUID()}.sqlite`);
    authorize();
    await sqliteBackup(storage.db, snapshot);
    await chmod(snapshot, 0o600);
    const validated = new Map(
      actual.map((name) => [name, candidate!.prepare(`SELECT * FROM ${name}`).all() as Row[]]),
    );
    transaction(storage.db, () => {
      authorize();
      preserveExpiryHistory(storage.db);
      for (const name of [...actual].reverse()) storage.db.prepare(`DELETE FROM ${name}`).run();
      for (const name of actual) {
        const rows = validated.get(name)!;
        if (!rows.length) continue;
        const columns = Object.keys(rows[0]);
        const insert = storage.db.prepare(
          `INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        );
        for (const row of rows) insert.run(...columns.map((key) => row[key]));
      }
      preserveExpiryHistory(storage.db);
      invalidatePendingMail(storage.db);
      storage.db.prepare('DELETE FROM sessions').run();
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      '백업 데이터 검증 또는 복원에 실패했습니다. 기존 데이터는 변경하지 않았습니다.',
    );
  } finally {
    candidate?.close();
  }
}
export async function registerBackups(
  app: FastifyInstance,
  storage: Storage,
  now: () => Date,
  maintenance: MaintenanceCoordinator,
) {
  const body = z.object({
    password: passwordSchema,
    ownerPassword: z.string().min(1).max(256),
  });
  app.post('/api/backups', async (request) => {
    const parsed = body.parse(request.body);
    const owner = await requireOwnerPassword(storage, parsed.ownerPassword);
    assertSessionCurrent(storage, request.cookies.keydesk_session, now);
    const backup = await createBackup(storage, parsed.password);
    transaction(storage.db, () => {
      assertOwnerCurrent(storage, owner.password_hash);
      assertSessionCurrent(storage, request.cookies.keydesk_session, now);
    });
    return { backup };
  });
  app.post('/api/backups/restore', async (request, reply) => {
    const parsed = body.extend({ backup: envelopeSchema }).parse(request.body);
    const release = await maintenance.exclusive(() => app.gatewayWaitForIdle());
    try {
      assertSessionCurrent(storage, request.cookies.keydesk_session, now);
      const owner = await requireOwnerPassword(storage, parsed.ownerPassword);
      const authorize = () => {
        assertOwnerCurrent(storage, owner.password_hash);
        assertSessionCurrent(storage, request.cookies.keydesk_session, now);
      };
      authorize();
      await restoreBackup(storage, parsed.password, parsed.backup, authorize);
      reply.clearCookie('keydesk_session', { path: '/' });
      return { restored: true };
    } finally {
      release();
    }
  });
}
