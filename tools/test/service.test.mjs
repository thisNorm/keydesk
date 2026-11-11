import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { control, pause, readState } from '../lib.mjs';

test('개인 제어 토큰을 확인하고 자신이 시작한 자식만 중지한다', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), '키 데스크 실행 '));
  const fixture = path.join(dataDir, '한글 서버.mjs');
  await writeFile(
    fixture,
    "process.on('message', m => { if (m.type === 'keydesk-stop') process.exit(0); }); setInterval(() => {}, 1000);",
  );
  const config = {
    dataDir,
    commands: [{ command: process.execPath, args: [fixture], cwd: dataDir, shell: false }],
  };
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../service.mjs', import.meta.url))],
    {
      env: { ...process.env, KEYDESK_SERVICE_CONFIG: JSON.stringify(config) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let errors = '';
  child.stderr.on('data', (d) => {
    errors += d;
  });
  try {
    let state;
    for (let i = 0; i < 80; i++) {
      state = await readState(config);
      if (state) break;
      await pause(50);
    }
    assert.ok(state, errors);
    await assert.rejects(control({ ...state, token: '틀린 토큰' }, 'stop'));
    assert.equal((await control(state, 'status')).ok, true);
    const exited = new Promise((resolve) => child.once('exit', resolve));
    assert.equal((await control(state, 'stop')).ok, true);
    assert.equal(await Promise.race([exited, pause(5000).then(() => 'timeout')]), 0);
    assert.equal(await readState(config), null);
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
});
