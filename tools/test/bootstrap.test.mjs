import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from '../lib.mjs';

test('로컬 초기 설정 요청의 비밀번호와 토큰을 리디렉션으로 전달하지 않는다', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), '키 데스크 초기 설정 '));
  let forwarded = 0;
  const recipient = http.createServer((_request, response) => {
    forwarded++;
    response.end('{}');
  });
  await new Promise((resolve) => recipient.listen(0, '127.0.0.1', resolve));
  const redirect = http.createServer((_request, response) => {
    response.writeHead(307, { Location: `http://127.0.0.1:${recipient.address().port}/capture` });
    response.end();
  });
  await new Promise((resolve) => redirect.listen(0, '127.0.0.1', resolve));
  try {
    await writeFile(path.join(dataDir, 'bootstrap-token'), 'fixture-token-that-is-not-secret');
    const env = {
      ...process.env,
      KEYDESK_DATA_DIR: dataDir,
      KEYDESK_PORT: String(redirect.address().port),
    };
    const child = spawn(
      process.execPath,
      [path.join(root, 'tools/manage.mjs'), 'setup', '--owner', '--password-stdin'],
      { env, stdio: ['pipe', 'ignore', 'ignore'] },
    );
    child.stdin.end(JSON.stringify({ name: '검사', newPassword: 'fixture-password-2026' }));
    const code = await new Promise((resolve) => child.once('exit', resolve));
    assert.equal(forwarded, 0);
    assert.equal(code, 1);
  } finally {
    await Promise.all([
      new Promise((resolve) => recipient.close(resolve)),
      new Promise((resolve) => redirect.close(resolve)),
    ]);
    await rm(dataDir, { recursive: true, force: true });
  }
});
