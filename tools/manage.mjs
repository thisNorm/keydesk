import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import {
  childCommands,
  configuration,
  control,
  parseOptions,
  pause,
  readState,
  ready,
} from './lib.mjs';

async function hidden(prompt) {
  if (!process.stdin.isTTY)
    throw new Error(
      '자동 실행에는 --password-file 또는 --password-stdin으로 비밀번호 JSON을 전달하세요.',
    );
  process.stdout.write(prompt + ': ');
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: sink, terminal: true });
  try {
    return await rl.question('');
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}
async function passwords(command, options) {
  let values;
  if (options.passwordFile || options.passwordStdin) {
    let raw;
    if (options.passwordFile) {
      const file = path.resolve(options.passwordFile);
      const info = await stat(file);
      if (process.platform !== 'win32' && info.mode & 0o077)
        throw new Error(
          '비밀번호 파일은 소유자만 읽을 수 있어야 합니다. chmod 600으로 권한을 제한하세요.',
        );
      if (info.size > 16384) throw new Error('비밀번호 파일이 너무 큽니다.');
      raw = await readFile(file, 'utf8');
    } else {
      raw = '';
      for await (const chunk of process.stdin) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 16384) throw new Error('비밀번호 입력이 너무 큽니다.');
      }
    }
    try {
      values = JSON.parse(raw.replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('비밀번호 입력은 JSON 형식이어야 합니다. 운영 문서를 확인하세요.');
    }
  } else if (command === 'reset-password' || command === 'setup-owner') {
    const newPassword = await hidden('새 소유자 비밀번호');
    if (newPassword !== (await hidden('새 비밀번호 확인')))
      throw new Error('두 비밀번호가 일치하지 않습니다.');
    values = { newPassword };
    if (command === 'setup-owner') {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        values.name = await rl.question('소유자 이름: ');
      } finally {
        rl.close();
      }
    }
  } else {
    const ownerPassword = await hidden('현재 소유자 비밀번호');
    const password = await hidden('백업 암호');
    if (command === 'backup' && password !== (await hidden('백업 암호 확인')))
      throw new Error('두 백업 암호가 일치하지 않습니다.');
    values = { ownerPassword, password };
  }
  const required =
    command === 'setup-owner'
      ? ['name', 'newPassword']
      : command === 'reset-password'
        ? ['newPassword']
        : ['ownerPassword', 'password'];
  if (!values || required.some((key) => typeof values[key] !== 'string' || !values[key]))
    throw new Error('필수 비밀번호 항목이 없습니다. 운영 문서의 JSON 형식을 확인하세요.');
  return Object.fromEntries(required.map((key) => [key, values[key]]));
}
async function ownedState(config) {
  const state = await readState(config);
  if (!state) return null;
  try {
    await control(state, 'status');
    return state;
  } catch {
    try {
      process.kill(state.pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') {
        await rm(path.join(config.dataDir, 'process.json'), { force: true });
        return null;
      }
    }
    throw new Error(
      '실행 관리자의 응답이 없습니다. 다른 프로세스는 중지하지 않았습니다. 운영 문서의 실행 상태 복구 절차를 확인하세요.',
    );
  }
}
async function launch(config, dev) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const lock = path.join(config.dataDir, '.manage-lock');
  try {
    await mkdir(lock);
  } catch {
    throw new Error(
      '다른 실행 명령이 진행 중입니다. 명령이 없으면 운영 문서에서 실행 잠금 복구 절차를 확인하세요.',
    );
  }
  try {
    if (await ownedState(config))
      throw new Error('Keydesk가 이미 실행 중입니다. npm run status로 확인하세요.');
    if (await ready(config))
      throw new Error(
        '지정한 포트에 서버가 이미 응답합니다. 기존 서버를 확인하거나 다른 포트를 사용하세요.',
      );
    if (!dev) {
      try {
        await stat(path.join(config.root, 'apps/web/dist/index.html'));
      } catch {
        throw new Error('화면 빌드가 없습니다. npm run build를 먼저 실행하세요.');
      }
    }
    const log = await open(path.join(config.dataDir, 'server.log'), 'a', 0o600);
    let child;
    try {
      child = spawn(process.execPath, [path.join(config.root, 'tools/service.mjs')], {
        cwd: config.root,
        shell: false,
        detached: !dev,
        windowsHide: true,
        env: {
          ...process.env,
          KEYDESK_SERVICE_CONFIG: JSON.stringify({
            ...config,
            commands: childCommands(config, dev),
          }),
        },
        stdio: dev ? ['ignore', 'inherit', 'inherit'] : ['ignore', log.fd, log.fd],
      });
      child.on('error', () => {});
      if (!dev) child.unref();
    } finally {
      await log.close();
    }
    let running;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      const state = await readState(config);
      if (state && (await ready(config))) {
        await control(state, 'status');
        running = state;
        break;
      }
      await pause(100);
    }
    if (!running) {
      const state = await readState(config);
      if (state) {
        try {
          await control(state, 'stop');
        } catch {}
      }
      throw new Error(
        '서버 준비에 실패했습니다. 데이터 디렉터리의 server.log와 포트 사용 상태를 확인하세요.',
      );
    }
    console.log(`Keydesk 실행 준비 완료: ${config.origin}`);
    if (dev) {
      const stop = () => {
        void control(running, 'stop').catch(() => {});
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      child.once('exit', (code) => {
        process.exitCode = code ?? 1;
      });
    }
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 26)
    throw new Error('Node.js 26 이상이 필요합니다. 권장 버전은 .nvmrc를 확인하세요.');
  const [command = 'status', ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  const config = configuration(
    command === 'dev' && !process.env.KEYDESK_ORIGIN
      ? { ...process.env, KEYDESK_ORIGIN: 'http://127.0.0.1:5173' }
      : process.env,
  );
  if (command === 'setup' && options.owner) {
    const secrets = await passwords('setup-owner', options);
    const token = (await readFile(path.join(config.dataDir, 'bootstrap-token'), 'utf8')).trim();
    const response = await fetch(`http://127.0.0.1:${config.port}/api/auth/setup`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Origin: config.origin },
      body: JSON.stringify({ token, name: secrets.name, password: secrets.newPassword }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        '초기 소유자 설정에 실패했습니다. 실행 상태, 초기 설정 여부와 12자 이상의 비밀번호를 확인하세요.',
      );
    console.log('소유자 설정이 완료되었습니다. 브라우저에서 로그인하세요.');
    return;
  }
  if (command === 'setup') {
    const { createApp } = await import(
      pathToFileURL(path.join(config.root, 'apps/server/src/app.ts')).href
    );
    const app = await createApp({
      dataDir: config.dataDir,
      origin: config.origin,
      backgroundJobs: false,
    });
    await app.close();
    console.log(
      '초기 저장소 준비 완료. 첫 실행이면 데이터 디렉터리의 bootstrap-token 파일을 직접 확인하고 설정 화면에 입력하세요.',
    );
    return;
  }
  if (command === 'start' || command === 'dev') return launch(config, command === 'dev');
  if (command === 'status') {
    const state = await ownedState(config);
    const healthy = state ? await ready({ ...config, ...state }) : false;
    console.log(
      healthy
        ? `Keydesk 준비 완료: ${state.origin}`
        : 'Keydesk가 실행 중이 아니거나 준비되지 않았습니다.',
    );
    if (!healthy) process.exitCode = 1;
    return;
  }
  if (command === 'stop') {
    const state = await ownedState(config);
    if (!state) {
      console.log('관리 중인 Keydesk 프로세스가 없습니다.');
      return;
    }
    await control(state, 'stop');
    for (let i = 0; i < 150; i++) {
      if (!(await readState(config))) {
        console.log('Keydesk를 중지했습니다.');
        return;
      }
      await pause(100);
    }
    throw new Error(
      '중지 완료를 확인하지 못했습니다. 다른 프로세스에는 종료 신호를 보내지 않았습니다.',
    );
  }
  if (['backup', 'restore', 'reset-password'].includes(command)) {
    if (await ownedState(config))
      throw new Error(
        '로컬 관리 작업 전 npm run stop으로 서버를 중지하세요. 실행 중에는 화면의 백업 기능을 사용할 수 있습니다.',
      );
    if (command === 'backup' && !options.output)
      throw new Error('--output으로 백업 파일을 지정하세요.');
    if (command === 'restore' && !options.input)
      throw new Error('--input으로 복원 파일을 지정하세요.');
    const secrets = await passwords(command, options);
    const { runAdmin } = await import(
      pathToFileURL(path.join(config.root, 'apps/server/src/cli.ts')).href
    );
    await runAdmin(command, {
      dataDir: config.dataDir,
      origin: config.origin,
      inputPath: options.input && path.resolve(options.input),
      outputPath: options.output && path.resolve(options.output),
      ...secrets,
    });
    console.log(
      command === 'backup'
        ? '암호화 백업을 저장했습니다.'
        : command === 'restore'
          ? '복원이 완료되었습니다. 다시 로그인하세요.'
          : '소유자 비밀번호를 재설정했습니다. 다시 로그인하세요.',
    );
    return;
  }
  throw new Error(
    '지원하지 않는 명령입니다. setup, dev, start, stop, status, backup, restore, reset-password를 사용하세요.',
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error && /[가-힣]/.test(error.message)
      ? error.message
      : '작업에 실패했습니다. 입력 파일, 데이터 경로 권한과 실행 상태를 확인하세요.',
  );
  process.exitCode = 1;
});
