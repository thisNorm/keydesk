import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, token, digest } from './crypto.ts';
export const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entry_projects (entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id), PRIMARY KEY(entry_id,project_id));
CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credential_versions (credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE, version INTEGER NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY(credential_id,version));
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE, version INTEGER NOT NULL, stage INTEGER NOT NULL, json TEXT NOT NULL, UNIQUE(credential_id,version,stage));
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY, kind TEXT NOT NULL, epoch TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS mail_outbox_pending ON mail_outbox(status,created_at);
`;
export interface Storage {
  db: DatabaseSync;
  rootKey: Buffer;
  dataDir: string;
}
export function openStorage(dataDir: string): Storage {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const dbPath = join(dataDir, 'keydesk.sqlite');
  const keyPath = join(dataDir, 'root-key');
  if (existsSync(dbPath) && !existsSync(keyPath))
    throw new Error('기존 데이터베이스의 루트 암호화 키가 없습니다. 원래 키를 복구해 주세요.');
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const rootKey = readFileSync(keyPath);
  if (rootKey.length !== 32) throw new Error('루트 암호화 키 형식이 올바르지 않습니다.');
  chmodSync(keyPath, 0o600);
  const db = new DatabaseSync(dbPath);
  try {
    // SQLite uses the database's current mode when creating the WAL and shared memory files.
    chmodSync(dbPath, 0o600);
    if (process.platform !== 'win32') {
      for (const suffix of ['-wal', '-shm']) {
        try {
          chmodSync(dbPath + suffix, 0o600);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const version = Number((db.prepare('PRAGMA user_version').get() as any).user_version);
    if (version > 1)
      throw new Error('더 새로운 데이터베이스 형식입니다. 최신 Keydesk로 실행해 주세요.');
    db.exec(CORE_SCHEMA);
    db.exec('PRAGMA user_version=1');
    const check = db.prepare("SELECT value FROM meta WHERE key='root-check'").get() as any;
    if (check) {
      try {
        if (decrypt(check.value, rootKey, 'root-check') !== 'keydesk') throw new Error('invalid');
      } catch {
        throw new Error(
          '루트 암호화 키가 데이터베이스와 일치하지 않습니다. 원래 키를 복구해 주세요.',
        );
      }
    } else
      db.prepare('INSERT INTO meta VALUES (?,?)').run(
        'root-check',
        encrypt('keydesk', rootKey, 'root-check'),
      );
    if (!db.prepare('SELECT id FROM owner').get()) {
      const tokenPath = join(dataDir, 'bootstrap-token');
      const bootstrap = existsSync(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : token();
      if (!existsSync(tokenPath)) writeFileSync(tokenPath, bootstrap, { mode: 0o600, flag: 'wx' });
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(
        'bootstrap-hash',
        digest(bootstrap),
      );
    }
    return { db, rootKey, dataDir };
  } catch (error) {
    db.close();
    throw error;
  }
}
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function tableExists(db: DatabaseSync, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
