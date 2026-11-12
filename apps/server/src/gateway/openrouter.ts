import { once } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { GatewayRoute, OpenRouterUsage } from '@keydesk/contracts';
import type { pinDestination, providerRequest } from './transport.ts';
import { jsonObject, parseExactUsd, usdPattern } from './usage.ts';

const ORIGIN = 'https://openrouter.ai';
const amountFields = new Set([
  'usage',
  'usage_daily',
  'usage_weekly',
  'usage_monthly',
  'limit',
  'limit_remaining',
]);
const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const amount = (v: unknown) => (typeof v === 'string' && usdPattern.test(v) ? v : null);

export function openRouterSource(
  route: Pick<GatewayRoute, 'enabled' | 'adapter' | 'baseUrl'>,
): boolean {
  if (!route.enabled || route.adapter !== 'openai' || !URL.canParse(route.baseUrl)) return false;
  const url = new URL(route.baseUrl);
  return (
    url.origin === ORIGIN &&
    ['/api/v1', '/api/v1/'].includes(url.pathname) &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  );
}

export const openRouterKeyUrl = () => new URL('/api/v1/key', ORIGIN);

export async function readOpenRouterUsage(
  request: typeof providerRequest,
  pin: Awaited<ReturnType<typeof pinDestination>>,
  credential: string,
): Promise<Omit<OpenRouterUsage, 'checkedAt'>> {
  const upstream = request(openRouterKeyUrl(), pin, 'GET', {
    authorization: 'Bearer ' + credential,
    accept: 'application/json',
    'accept-encoding': 'identity',
  });
  upstream.on('error', () => {});
  const timeout = setTimeout(() => upstream.destroy(new Error('제공사 조회 시간 초과')), 10000);
  try {
    const pending = once(upstream, 'response');
    upstream.end();
    const [response] = (await pending) as [IncomingMessage];
    if (
      response.statusCode !== 200 ||
      (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
    ) {
      response.destroy();
      throw Error('제공사 조회 응답 오류');
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of response) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 16 * 1024) throw Error('제공사 조회 응답 크기 초과');
      chunks.push(buffer);
    }
    const responseBody = jsonObject(
      parseExactUsd(Buffer.concat(chunks).toString('utf8'), amountFields),
    );
    const data = jsonObject(responseBody?.data);
    if (!data) throw Error('제공사 조회 형식 오류');
    const free = jsonObject(data.free_model_daily_requests);
    const freeRequests = {
      used: count(free?.used),
      max: count(
        typeof free?.limit === 'string' && /^\d+$/.test(free.limit) ? Number(free.limit) : null,
      ),
      remaining: count(free?.remaining),
    };
    const limit = amount(data.limit);
    const reset = data.limit_reset;
    return {
      freeRequests: Object.values(freeRequests).some((value) => value !== null)
        ? freeRequests
        : null,
      usage: amount(data.usage),
      usageDaily: amount(data.usage_daily),
      usageWeekly: amount(data.usage_weekly),
      usageMonthly: amount(data.usage_monthly),
      limit,
      limitStatus: limit !== null ? 'set' : data.limit === null ? 'unset' : 'unknown',
      limitRemaining: amount(data.limit_remaining),
      limitReset: reset === 'daily' || reset === 'weekly' || reset === 'monthly' ? reset : null,
    };
  } finally {
    clearTimeout(timeout);
    upstream.destroy();
  }
}
