import { bad } from './validation.ts';
export interface GatewayLimits {
  ipRequestsPerMinute: number;
  clientRequestsPerMinute: number;
  globalRequestsPerMinute: number;
  clientInFlight: number;
  globalInFlight: number;
  maxBuckets: number;
}
export const DEFAULT_LIMITS: GatewayLimits = Object.freeze({
  ipRequestsPerMinute: 240,
  clientRequestsPerMinute: 120,
  globalRequestsPerMinute: 2400,
  clientInFlight: 8,
  globalInFlight: 64,
  maxBuckets: 1024,
});
interface Bucket {
  starts: number;
  requests: number;
  inFlight: number;
}
export class GatewayAdmission {
  private readonly ips = new Map<string, Bucket>();
  private readonly clients = new Map<string, Bucket>();
  private global: Bucket = {
    starts: 0,
    requests: 0,
    inFlight: 0,
  };
  private inFlight = 0;
  private readonly idleWaiters = new Set<() => void>();
  waitForIdle(): Promise<void> {
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }
  readonly limits: GatewayLimits;
  private now: () => number;
  constructor(now: () => number, overrides: Partial<GatewayLimits> = {}) {
    this.now = now;
    this.limits = {
      ...DEFAULT_LIMITS,
      ...overrides,
    };
    for (const value of Object.values(this.limits))
      if (!Number.isInteger(value) || value < 1 || value > 100000)
        throw new Error('게이트웨이 속도 제한 설정이 올바르지 않습니다.');
  }
  private take(map: Map<string, Bucket>, key: string, limit: number): Bucket {
    const now = this.now();
    let bucket = map.get(key);
    if (!bucket) {
      if (map.size >= this.limits.maxBuckets)
        for (const [id, old] of map)
          if (now - old.starts >= 60000 && old.inFlight === 0) map.delete(id);
      if (map.size >= this.limits.maxBuckets)
        bad('게이트웨이 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
      bucket = {
        starts: now,
        requests: 0,
        inFlight: 0,
      };
      map.set(key, bucket);
    }
    if (now - bucket.starts >= 60000) {
      bucket.starts = now;
      bucket.requests = 0;
    }
    if (bucket.requests >= limit) bad('게이트웨이 분당 요청 제한에 도달했습니다.', 429);
    bucket.requests++;
    return bucket;
  }
  acquireIp(ip: string): () => void {
    const now = this.now();
    if (now - this.global.starts >= 60000)
      this.global = {
        starts: now,
        requests: 0,
        inFlight: 0,
      };
    if (
      this.global.requests >= this.limits.globalRequestsPerMinute ||
      this.inFlight >= this.limits.globalInFlight
    )
      bad('게이트웨이 동시 요청 제한에 도달했습니다.', 429);
    const bucket = this.take(this.ips, ip, this.limits.ipRequestsPerMinute);
    this.global.requests++;
    this.inFlight++;
    bucket.inFlight++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.inFlight--;
        bucket.inFlight--;
        if (this.inFlight === 0) {
          for (const resolve of this.idleWaiters) resolve();
          this.idleWaiters.clear();
        }
      }
    };
  }
  acquireClient(id: string): () => void {
    const bucket = this.take(this.clients, id, this.limits.clientRequestsPerMinute);
    if (bucket.inFlight >= this.limits.clientInFlight)
      bad('클라이언트 동시 요청 제한에 도달했습니다.', 429);
    bucket.inFlight++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        bucket.inFlight--;
      }
    };
  }
}
