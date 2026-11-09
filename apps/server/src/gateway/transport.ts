import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';
import ipaddr from 'ipaddr.js';
import { bad } from './validation.ts';
export const MAX_REQUEST = 2 * 1024 * 1024;
export const MAX_RESPONSE = 32 * 1024 * 1024;
export function validateBase(value: string, privateAllowed: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    bad('목적지 주소가 올바르지 않습니다.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !privateAllowed)
  )
    bad('HTTPS 목적지를 입력해 주세요.');
  safeSegments(url.pathname);
  return url;
}
function safeSegments(value: string): void {
  let decoded = value;
  for (let i = 0; i < 5; i++) {
    if (
      /[\\\u0000-\u001f\u007f]/.test(decoded) ||
      decoded.split('/').some((p) => p === '.' || p === '..') ||
      decoded.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded)
    )
      bad('허용되지 않는 요청 경로입니다.');
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      bad('요청 경로 인코딩이 올바르지 않습니다.');
    }
    if (next === decoded) return;
    decoded = next;
  }
  bad('요청 경로 인코딩이 올바르지 않습니다.');
}
export function targetUrl(base: string, path: string, privateAllowed: boolean): URL {
  const url = validateBase(base, privateAllowed);
  const split = path.indexOf('?');
  const suffix = split === -1 ? path : path.slice(0, split);
  safeSegments(suffix);
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + suffix;
  url.search = split === -1 ? '' : path.slice(split);
  return url;
}
export function publicAddress(address: string): boolean {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
async function resolveWithDeadline(hostname: string): Promise<
  {
    address: string;
    family: number;
  }[]
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(hostname, {
        all: true,
        verbatim: true,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('DNS 응답 시간이 초과되었습니다.')), 5000);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function pinDestination(
  url: URL,
  privateAllowed: boolean,
): Promise<{
  address: string;
  family: number;
}> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const answers = isIP(hostname)
    ? [
        {
          address: hostname,
          family: isIP(hostname),
        },
      ]
    : await resolveWithDeadline(hostname);
  if (!answers.length || (!privateAllowed && answers.some((a) => !publicAddress(a.address))))
    bad('허용되지 않는 네트워크 목적지입니다.', 502);
  return answers[0]!;
}
export function providerRequest(
  url: URL,
  pin: {
    address: string;
    family: number;
  },
  method: string,
  headers: http.OutgoingHttpHeaders,
): http.ClientRequest {
  const request = (url.protocol === 'https:' ? https : http).request(url, {
    method,
    headers,
    agent: false,
    lookup: ((_host: unknown, opts: any, cb: any) => {
      if (opts?.all) cb(null, [pin]);
      else cb(null, pin.address, pin.family);
    }) as any,
  });
  request.setTimeout(15000, () =>
    request.destroy(new Error('제공사 응답 대기 시간이 초과되었습니다.')),
  );
  return request;
}
