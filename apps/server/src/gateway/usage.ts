import type { Adapter, ModelPrice } from '@keydesk/contracts';
const token = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1e12;
export class UsageParser {
  model: string | null = null;
  input: number | null = null;
  output: number | null = null;
  cached: number | null = null;
  complete = false;
  providerIncomplete = false;
  cacheCreationInputTokens: number | null = null;
  malformed = false;
  private buffer = '';
  private decoder = new TextDecoder();
  readonly adapter: Adapter;
  readonly sse: boolean;
  constructor(adapter: Adapter, sse: boolean) {
    this.adapter = adapter;
    this.sse = sse;
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
    if (this.adapter === 'generic') return;
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
