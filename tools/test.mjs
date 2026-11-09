import { spawn } from 'node:child_process';
import { collectTests, root } from './lib.mjs';
const files = await collectTests();
if (!files.length) throw new Error('실행할 제품 테스트가 없습니다.');
const child = spawn(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});
child.on('error', () => {
  console.error('테스트 프로세스를 시작하지 못했습니다.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
