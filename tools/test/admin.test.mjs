import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { root, pause, ready } from '../lib.mjs';

test(
  '실제 소스 서버를 초기화하고 stdin 암호로 백업·복원·재설정한다',
  { timeout: 30000 },
  async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), '키 데스크 관리 '));
    const socket = net.createServer();
    await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    const env = {
      ...process.env,
      KEYDESK_DATA_DIR: dataDir,
      KEYDESK_PORT: String(port),
      KEYDESK_HOST: '127.0.0.1',
      KEYDESK_ORIGIN: `http://127.0.0.1:${port}`,
    };
    async function run(args, input) {
      const child = spawn(process.execPath, [path.join(root, 'tools/manage.mjs'), ...args], {
        cwd: root,
        env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.stdin.end(input ? JSON.stringify(input) : '');
      const code = await new Promise((resolve) => child.once('exit', resolve));
      return { code, output };
    }
    let server;
    try {
      const setup = await run(['setup']);
      assert.equal(setup.code, 0, setup.output);
      const token = (await readFile(path.join(dataDir, 'bootstrap-token'), 'utf8')).trim();
      assert.ok(!setup.output.includes(token));
      server = spawn(process.execPath, [path.join(root, 'apps/server/src/main.ts')], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let errors = '';
      server.stderr.on('data', (chunk) => {
        errors += chunk;
      });
      for (let i = 0; i < 100 && !(await ready({ host: '127.0.0.1', port })); i++) await pause(50);
      assert.equal(await ready({ host: '127.0.0.1', port }), true, errors);
      const owner = { name: '운영 검사', newPassword: 'owner-test-password-2026' };
      const initialized = await run(['setup', '--owner', '--password-stdin'], owner);
      assert.equal(initialized.code, 0, initialized.output);
      assert.ok(!initialized.output.includes(owner.newPassword));
      assert.ok(!initialized.output.includes(token));
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.send({ type: 'keydesk-stop' });
      await exited;
      const backup = path.join(dataDir, '한글 백업.keydesk');
      const secrets = { ownerPassword: owner.newPassword, password: 'backup-test-password-2026' };
      const saved = await run(['backup', '--output', backup, '--password-stdin'], secrets);
      assert.equal(saved.code, 0, saved.output);
      const restored = await run(['restore', '--input', backup, '--password-stdin'], secrets);
      assert.equal(restored.code, 0, restored.output);
      const reset = await run(['reset-password', '--password-stdin'], {
        newPassword: 'new-owner-password-2026',
      });
      assert.equal(reset.code, 0, reset.output);
    } finally {
      if (server?.exitCode === null) server.kill();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);
