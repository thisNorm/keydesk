import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  mkdir,
  rm,
  lstat,
  chmod,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createApp } from '../../apps/server/src/app.ts';
import { root, configuration } from '../lib.mjs';
import { scheduledBackup } from '../scheduled-backup.mjs';
import { runAdmin } from '../../apps/server/src/cli.ts';
const password = 'scheduled-owner-password-2026';
const backupPassword = 'scheduled-backup-password-2026';
const pattern = /^keydesk-scheduled-\d{8}T\d{9}Z-[a-f0-9]{32}\.keydesk$/;
function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, 'tools/scheduled-backup.mjs'), ...args],
      { env: { ...process.env, ...env }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
}
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), '키 데스크 예약 백업 '));
  const dataDir = path.join(dir, '실행 데이터');
  const directory = path.join(dir, '백업 보관함');
  const passwordFile = path.join(dir, '비밀번호.json');
  await writeFile(
    passwordFile,
    '\uFEFF' + JSON.stringify({ ownerPassword: password, password: backupPassword }),
    { mode: 0o600 },
  );
  const origin = 'http://127.0.0.1:8088';
  const app = await createApp({ dataDir, origin, backgroundJobs: false });
  const token = (await readFile(path.join(dataDir, 'bootstrap-token'), 'utf8')).trim();
  const setup = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: { origin },
    payload: { token, name: '예약 검사', password },
  });
  assert.equal(setup.statusCode, 200);
  const cookie = setup.headers['set-cookie'].split(';')[0];
  const headers = { origin, cookie, 'x-csrf-token': setup.json().csrfToken };
  await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    dataDir,
    directory,
    passwordFile,
    app,
    headers,
    env: { KEYDESK_DATA_DIR: dataDir },
  };
}
test('실행 중 서버를 유지하며 한글 경로에 암호화 백업을 만들고 자신의 일반 파일만 보존 개수대로 정리한다', async (t) => {
  const f = await fixture(t);
  await mkdir(f.directory);
  const unrelated = path.join(f.directory, '다른 백업.keydesk');
  await writeFile(unrelated, '보존');
  const ownedDir = 'keydesk-scheduled-20000101T000000000Z-' + 'a'.repeat(32) + '.keydesk';
  await mkdir(path.join(f.directory, ownedDir));
  if (process.platform !== 'win32') {
    const linkName = 'keydesk-scheduled-20000101T000000000Z-' + 'd'.repeat(32) + '.keydesk';
    await symlink(unrelated, path.join(f.directory, linkName));
  }
  let latest;
  for (let i = 0; i < 3; i++) {
    const response = await f.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: f.headers,
      payload: { name: '백업 프로젝트 ' + i },
    });
    assert.equal(response.statusCode, 200);
    const result = await run(
      ['--directory', f.directory, '--keep', '2', '--password-file', f.passwordFile],
      f.env,
    );
    assert.equal(result.code, 0, result.output);
    assert.ok(!result.output.includes(password));
    assert.ok(!result.output.includes(backupPassword));
    assert.equal((await fetch(f.app.listeningOrigin + '/api/status')).status, 200);
    const files = (await readdir(f.directory)).filter((name) => pattern.test(name));
    const regular = [];
    for (const name of files)
      if ((await lstat(path.join(f.directory, name))).isFile()) regular.push(name);
    assert.equal(regular.length, Math.min(2, i + 1));
    latest = regular.sort().at(-1);
  }
  assert.equal(await readFile(unrelated, 'utf8'), '보존');
  assert.ok((await lstat(path.join(f.directory, ownedDir))).isDirectory());
  if (process.platform !== 'win32')
    assert.ok(
      (
        await lstat(
          path.join(
            f.directory,
            'keydesk-scheduled-20000101T000000000Z-' + 'd'.repeat(32) + '.keydesk',
          ),
        )
      ).isSymbolicLink(),
    );
  const encrypted = JSON.parse(await readFile(path.join(f.directory, latest), 'utf8'));
  assert.equal(encrypted.format, 'keydesk-backup');
  await f.app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: f.headers,
    payload: { name: '복원 전 변경' },
  });
  const restore = await f.app.inject({
    method: 'POST',
    url: '/api/backups/restore',
    headers: f.headers,
    payload: { ownerPassword: password, password: backupPassword, backup: encrypted },
  });
  assert.equal(restore.statusCode, 200, restore.body);
  assert.equal(f.app.context.db.prepare('SELECT COUNT(*) AS count FROM projects').get().count, 3);
});
test('실패한 예약 백업은 이전 파일과 관련 없는 파일을 보존하고 누락된 저장소를 만들지 않는다', async (t) => {
  const f = await fixture(t);
  await mkdir(f.directory);
  const old = 'keydesk-scheduled-20000101T000000000Z-' + 'b'.repeat(32) + '.keydesk';
  await writeFile(path.join(f.directory, old), '이전 백업');
  await writeFile(path.join(f.directory, '참고.txt'), '관련 없는 파일');
  await writeFile(
    f.passwordFile,
    JSON.stringify({ ownerPassword: 'wrong-owner-password-2026', password: backupPassword }),
    { mode: 0o600 },
  );
  const before = await readdir(f.directory);
  const failure = await run(
    ['--directory', f.directory, '--keep', '1', '--password-file', f.passwordFile],
    f.env,
  );
  assert.equal(failure.code, 1);
  assert.deepEqual(await readdir(f.directory), before);
  const missing = path.join(f.dir, '없는 데이터');
  const absent = await run(['--directory', f.directory, '--password-file', f.passwordFile], {
    KEYDESK_DATA_DIR: missing,
  });
  assert.equal(absent.code, 1);
  await assert.rejects(lstat(missing));
  for (const keep of ['0', '366', 'abc', '1.5'])
    assert.equal(
      (
        await run(
          ['--directory', f.directory, '--keep', keep, '--password-file', f.passwordFile],
          f.env,
        )
      ).code,
      1,
    );
});

