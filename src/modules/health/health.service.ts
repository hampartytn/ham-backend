import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheckService,
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service';

export type LivenessResponse = {
  status: 'ok';
};

export type ReadinessResponse = {
  status: 'ok' | 'error';
  checks: {
    database: 'up' | 'down';
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  liveness(): LivenessResponse {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessResponse> {
    try {
      await this.healthCheckService.check([() => this.databaseIndicator()]);
      return {
        status: 'ok',
        checks: { database: 'up' },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'down' },
      });
    }
  }

  private async databaseIndicator(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('database');
    const isUp = await this.prisma.ping();
    if (!isUp) {
      return indicator.down();
    }
    return indicator.up();
  }
}
