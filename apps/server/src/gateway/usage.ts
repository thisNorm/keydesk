import type { Adapter, ModelPrice } from '@keydesk/contracts';
const token = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1e12;
const MAX_GENERIC_JSON_BYTES = 64 * 1024;
const USD_DECIMALS = 24;
const USD_SCALE = 10n ** BigInt(USD_DECIMALS);
const costField = new Set(['cost']);
export const usdPattern = /^\d{1,16}(?:\.\d{1,24})?$/;

export function usdUnits(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * USD_SCALE + BigInt(fraction.padEnd(USD_DECIMALS, '0'));
}

export function formatUsd(value: bigint): string {
  const fraction = (value % USD_SCALE).toString().padStart(USD_DECIMALS, '0').replace(/0+$/, '');
  return (value / USD_SCALE).toString() + (fraction ? '.' + fraction : '');
}

function exactUsd(source: string | undefined): string | null {
  const parts =
    source?.length && source.length <= 80
      ? /^(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,3}))?$/i.exec(source)
      : null;
  if (!parts) return null;
  const fraction = parts[2] ?? '';
  const digits = BigInt(parts[1]! + fraction);
  if (digits === 0n) return '0';
  const shift = Number(parts[3] ?? 0) - fraction.length + USD_DECIMALS;
  if (shift > USD_DECIMALS + 16 || shift < -80) return null;
  const divisor = 10n ** BigInt(Math.max(0, -shift));
  if (digits % divisor !== 0n) return null;
  const value = formatUsd((digits / divisor) * 10n ** BigInt(Math.max(0, shift)));
  return usdPattern.test(value) ? value : null;
}

export function parseExactUsd(body: string, fields: ReadonlySet<string>): unknown {
  // Preserve the provider's decimal lexeme instead of rounding through a JS number.
  return JSON.parse(body, (key, value, context?: { source?: string }) =>
    fields.has(key) && value !== null
      ? typeof value === 'number'
        ? (exactUsd(context?.source) ?? undefined)
        : undefined
      : value,
  );
}

export function jsonObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasJsonError(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const errors: unknown[] = Array.isArray(value.error) ? value.error : [value.error];
  return errors.some((error) => {
    if (!error || typeof error !== 'object' || Array.isArray(error)) return false;
    const { code, message, msg } = error as Record<string, unknown>;
    return (
      (typeof code === 'number' && Number.isFinite(code)) ||
      [code, message, msg].some((field) => typeof field === 'string' && field.trim() !== '')
    );
  });
}

