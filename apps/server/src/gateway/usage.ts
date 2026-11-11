import type { Adapter, ModelPrice } from '@keydesk/contracts';
const token = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1e12;
const MAX_GENERIC_JSON_BYTES = 64 * 1024;

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
  complete = false;
  providerIncomplete = false;
  providerError = false;
  cacheCreationInputTokens: number | null = null;
  malformed = false;
  private buffer = '';
  private decoder = new TextDecoder();
  private genericBytes = 0;
  private readonly detectJsonError: boolean;
  readonly adapter: Adapter;
  readonly sse: boolean;
  constructor(adapter: Adapter, sse: boolean, detectJsonError = false) {
    this.adapter = adapter;
    this.sse = sse;
    this.detectJsonError = adapter === 'generic' && !sse && detectJsonError;
  }
  consume(value: any): void {
    if (!value || typeof value !== 'object') return;
    if (typeof value.model === 'string' && value.model.length <= 200) this.model = value.model;
    if (
      value.error ||
      value.type === 'error' ||
      ['response.failed', 'response.incomplete'].includes(value.type)
    )
      this.malformed = true;
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
    const u = value.usage;
    if (!u || typeof u !== 'object' || this.adapter === 'generic') return;
    const input = u.prompt_tokens ?? u.input_tokens;
    const output = u.completion_tokens ?? u.output_tokens;
    const cached =
      u.prompt_tokens_details?.cached_tokens ??
      u.input_tokens_details?.cached_tokens ??
      u.cache_read_input_tokens ??
      0;
    if (input !== undefined) {
      if (token(input)) this.input = input;
      else this.malformed = true;
    }
    if (output !== undefined) {
      if (token(output)) this.output = output;
      else this.malformed = true;
    }
    if (
      input !== undefined ||
      u.cache_read_input_tokens !== undefined ||
      u.prompt_tokens_details !== undefined ||
      u.input_tokens_details !== undefined
    ) {
      if (token(cached)) this.cached = cached;
      else this.malformed = true;
    }
    // Anthropic reports non-cached input and cache reads separately.
    if (this.adapter === 'anthropic' && token(input) && token(cached)) {
      const created = u.cache_creation_input_tokens ?? 0;
      if (token(created)) {
        this.cacheCreationInputTokens = created;
        this.input = input + cached + created;
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
        this.complete = true;
        continue;
      }
      try {
        this.consume(JSON.parse(payload));
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
        this.consume(JSON.parse(this.buffer));
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
