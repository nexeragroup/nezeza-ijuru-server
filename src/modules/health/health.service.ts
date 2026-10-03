import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RedisService } from '../../common/services/redis.service';
import { SessionMiddleware } from '../../common/middleware/session.middleware';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private shuttingDown = false;
  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly sessions: SessionMiddleware,
  ) {}
  live() {
    return {
      status: this.shuttingDown ? 'shutting_down' : 'ok',
      timestamp: new Date().toISOString(),
    };
  }
  async ready() {
    if (this.shuttingDown)
      return {
        status: 'not_ready',
        checks: { shutdown: false },
        timestamp: new Date().toISOString(),
      };
    const checks: Record<string, boolean> = {
      database: false,
      sessionRedis: this.sessions.isReady(),
      rateLimitRedis: await this.redis.ping('cache'),
    };
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 1_000),
        ),
      ]);
      checks.database = true;
    } catch {
      /* readiness remains false */
    }
    if (this.config.get<boolean>('queue.enabled', true))
      checks.queueRedis = await this.redis.ping('queue');
    return {
      status: Object.values(checks).every(Boolean) ? 'ok' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
  onModuleDestroy() {
    this.shuttingDown = true;
  }
}
