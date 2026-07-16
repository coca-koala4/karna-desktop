import Redis from 'ioredis';
import logger from './logger.js';
import type { EncryptedRelayEnvelopeV1 } from './envelope-validator.js';

const KEY_PREFIX = 'karna:relay:';
const ONLINE_KEY = `${KEY_PREFIX}online:`;
const QUEUE_KEY = `${KEY_PREFIX}queue:`;
const NONCE_KEY = `${KEY_PREFIX}nonce:`;
const RATE_LIMIT_KEY = `${KEY_PREFIX}ratelimit:`;

export class RedisClient {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('error', (err) => {
      logger.error({ err: err.message }, 'Redis client error');
    });
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async setOnline(routingId: string, ttlSeconds: number): Promise<void> {
    const key = `${ONLINE_KEY}${routingId}`;
    await this.client.set(key, '1', 'EX', ttlSeconds);
  }

  async setOffline(routingId: string): Promise<void> {
    const key = `${ONLINE_KEY}${routingId}`;
    await this.client.del(key);
  }

  async isOnline(routingId: string): Promise<boolean> {
    const key = `${ONLINE_KEY}${routingId}`;
    const result = await this.client.exists(key);
    return result === 1;
  }

  async enqueueOfflineEnvelope(targetRoutingId: string, envelope: EncryptedRelayEnvelopeV1, ttlSeconds: number): Promise<void> {
    const key = `${QUEUE_KEY}${targetRoutingId}`;
    const serialized = JSON.stringify(envelope);
    const pipe = this.client.pipeline();
    pipe.lpush(key, serialized);
    pipe.expire(key, ttlSeconds);
    await pipe.exec();
  }

  async dequeueOfflineEnvelopes(routingId: string): Promise<EncryptedRelayEnvelopeV1[]> {
    const key = `${QUEUE_KEY}${routingId}`;
    const items = await this.client.lrange(key, 0, -1);
    await this.client.del(key);
    return items.map((item) => JSON.parse(item) as EncryptedRelayEnvelopeV1);
  }

  async checkAndSetNonce(nonce: string, ttlSeconds: number): Promise<boolean> {
    const key = `${NONCE_KEY}${nonce}`;
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async incrementRateLimit(routingId: string, windowSeconds: number): Promise<number> {
    const key = `${RATE_LIMIT_KEY}${routingId}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    const pipe = this.client.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
    pipe.zcard(key);
    pipe.expire(key, windowSeconds + 60);
    const results = await pipe.exec();

    if (!results) return 0;
    const countResult = results[2];
    return (countResult?.[1] as number) || 0;
  }

  async getQueueLength(routingId: string): Promise<number> {
    const key = `${QUEUE_KEY}${routingId}`;
    return this.client.llen(key);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
