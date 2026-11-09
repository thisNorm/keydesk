import type { FastifyInstance, FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import { HttpError } from './errors.ts';
export class MaintenanceCoordinator {
  private active = 0;
  private blocked = false;
  private waiters = new Set<() => void>();
  private readonly timeoutMs: number;
  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
  }
  enter() {
    if (this.blocked)
      throw new HttpError(503, '복원 중에는 변경과 게이트웨이 호출을 잠시 사용할 수 없습니다.');
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      if (this.active === 0) {
        for (const resolve of this.waiters) resolve();
        this.waiters.clear();
      }
    };
  }
  async background(work: () => Promise<void>) {
    if (this.blocked) return;
    const release = this.enter();
    try {
      await work();
    } finally {
      release();
    }
  }
  private idle() {
    return this.active === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => this.waiters.add(resolve));
  }
  async exclusive(waitGateway: () => Promise<void>) {
    if (this.blocked) throw new HttpError(409, '이미 복원 작업이 진행 중입니다.');
    this.blocked = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await this.idle();
          await waitGateway();
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new HttpError(
                  503,
                  '진행 중인 작업이 끝나지 않아 복원을 취소했습니다. 잠시 후 다시 시도해 주세요.',
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.blocked = false;
        }
      };
    } catch (error) {
      this.blocked = false;
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
function tracked(path: string, method: string) {
  return (
    path.startsWith('/gw/') ||
    (path.startsWith('/api/') &&
      path !== '/api/backups/restore' &&
      !(
        ['/api/auth/state', '/api/status'].includes(path) &&
        ['GET', 'HEAD', 'OPTIONS'].includes(method)
      ))
  );
}
export function installMaintenance(app: FastifyInstance) {
  const coordinator = new MaintenanceCoordinator();
  type Lease = { active: boolean; owned: boolean; release: () => void };
  const leases = new WeakMap<FastifyRequest, Lease>();
  const acquire = () => {
    const finish = coordinator.enter();
    const lease: Lease = {
      active: true,
      owned: false,
      release: () => {
        if (lease.active) {
          lease.active = false;
          finish();
        }
      },
    };
    return lease;
  };
  app.addHook('onRequest', async (request, reply) => {
    if (!tracked(request.routeOptions.url || request.url.split('?')[0], request.method)) return;
    const lease = acquire();
    leases.set(request, lease);
    const early = () => {
      if (!lease.owned) lease.release();
    };
    reply.raw.once('close', early);
    reply.raw.once('finish', early);
    request.raw.once('aborted', early);
  });
  const early = (request: FastifyRequest) => {
    const lease = leases.get(request);
    if (lease && !lease.owned) lease.release();
  };
  app.addHook('onError', async (request) => {
    early(request);
  });
  app.addHook('onResponse', async (request) => {
    early(request);
  });
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (!methods.some((method) => tracked(route.url, method))) return;
    const original = route.handler as RouteHandlerMethod;
    route.handler = async function (request: FastifyRequest, reply: FastifyReply) {
      let lease = leases.get(request);
      if (!lease?.active) {
        lease = acquire();
        leases.set(request, lease);
      }
      lease.owned = true;
      try {
        return await original.call(this, request, reply);
      } finally {
        lease.release();
      }
    };
  });
  return coordinator;
}
