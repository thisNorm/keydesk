import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function configuration(env = process.env, projectRoot = root) {
  const port = Number(env.KEYDESK_PORT ?? 8088);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('포트는 1~65535 사이의 정수여야 합니다.');
  const host = env.KEYDESK_HOST || '127.0.0.1';
  const origin = env.KEYDESK_ORIGIN || `http://127.0.0.1:${port}`;
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
    throw new Error('KEYDESK_ORIGIN에는 경로 없는 웹 주소를 입력하세요.');
  return {
    root: projectRoot,
    dataDir: path.resolve(env.KEYDESK_DATA_DIR || path.join(projectRoot, '.local', 'keydesk')),
    host,
    port,
    origin,
  };
}
export function childCommands(config, dev = false) {
  const commands = [
    {
      command: process.execPath,
      args: [path.join(config.root, 'apps/server/src/main.ts')],
      cwd: config.root,
      shell: false,
    },
  ];
  if (dev)
    commands.push({
      command: process.execPath,
      args: [
        path.join(config.root, 'node_modules/vite/bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--strictPort',
      ],
      cwd: path.join(config.root, 'apps/web'),
      shell: false,
      gracefulIpc: false,
    });
  return commands;
}
export function parseOptions(args) {
  const options = {};
  const names = { '--input': 'input', '--output': 'output', '--password-file': 'passwordFile' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--owner') {
      options.owner = true;
      continue;
    }
    if (args[i] === '--password-stdin') {
      options.passwordStdin = true;
      continue;
    }
    const name = names[args[i]];
    if (!name || !args[i + 1] || args[i + 1].startsWith('--') || options[name])
      throw new Error(
        '옵션을 확인하세요. --input, --output, --password-file, --password-stdin을 사용할 수 있습니다. 비밀번호를 명령 인수로 넣지 마세요.',
      );
    options[name] = args[++i];
  }
  if (options.passwordFile && options.passwordStdin)
    throw new Error('비밀번호 입력 방식은 하나만 선택하세요.');
  return options;
}
export async function collectTests(projectRoot = root) {
  const found = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.test\.(?:mjs|js|ts)$/.test(entry.name)) found.push(file);
    }
  }
  for (const dir of ['apps/server/test', 'apps/web/test', 'tools/test'])
    await visit(path.join(projectRoot, dir));
  return found;
}
export async function readState(config) {
  try {
    return JSON.parse(await readFile(path.join(config.dataDir, 'process.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('실행 상태 파일을 읽을 수 없습니다. 데이터 디렉터리 권한을 확인하세요.');
  }
}
export function control(state, action) {
  return new Promise((resolve, reject) => {
    if (!state || !Number.isInteger(state.controlPort) || typeof state.token !== 'string')
      return reject(new Error('실행 중인 Keydesk를 확인할 수 없습니다.'));
    const socket = net.connect({ host: '127.0.0.1', port: state.controlPort });
    let buffer = '';
    socket.setTimeout(2500, () =>
      socket.destroy(new Error('실행 상태 확인 시간이 초과되었습니다.')),
    );
    socket.on('connect', () => socket.write(JSON.stringify({ token: state.token, action }) + '\n'));
    socket.on('data', (data) => {
      buffer += data;
      if (buffer.length > 4096) socket.destroy(new Error('잘못된 실행 상태 응답입니다.'));
    });
    socket.on('end', () => {
      try {
        const result = JSON.parse(buffer);
        if (!result.ok) throw new Error('실행 제어가 거부되었습니다.');
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    socket.on('error', reject);
  });
}
export async function ready(config) {
  try {
    const host = config.host === '0.0.0.0' || config.host === '::' ? '127.0.0.1' : config.host;
    const url = `http://${host.includes(':') ? `[${host}]` : host}:${config.port}/api/status`;
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).status === 'ok';
  } catch {
    return false;
  }
}
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
