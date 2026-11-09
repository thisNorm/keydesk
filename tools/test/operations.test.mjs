import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseOptions, configuration, childCommands, collectTests } from '../lib.mjs';

test('한글과 공백 경로를 셸 없이 자식 인수로 유지한다', () => {
  const project = path.join(tmpdir(), '키 데스크');
  const data = path.join(tmpdir(), '내 보관함');
  const config = configuration({ KEYDESK_DATA_DIR: data, KEYDESK_PORT: '8123' }, project);
  assert.equal(config.dataDir, data);
  const [api, web] = childCommands(config, true);
  assert.equal(api.command, process.execPath);
  assert.deepEqual(api.args, [path.join(project, 'apps/server/src/main.ts')]);
  assert.equal(web.args[0], path.join(project, 'node_modules/vite/bin/vite.js'));
  assert.equal(api.shell, false);
});

test('잘못된 포트와 알 수 없는 옵션 및 비밀 인수를 거부한다', () => {
  for (const port of ['0', '65536', 'abc', '1.5'])
    assert.throws(() => configuration({ KEYDESK_PORT: port }));
  assert.throws(() => parseOptions(['--password', '평문']));
  assert.deepEqual(parseOptions(['--output', '내 백업.keydesk', '--password-stdin']), {
    output: '내 백업.keydesk',
    passwordStdin: true,
  });
});

test('테스트 검색은 지정된 새 제품 디렉터리만 포함한다', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), '키 데스크 테스트 '));
  try {
    for (const file of [
      'apps/server/test/a.test.ts',
      'apps/web/test/b.test.mjs',
      'tools/test/c.test.mjs',
      'backend/test/old.test.ts',
      'tools/test/fixture.mjs',
    ]) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), '');
    }
    const files = await collectTests(dir);
    assert.deepEqual(files.map((f) => path.relative(dir, f).replaceAll('\\', '/')).sort(), [
      'apps/server/test/a.test.ts',
      'apps/web/test/b.test.mjs',
      'tools/test/c.test.mjs',
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('컨테이너 내부 소유자 설정 옵션을 허용한다', () => {
  assert.deepEqual(parseOptions(['--owner', '--password-stdin']), {
    owner: true,
    passwordStdin: true,
  });
});