test('생성된 암호문이 손상되면 인증 검증에서 거부하고 이전 백업을 모두 보존한다', async (t) => {
  const f = await fixture(t);
  await mkdir(f.directory);
  const old = 'keydesk-scheduled-20000101T000000000Z-' + 'c'.repeat(32) + '.keydesk';
  await writeFile(path.join(f.directory, old), '이전 백업');
  const config = configuration(f.env);
  await assert.rejects(
    scheduledBackup(
      config,
      { directory: f.directory, passwordFile: f.passwordFile, keep: 1 },
      async (command, options) => {
        await runAdmin(command, options);
        const envelope = JSON.parse(await readFile(options.outputPath, 'utf8'));
        const ciphertext = Buffer.from(envelope.data, 'base64');
        ciphertext[0] ^= 1;
        envelope.data = ciphertext.toString('base64');
        await writeFile(options.outputPath, JSON.stringify(envelope));
      },
    ),
  );
  assert.deepEqual(await readdir(f.directory), [old]);
  assert.equal(await readFile(path.join(f.directory, old), 'utf8'), '이전 백업');
});
test('서버가 중지된 상태에서도 기본 보존 개수로 백업하고 비공개 암호 파일을 검증한다', async (t) => {
  const f = await fixture(t);
  await f.app.close();
  const result = await run(['--directory', f.directory, '--password-file', f.passwordFile], f.env);
  assert.equal(result.code, 0, result.output);
  assert.equal((await readdir(f.directory)).filter((name) => pattern.test(name)).length, 1);
  const before = await readdir(f.directory);
  if (process.platform !== 'win32') {
    await chmod(f.passwordFile, 0o644);
    assert.equal(
      (await run(['--directory', f.directory, '--password-file', f.passwordFile], f.env)).code,
      1,
    );
    await chmod(f.passwordFile, 0o600);
  }
  await writeFile(f.passwordFile, 'x'.repeat(16385));
  assert.equal(
    (await run(['--directory', f.directory, '--password-file', f.passwordFile], f.env)).code,
    1,
  );
  assert.deepEqual(await readdir(f.directory), before);
});
