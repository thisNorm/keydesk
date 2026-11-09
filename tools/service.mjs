import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { pause } from './lib.mjs';

const config = JSON.parse(process.env.KEYDESK_SERVICE_CONFIG || '{}');
delete process.env.KEYDESK_SERVICE_CONFIG;
const statePath = path.join(config.dataDir, 'process.json');
const token = randomBytes(32).toString('hex');
const children = [];
let stopping = false;
async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (child.connected) child.send({ type: 'keydesk-stop' }, () => {});
    else child.kill('SIGTERM');
  }
  for (
    let i = 0;
    i < 100 && children.some((c) => c.exitCode === null && c.signalCode === null);
    i++
  )
    await pause(100);
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await rm(statePath, { force: true });
  process.exit(exitCode);
}
const server = net.createServer((socket) => {
  let input = '';
  socket.setTimeout(2000, () => socket.destroy());
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    input += chunk;
    if (input.length > 4096) return socket.destroy();
    if (!input.includes('\n')) return;
    try {
      const message = JSON.parse(input);
      const supplied = Buffer.from(typeof message.token === 'string' ? message.token : '');
      const expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected) ||
        !['status', 'stop'].includes(message.action)
      )
        return socket.end('{"ok":false}');
      socket.end(JSON.stringify({ ok: true, stopping }));
      if (message.action === 'stop') void shutdown();
    } catch {
      socket.end('{"ok":false}');
    }
  });
});
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  for (const command of config.commands) {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        KEYDESK_DATA_DIR: config.dataDir,
        KEYDESK_HOST: config.host,
        KEYDESK_PORT: String(config.port),
        KEYDESK_ORIGIN: config.origin,
      },
      stdio:
        command.gracefulIpc === false
          ? ['ignore', 'inherit', 'inherit']
          : ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    children.push(child);
    child.on('error', () => {
      console.error('Keydesk 하위 프로세스를 시작하지 못했습니다.');
      void shutdown(1);
    });
    child.on('exit', () => {
      if (!stopping) void shutdown(1);
    });
  }
  const state = {
    pid: process.pid,
    controlPort: server.address().port,
    token,
    origin: config.origin,
    host: config.host,
    port: config.port,
  };
  const pending = statePath + '.tmp';
  await writeFile(pending, JSON.stringify(state), { mode: 0o600 });
  await rename(pending, statePath);
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
} catch {
  console.error('Keydesk 실행 관리자를 시작하지 못했습니다. 데이터 경로와 포트 권한을 확인하세요.');
  await shutdown(1);
}
