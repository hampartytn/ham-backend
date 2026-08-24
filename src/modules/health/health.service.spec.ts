import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = { ping: jest.fn() };
  const healthIndicator = {
    up: jest.fn((payload?: unknown) => ({
      database: { status: 'up', ...((payload as object) ?? {}) },
    })),
    down: jest.fn(() => ({ database: { status: 'down' } })),
  };

  const service = new HealthService(
    {
      check: async (indicators: Array<() => unknown>) => {
        const results = await Promise.all(
          indicators.map((indicator) => indicator()),
        );
        const down = results.some(
          (result) =>
            typeof result === 'object' &&
            result !== null &&
            'database' in result &&
            (result as { database: { status: string } }).database.status ===
              'down',
        );
        if (down) {
          throw new Error('unhealthy');
        }
        return { status: 'ok' };
      },
    } as never,
    { check: () => healthIndicator } as never,
    prisma as never,
  );

  it('returns a secret-free liveness payload', () => {
    expect(service.liveness()).toEqual({ status: 'ok' });
  });

  it('reports database up when ping succeeds', async () => {
    prisma.ping.mockResolvedValue(true);
    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('throws 503 when ping fails', async () => {
    prisma.ping.mockResolvedValue(false);
    await expect(service.readiness()).rejects.toMatchObject({
      status: 503,
      response: {
        status: 'error',
        checks: { database: 'down' },
      },
    });
  });
});
