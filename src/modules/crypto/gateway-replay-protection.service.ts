import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { RedisService } from '../../common/services/redis.service';

const REPLAY_RETENTION_GRACE_SECONDS = 30;
const CONSUME_REPLAY_SCRIPT = `
  if redis.call('GET', KEYS[1]) then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

/**
 * Tracks outstanding Default-server to Default-gateway requests. The gateway
 * reserves incoming IDs; this companion reservation prevents a response from
 * being accepted more than once by any server instance.
 */
@Injectable()
export class GatewayReplayProtectionService {
  constructor(private readonly redis: RedisService) {}

  async reserveOutgoing(
    serverId: string,
    gatewayId: string,
    requestId: string,
    expiresAt: number,
  ): Promise<void> {
    const ttlSeconds = this.getTtlSeconds(expiresAt);
    const key = this.getKey(serverId, gatewayId, requestId);

    try {
      const result = await this.redis
        .getClient('cache')
        .set(key, '1', 'EX', ttlSeconds, 'NX');

      if (result !== 'OK') {
        throw new Error('The gateway request ID is already pending.');
      }
    } catch (error) {
      throw new Error('Gateway replay protection is unavailable.', {
        cause: error,
      });
    }
  }

  async consumeResponse(
    serverId: string,
    gatewayId: string,
    requestId: string,
  ): Promise<void> {
    const key = this.getKey(serverId, gatewayId, requestId);

    try {
      const result = await this.redis
        .getClient('cache')
        .eval(CONSUME_REPLAY_SCRIPT, 1, key);

      if (result !== 1) {
        throw new Error('The gateway response is expired or already consumed.');
      }
    } catch (error) {
      throw new Error('Gateway replay protection is unavailable.', {
        cause: error,
      });
    }
  }

  private getTtlSeconds(expiresAt: number): number {
    if (!Number.isSafeInteger(expiresAt)) {
      throw new TypeError('Gateway request expiry is invalid.');
    }

    const seconds =
      expiresAt -
      Math.floor(Date.now() / 1_000) +
      REPLAY_RETENTION_GRACE_SECONDS;

    if (seconds <= 0) {
      throw new RangeError('Gateway request expiry must be in the future.');
    }

    return seconds;
  }

  private getKey(
    serverId: string,
    gatewayId: string,
    requestId: string,
  ): string {
    const digest = createHash('sha256')
      .update(`${serverId}\u0000${gatewayId}\u0000${requestId}`, 'utf8')
      .digest('base64url');

    return `gateway-crypto:pending:${digest}`;
  }
}
