import { readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openStorage, transaction } from './db.ts';
import { hashPassword } from './crypto.ts';
import { requireOwnerPassword, passwordSchema, assertOwnerCurrent } from './auth.ts';
import { createBackup, restoreBackup } from './backup.ts';
export interface AdminOptions {
  dataDir: string;
  origin?: string;
  inputPath?: string;
  outputPath?: string;
  password?: string;
  ownerPassword?: string;
  newPassword?: string;
}
export async function runAdmin(
  command: 'backup' | 'restore' | 'reset-password',
  options: AdminOptions,
) {
  const storage = openStorage(options.dataDir);
  try {
    if (command === 'reset-password') {
      const password = passwordSchema.parse(options.newPassword);
      const owner = storage.db.prepare('SELECT id FROM owner WHERE id=1').get();
      if (!owner) throw new Error('먼저 브라우저에서 초기 설정을 완료해 주세요.');
      const hash = await hashPassword(password);
      transaction(storage.db, () => {
        storage.db.prepare('UPDATE owner SET password_hash=? WHERE id=1').run(hash);
        storage.db.prepare('DELETE FROM sessions').run();
      });
    } else {
      const owner = await requireOwnerPassword(storage, options.ownerPassword || '');
      if (command === 'backup') {
        if (!options.outputPath) throw new Error('백업 파일 경로가 필요합니다.');
        const backup = await createBackup(storage, options.password || '');
        assertOwnerCurrent(storage, owner.password_hash);
        await writeFile(options.outputPath, JSON.stringify(backup), {
          mode: 0o600,
          flag: 'wx',
        });
        await chmod(options.outputPath, 0o600);
      } else {
        if (!options.inputPath) throw new Error('복원 파일 경로가 필요합니다.');
        // The gateway schema is part of every logical backup; load the trusted local schema before restoration.
        const { registerGateway } = await import('./gateway/index.ts');
        const Fastify = (await import('fastify')).default;
        const app = Fastify({ logger: false });
        try {
          const { getSettings } = await import('./settings.ts');
          const { resolveCredential } = await import('./vault.ts');
          await registerGateway(app, {
            db: storage.db,
            now: () => new Date(),
            getSettings: () => getSettings(storage),
            getCredential: (id) => resolveCredential(storage, id),
            audit: () => {},
          });
          await restoreBackup(
            storage,
            options.password || '',
            JSON.parse(await readFile(options.inputPath, 'utf8')),
            () => {
              assertOwnerCurrent(storage, owner.password_hash);
            },
          );
        } finally {
          await app.close();
        }
      }
    }
  } finally {
    storage.db.close();
    storage.rootKey.fill(0);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (!['backup', 'restore', 'reset-password'].includes(command))
      throw new Error('backup, restore 또는 reset-password 명령을 사용해 주세요.');
    if (!process.env.KEYDESK_PASSWORD_FILE)
      throw new Error('KEYDESK_PASSWORD_FILE에 비밀번호 JSON 파일 경로를 지정해 주세요.');
    const secrets = JSON.parse(await readFile(process.env.KEYDESK_PASSWORD_FILE, 'utf8'));
    await runAdmin(command as 'backup' | 'restore' | 'reset-password', {
      dataDir: resolve(process.env.KEYDESK_DATA_DIR || '.local/keydesk'),
      inputPath: process.env.KEYDESK_INPUT_PATH,
      outputPath: process.env.KEYDESK_OUTPUT_PATH,
      password: secrets.password,
      ownerPassword: secrets.ownerPassword,
      newPassword: secrets.newPassword,
    });
    console.log('관리 작업이 완료되었습니다.');
  } catch {
    console.error(
      '관리 작업에 실패했습니다. 입력 파일, 비밀번호와 서버 중지 상태를 확인해 주세요.',
    );
    process.exitCode = 1;
  }
}
