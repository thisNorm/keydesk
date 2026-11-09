import { z } from 'zod';
const id = z.string().min(1).max(128);
const date = z
  .string()
  .max(40)
  .refine(
    (v) =>
      v === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v + 'T00:00:00Z')) &&
        new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v) ||
      z
        .string()
        .datetime({
          offset: true,
        })
        .safeParse(v).success,
  );
const limit = z.number().int().min(0).max(1000000000).nullable();
const forbiddenHeaders = new Set([
  'host',
  'connection',
  'cookie',
  'set-cookie',
  'content-length',
  'content-type',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'keep-alive',
  'forwarded',
  'accept-encoding',
]);
export function allowedAuthHeader(value: string): boolean {
  const header = value.toLowerCase();
  return (
    value.length <= 64 &&
    /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value) &&
    !forbiddenHeaders.has(header) &&
    !header.startsWith('proxy-auth') &&
    !header.startsWith('x-forwarded-')
  );
}
export const routeSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    projectId: id,
    credentialId: id,
    baseUrl: z.string().max(2048).url(),
    allowedMethods: z
      .array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']))
      .min(1)
      .max(7),
    adapter: z.enum(['generic', 'openai', 'anthropic']),
    enabled: z.boolean(),
    allowPrivateNetwork: z.boolean(),
    authHeader: z.string().min(1).max(64).refine(allowedAuthHeader).optional(),
    authScheme: z.enum(['bearer', 'raw']).optional(),
  })
  .superRefine((route, ctx) => {
    if (route.adapter === 'generic') return;
    const header = route.adapter === 'anthropic' ? 'x-api-key' : 'authorization';
    const scheme = route.adapter === 'anthropic' ? 'raw' : 'bearer';
    if (
      (route.authHeader !== undefined && route.authHeader.toLowerCase() !== header) ||
      (route.authScheme !== undefined && route.authScheme !== scheme)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '제공사 전용 경로의 인증 헤더는 자동 설정됩니다.',
      });
  });
export const clientSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    projectId: id,
    routeIds: z.array(id).min(1).max(100),
    expiresAt: date.default(''),
    dailyRequestLimit: limit.default(null),
    dailyTokenAlert: limit.default(null),
    dailyCostAlertMicros: limit.default(null),
  })
  .strict();
export const clientUpdate = z
  .object({
    revoked: z.boolean().optional(),
    dailyRequestLimit: limit.optional(),
    dailyTokenAlert: limit.optional(),
    dailyCostAlertMicros: limit.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,9})?$/);
export const priceSchema = z
  .object({
    adapter: z.enum(['generic', 'openai', 'anthropic']),
    model: z.string().min(1).max(200),
    currency: z.string().regex(/^[A-Z]{3}$/),
    inputPerMillion: decimal,
    outputPerMillion: decimal,
    cachedInputPerMillion: decimal,
    startsAt: z.string().datetime({
      offset: true,
    }),
  })
  .strict();
export function bad(message = '입력값을 확인해 주세요.', statusCode = 400): never {
  throw Object.assign(new Error(message), {
    statusCode,
  });
}
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) bad();
  return parsed.data;
}
export function localDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((k) => parts.find((p) => p.type === k)!.value).join('-');
}
export function expired(value: string, now: Date, zone: string): boolean {
  return (
    value !== '' &&
    (value.length === 10 ? value < localDay(now, zone) : Date.parse(value) <= now.getTime())
  );
}
