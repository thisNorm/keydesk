import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
test('main serves built SPA fallback and API while handling supervised shutdown', async (t) => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  try {
    await access(join(root, 'apps/web/dist/index.html'));
  } catch {
    t.skip('웹 빌드 후 실행하는 통합 검사');
    return;
  }
  const reserve = createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = (reserve.address() as any).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const dataDir = await mkdtemp(join(tmpdir(), 'keydesk-main-'));
  const child = spawn(process.execPath, ['apps/server/src/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      KEYDESK_DATA_DIR: dataDir,
      KEYDESK_PORT: String(port),
      KEYDESK_ORIGIN: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  let output = '';
  let errors = '';
  child.stdout!.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr!.on('data', (chunk) => {
    errors += chunk;
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('서버 시작 시간 초과')), 10000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`서버 종료 ${code}: ${errors}`));
    });
    child.stdout!.on('data', () => {
      if (output.includes('시작되었습니다')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const spa = await fetch(`http://127.0.0.1:${port}/settings`);
  assert.equal(spa.status, 200);
  assert.match(spa.headers.get('content-type') || '', /text\/html/);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/auth/state`)).json(), {
    initialized: false,
    authenticated: false,
  });
  const exit = once(child, 'exit');
  child.send({ type: 'keydesk-stop' });
  assert.equal((await exit)[0], 0);
  assert.equal(output.includes('bootstrap-token:'), false);
});