export class UsageParser {
  model: string | null = null;
  input: number | null = null;
  output: number | null = null;
  cached: number | null = null;
  total: number | null = null;
  reasoning: number | null = null;
  reportedCostUsd: string | undefined;
  complete = false;
  providerIncomplete = false;
  providerError = false;
  cacheCreationInputTokens: number | null = null;
  malformed = false;
  private buffer = '';
  private decoder = new TextDecoder();
  private genericBytes = 0;
  private readonly detectJsonError: boolean;
  private readonly openRouter: boolean;
  private readonly geminiCandidates = new Map<number, boolean>();
  readonly adapter: Adapter;
  readonly sse: boolean;
  constructor(adapter: Adapter, sse: boolean, detectJsonError = false, openRouter = false) {
    this.adapter = adapter;
    this.openRouter = openRouter;
    this.sse = sse;
    this.detectJsonError = adapter === 'generic' && !sse && detectJsonError;
  }
  private parse(body: string): unknown {
    return this.openRouter ? parseExactUsd(body, costField) : JSON.parse(body);
  }
  consume(payload: unknown): void {
    const value = jsonObject(payload);
    if (!value) return;
    const model = this.adapter === 'gemini' ? value.modelVersion : value.model;
    if (typeof model === 'string' && model.trim() && model.length <= 200) this.model = model;
    if (
      value.error ||
      value.type === 'error' ||
      value.type === 'response.failed' ||
      value.type === 'response.incomplete'
    )
      this.malformed = true;
    if (this.adapter === 'gemini') {
      if (this.sse && Array.isArray(value.candidates)) {
        value.candidates.forEach((raw: unknown, position) => {
          const candidate = jsonObject(raw);
          if (!candidate) return;
          const index = token(candidate.index) ? candidate.index : position;
          if (index > 255) {
            this.malformed = true;
            return;
          }
          const reason = candidate.finishReason;
          const finished =
            typeof reason === 'string' && !!reason && reason !== 'FINISH_REASON_UNSPECIFIED';
          this.geminiCandidates.set(index, finished || this.geminiCandidates.get(index) === true);
        });
        this.complete =
          this.geminiCandidates.size > 0 && [...this.geminiCandidates.values()].every(Boolean);
      }
      const u = jsonObject(value.usageMetadata);
      if (u) {
        for (const [key, report] of [
          ['input', u.promptTokenCount],
          ['output', u.candidatesTokenCount],
          ['total', u.totalTokenCount],
          ['cached', u.cachedContentTokenCount],
          ['reasoning', u.thoughtsTokenCount],
        ] as const) {
          if (token(report)) this[key] = report;
          else if (report !== undefined) this.malformed = true;
        }
      }
      return;
    }
    if (value.type === 'response.completed') {
      this.complete = true;
      this.consume(value.response);
    }
    if (value.type === 'message_start') this.consume(value.message);
    if (value.type === 'message_stop') this.complete = true;
    if (
      this.adapter === 'openai' &&
      (value.object === 'response' ||
        (typeof value.id === 'string' && value.id.startsWith('resp_'))) &&
      value.status !== 'completed'
    )
      this.providerIncomplete = true;
    const u = jsonObject(value.usage);
    if (!u || this.adapter === 'generic') return;
    const input = u.prompt_tokens ?? u.input_tokens;
    const output = u.completion_tokens ?? u.output_tokens;
    if (token(u.total_tokens)) this.total = u.total_tokens;
    const reasoning =
      jsonObject(u.completion_tokens_details)?.reasoning_tokens ??
      jsonObject(u.output_tokens_details)?.reasoning_tokens;
    if (token(reasoning)) this.reasoning = reasoning;
    if (this.openRouter && typeof u.cost === 'string' && usdPattern.test(u.cost))
      this.reportedCostUsd = u.cost;
    const cached =
      jsonObject(u.prompt_tokens_details)?.cached_tokens ??
      jsonObject(u.input_tokens_details)?.cached_tokens ??
      u.cache_read_input_tokens;
    if (input !== undefined) {
      if (token(input)) this.input = input;
      else this.malformed = true;
    }
    if (output !== undefined) {
      if (token(output)) this.output = output;
      else this.malformed = true;
    }
    if (cached !== undefined) {
      if (token(cached)) this.cached = cached;
      else this.malformed = true;
    }
    // Anthropic reports non-cached input and cache reads separately.
    if (this.adapter === 'anthropic' && token(input) && (cached === undefined || token(cached))) {
      const created = u.cache_creation_input_tokens ?? 0;
      if (token(created)) {
        this.cacheCreationInputTokens = created;
        this.input = input + (cached ?? 0) + created;
      } else this.malformed = true;
    }
  }
  push(chunk: Buffer): void {
    if (this.adapter === 'generic') {
      if (!this.detectJsonError || this.genericBytes > MAX_GENERIC_JSON_BYTES) return;
      this.genericBytes += chunk.byteLength;
      if (this.genericBytes > MAX_GENERIC_JSON_BYTES) this.buffer = '';
      else this.buffer += this.decoder.decode(chunk, { stream: true });
      return;
    }
    this.buffer += this.decoder.decode(chunk, {
      stream: true,
    });
    if (!this.sse) {
      if (Buffer.byteLength(this.buffer) > 2 * 1024 * 1024) {
        this.buffer = '';
        this.malformed = true;
      }
      return;
    }
    this.buffer = this.buffer.replace(/\r\n/g, '\n');
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) !== -1) {
      const event = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      if (Buffer.byteLength(event) > 128 * 1024) {
        this.malformed = true;
        continue;
      }
      const payload = event
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!payload) continue;
      if (payload === '[DONE]') {
        if (this.adapter !== 'gemini') this.complete = true;
        continue;
      }
      try {
        this.consume(this.parse(payload));
      } catch {
        this.malformed = true;
      }
    }
    if (Buffer.byteLength(this.buffer) > 128 * 1024) {
      this.buffer = '';
      this.malformed = true;
    }
  }
  finish(): void {
    if (this.adapter === 'generic') {
      this.complete = true;
      if (this.detectJsonError && this.buffer) {
        try {
          this.providerError = hasJsonError(JSON.parse(this.buffer + this.decoder.decode()));
        } catch {
          // Unrecognized bodies keep the HTTP-based outcome.
        } finally {
          this.buffer = '';
        }
      }
      return;
    }
    this.buffer += this.decoder.decode();
    if (!this.sse) {
      try {
        this.consume(this.parse(this.buffer));
        this.complete = true;
      } catch {
        this.malformed = true;
      }
    } else if (this.buffer.trim()) this.malformed = true;
    if (this.input !== null && this.cached !== null && this.cached > this.input)
      this.malformed = true;
  }
  get known(): boolean {
    return (
      this.adapter !== 'generic' &&
      this.complete &&
      !this.malformed &&
      this.input !== null &&
      this.output !== null
    );
  }
}
export const SCALE = 1000000000n;
export function units(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * SCALE + BigInt(fraction.padEnd(9, '0'));
}
export function exactMicros(total: bigint): string {
  return `${total / SCALE}.${(total % SCALE).toString().padStart(9, '0')}`;
}
export function roundedMicros(total: bigint): number | null {
  const rounded = (total + SCALE / 2n) / SCALE;
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}
export function storedCostUnits(row: {
  costExactMicros?: string | null;
  costMicros: number | null;
}): bigint | null {
  if (typeof row.costExactMicros === 'string' && /^\d+\.\d{1,9}$/.test(row.costExactMicros))
    return units(row.costExactMicros);
  if (Number.isSafeInteger(row.costMicros) && row.costMicros! >= 0)
    return BigInt(row.costMicros!) * SCALE;
  return null;
}
export function priceCost(
  price: ModelPrice,
  input: number,
  output: number,
  cached: number,
): {
  costMicros: number | null;
  costExactMicros: string;
} {
  const total =
    BigInt(input - cached) * units(price.inputPerMillion) +
    BigInt(output) * units(price.outputPerMillion) +
    BigInt(cached) * units(price.cachedInputPerMillion);
  return {
    costMicros: roundedMicros(total),
    costExactMicros: exactMicros(total),
  };
}
