import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scrypt,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString('base64')}:${(await derive(password, salt)).toString('base64')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const result = await derive(password, Buffer.from(salt, 'base64'));
  const bytes = Buffer.from(expected, 'base64');
  return result.length === bytes.length && timingSafeEqual(result, bytes);
}
export function encrypt(value: string, key: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  });
}
export function decrypt(value: string, key: Buffer, aad: string) {
  const parsed = JSON.parse(value);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
