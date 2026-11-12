import { z } from 'zod';
import { ambiguousOperations, validOperationPath } from './operations.ts';
import { openRouterSource } from './openrouter.ts';
const id = z.string().min(1).max(128);
const method = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const adapter = z.enum(['generic', 'openai', 'anthropic', 'gemini']);
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
const authBindingSchema = z
  .object({
    credentialId: id,
    location: z.enum(['header', 'query']),
    name: z.string().min(1).max(64),
    prefix: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9._-]{0,31}$/)
      .optional(),
  })
  .strict()
  .superRefine((binding, ctx) => {
    if (
      binding.location === 'header'
        ? !allowedAuthHeader(binding.name)
        : !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(binding.name)
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '인증 필드 이름이 올바르지 않습니다.' });
    if (binding.location === 'query' && binding.prefix !== undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '쿼리 인증에는 접두어를 사용할 수 없습니다.',
      });
  });
export const routeSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    projectId: id,
    credentialId: id,
    baseUrl: z.string().max(2048).url(),
    allowedMethods: z.array(method).min(1).max(7),
    adapter,
    enabled: z.boolean(),
    allowPrivateNetwork: z.boolean(),
    authHeader: z.string().min(1).max(64).refine(allowedAuthHeader).optional(),
    authScheme: z.enum(['bearer', 'raw']).optional(),
    authBindings: z.array(authBindingSchema).min(1).max(8).optional(),
    detectJsonError: z.boolean().optional(),
    mailBudget: z
      .object({
        amount: z
          .string()
          .regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/)
          .refine((value) => Number(value) > 0),
        currency: z.string().regex(/^[A-Z]{3}$/),
        basis: z.enum(['reported', 'estimate']),
      })
      .strict()
      .nullable()
      .optional(),
    operationRules: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            method,
            path: z.string().max(240).refine(validOperationPath),
          })
          .strict(),
      )
      .max(24)
      .optional(),
  })
  .superRefine((route, ctx) => {
    const budget = route.mailBudget;
    if (
      budget &&
      (budget.basis === 'reported'
        ? budget.currency !== 'USD' || !openRouterSource({ ...route, enabled: true })
        : !['openai', 'anthropic'].includes(route.adapter))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '경로에서 확인할 수 있는 비용 근거를 선택해 주세요.',
      });
    if (
      route.operationRules?.length &&
      (route.adapter !== 'generic' ||
        route.operationRules.some((rule) => !route.allowedMethods.includes(rule.method)) ||
        ambiguousOperations(route.operationRules))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'API 기능의 메서드와 경로가 중복되거나 허용되지 않습니다.',
      });
    if (route.authBindings) {
      if (
        route.authBindings.some((binding) => binding.location === 'query') &&
        URL.canParse(route.baseUrl) &&
        new URL(route.baseUrl).protocol !== 'https:'
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '쿼리 인증에는 HTTPS 목적지가 필요합니다.',
        });
      const names = route.authBindings.map(
        (binding) => binding.location + ':' + binding.name.toLowerCase(),
      );
      if (
        route.adapter !== 'generic' ||
        route.authBindings[0]?.credentialId !== route.credentialId ||
        new Set(names).size !== names.length
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '인증 필드의 제공사·대표 인증값·중복을 확인해 주세요.',
        });
    }
    if (route.adapter === 'generic') return;
    if (route.detectJsonError !== undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JSON 오류 기록은 일반 REST 경로에서만 설정할 수 있습니다.',
      });
    const header =
      route.adapter === 'gemini'
        ? 'x-goog-api-key'
        : route.adapter === 'anthropic'
          ? 'x-api-key'
          : 'authorization';
    const scheme = route.adapter === 'openai' ? 'bearer' : 'raw';
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
