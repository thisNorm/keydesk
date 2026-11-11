import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { createApp } from './app.ts';
const host = process.env.KEYDESK_HOST || '127.0.0.1';
const port = Number(process.env.KEYDESK_PORT || 8088);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('KEYDESK_PORT는 1부터 65535 사이의 정수여야 합니다.');
const origin = process.env.KEYDESK_ORIGIN || `http://127.0.0.1:${port}`;
const dataDir = resolve(process.env.KEYDESK_DATA_DIR || '.local/keydesk');
const app = await createApp({ dataDir, origin });
const web = resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
if (existsSync(web)) {
  await app.register(fastifyStatic, { root: web, prefix: '/', maxAge: 0 });
}
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
if (process.send) {
  process.on('message', (message) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'keydesk-stop'
    )
      void shutdown();
  });
  process.on('disconnect', () => void shutdown());
}
await app.listen({ host, port });
console.log(`Keydesk가 ${origin}에서 시작되었습니다.`);
if (existsSync(resolve(dataDir, 'bootstrap-token')))
  console.log('첫 설정에는 데이터 폴더의 bootstrap-token 파일을 사용해 주세요.');
