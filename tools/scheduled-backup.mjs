import { constants } from 'node:fs';
import { open, mkdir, lstat, readdir, readFile, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { configuration } from './lib.mjs';
import { derive, decrypt } from '../apps/server/src/crypto.ts';

const ownName = /^keydesk-scheduled-\d{8}T\d{9}Z-[a-f0-9]{32}\.keydesk$/;
const maxBackupBytes = 24 * 1024 * 1024;
function options(args) {
  const parsed = { keep: 7 };
  const names = { '--directory': 'directory', '--keep': 'keep', '--password-file': 'passwordFile' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const name = names[args[i]];
    if (!name || seen.has(name) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error(
        '예약 백업 옵션을 확인하세요. --directory, --keep, --password-file을 사용하세요.',
      );
    seen.add(name);
    parsed[name] = args[++i];
  }
  if (!parsed.directory || !parsed.passwordFile)
    throw new Error('예약 백업에는 --directory와 --password-file이 필요합니다.');
  if (!/^\d+$/.test(String(parsed.keep)) || Number(parsed.keep) < 1 || Number(parsed.keep) > 365)
    throw new Error('예약 백업 보존 개수는 1~365 사이의 정수여야 합니다.');
  return {
    directory: path.resolve(parsed.directory),
    passwordFile: path.resolve(parsed.passwordFile),
    keep: Number(parsed.keep),
  };
}
async function windowsPrivate(file) {
  const script =
    "$ErrorActionPreference='Stop'; $acl=Get-Acl -LiteralPath $env:KEYDESK_ACL_FILE; $own=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; foreach($rule in $acl.Access){if($rule.AccessControlType -eq 'Allow' -and (([int64]$rule.FileSystemRights -band 1) -ne 0)){ $sid=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if($sid -ne $own -and $sid -ne 'S-1-5-18' -and $sid -ne 'S-1-5-32-544'){exit 1}}}; exit 0";
  try {
    await promisify(execFile)(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 10000, env: { ...process.env, KEYDESK_ACL_FILE: file } },
    );
  } catch {
    throw new Error(
      '예약 백업 비밀번호 파일의 Windows 읽기 권한을 현재 계정과 시스템 관리자로 제한하세요.',
    );
  }
}
async function secrets(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('예약 백업 비밀번호는 일반 파일이어야 합니다.');
  if (info.size > 16384 || (process.platform !== 'win32' && info.mode & 0o077))
    throw new Error('예약 백업 비밀번호 파일은 16KB 이하이며 소유자만 읽을 수 있어야 합니다.');
  if (process.platform === 'win32') await windowsPrivate(file);
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let raw;
  try {
    const current = await handle.stat();
    if (
      !current.isFile() ||
      current.size > 16384 ||
      (process.platform !== 'win32' && current.mode & 0o077)
    )
      throw new Error('예약 백업 비밀번호 파일의 형식이나 권한을 확인하세요.');
    const bytes = Buffer.alloc(16385);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 16384) throw new Error('예약 백업 비밀번호 파일이 너무 큽니다.');
    raw = bytes
      .subarray(0, bytesRead)
      .toString('utf8')
      .replace(/^\uFEFF/, '');
  } finally {
    await handle.close();
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('예약 백업 비밀번호 파일은 UTF-8 JSON 형식이어야 합니다.');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ['password', 'ownerPassword'].some(
      (key) => typeof value[key] !== 'string' || value[key].length < 12 || value[key].length > 256,
    )
  )
    throw new Error('예약 백업 JSON에는 12~256자의 password와 ownerPassword가 필요합니다.');
  return { password: value.password, ownerPassword: value.ownerPassword };
}
async function verified(file, password, authenticate = true) {
  const info = await lstat(file);
  if (!info.isFile() || info.size === 0 || info.size > maxBackupBytes)
    throw new Error('예약 백업 파일의 크기나 형식을 확인할 수 없습니다.');
  const bytes = await readFile(file);
  if (bytes.length > maxBackupBytes) throw new Error('예약 백업 파일이 너무 큽니다.');
  const backup = JSON.parse(bytes.toString('utf8'));
  if (
    backup.format !== 'keydesk-backup' ||
    backup.version !== 1 ||
    backup.kdf !== 'scrypt-131072-8-1' ||
    !['salt', 'iv', 'tag', 'data'].every(
      (key) => typeof backup[key] === 'string' && backup[key].length > 0,
    )
  )
    throw new Error('예약 백업 결과를 확인하지 못했습니다. 이전 백업은 정리하지 않았습니다.');
  for (const [field, size] of [
    ['salt', 16],
    ['iv', 12],
    ['tag', 16],
  ]) {
    const decoded = Buffer.from(backup[field], 'base64');
    if (decoded.length !== size || decoded.toString('base64') !== backup[field])
      throw new Error('예약 백업의 암호화 형식이 올바르지 않습니다.');
  }
  if (Buffer.from(backup.data, 'base64').toString('base64') !== backup.data)
    throw new Error('예약 백업의 암호화 데이터 형식이 올바르지 않습니다.');
  if (authenticate) {
    const key = await derive(password, Buffer.from(backup.salt, 'base64'));
    try {
      const plaintext = decrypt(bytes.toString('utf8'), key, 'keydesk-backup:1');
      if (Buffer.byteLength(plaintext) > 16 * 1024 * 1024)
        throw new Error('예약 백업 내용이 너무 큽니다.');
      const logical = JSON.parse(plaintext);
      if (
        logical.schemaVersion !== 1 ||
        !logical.tables ||
        typeof logical.tables !== 'object' ||
        Array.isArray(logical.tables)
      )
        throw new Error('예약 백업 내용의 형식이 올바르지 않습니다.');
    } finally {
      key.fill(0);
    }
  }
  return bytes;
}
export async function scheduledBackup(config, parsed, writeBackup) {
  for (const name of ['keydesk.sqlite', 'root-key']) {
    const info = await lstat(path.join(config.dataDir, name));
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('예약 백업에는 기존 데이터베이스와 루트 키 일반 파일이 필요합니다.');
  }
  const password = await secrets(parsed.passwordFile);
  await mkdir(parsed.directory, { recursive: true, mode: 0o700 });
  const lock = path.join(parsed.directory, '.keydesk-scheduled.lock');
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    throw new Error(
      '예약 백업이 이미 진행 중이거나 백업 잠금이 남아 있습니다. 실행 상태를 확인하세요.',
    );
  }
  let published;
  let complete = false;
  try {
    const { runAdmin } = await import(
      pathToFileURL(path.join(config.root, 'apps/server/src/cli.ts')).href
    );
    const backupWriter = writeBackup ?? runAdmin;
    const candidate = path.join(lock, 'candidate.keydesk');
    await backupWriter('backup', {
      dataDir: config.dataDir,
      origin: config.origin,
      outputPath: candidate,
      ...password,
    });
    const bytes = await verified(candidate, password.password);
    const stamp = new Date().toISOString().replace(/[-:.]/g, '');
    const name = `keydesk-scheduled-${stamp}-${randomBytes(16).toString('hex')}.keydesk`;
    const destination = path.join(parsed.directory, name);
    const output = await open(destination, 'wx', 0o600);
    published = destination;
    try {
      await output.writeFile(bytes);
      await output.sync();
    } finally {
      await output.close();
    }
    const readBack = await verified(destination, password.password, false);
    if (!readBack.equals(bytes)) throw new Error('예약 백업의 저장 결과가 일치하지 않습니다.');
    complete = true;
    try {
      const previous = [];
      for (const entry of await readdir(parsed.directory, { withFileTypes: true })) {
        if (!ownName.test(entry.name) || entry.name === name || !entry.isFile()) continue;
        const file = path.join(parsed.directory, entry.name);
        if (file === parsed.passwordFile) continue;
        const info = await lstat(file);
        if (info.isFile() && !info.isSymbolicLink()) previous.push(entry.name);
      }
      previous.sort().reverse();
      for (const old of previous.slice(parsed.keep - 1))
        await unlink(path.join(parsed.directory, old));
    } catch {
      console.error(
        '예약 백업은 저장했지만 보존 개수 정리에 실패했습니다. 이전 파일의 권한을 확인하세요.',
      );
    }
    console.log(`예약 암호화 백업을 저장했습니다. 보존 개수 설정: ${parsed.keep}`);
  } finally {
    if (published && !complete) await rm(published, { force: true });
    try {
      await rm(lock, { recursive: true, force: true });
    } catch {
      if (!complete) throw new Error('예약 백업 임시 파일을 정리하지 못했습니다.');
      console.error('예약 백업은 저장했지만 임시 잠금을 정리하지 못했습니다.');
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  Promise.resolve()
    .then(() => scheduledBackup(configuration(), options(process.argv.slice(2))))
    .catch(() => {
      console.error(
        '예약 백업에 실패했습니다. 기존 저장소·루트 키, 비밀번호 파일 권한·형식, 보존 개수와 백업 폴더를 확인하세요.',
      );
      process.exitCode = 1;
    });
}
