import { RedisClient } from './redis-client.js';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  private redis: RedisClient;
  private config: RateLimitConfig;

  constructor(redis: RedisClient, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  async check(routingId: string): Promise<RateLimitResult> {
    const now = Date.now();
    const resetAt = now + this.config.windowSeconds * 1000;
    const currentCount = await this.redis.incrementRateLimit(routingId, this.config.windowSeconds);
    const allowed = currentCount <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - currentCount);

    return { allowed, currentCount, remaining, resetAt };
  }

  static parseConfig(envValue?: string): RateLimitConfig {
    const DEFAULT_CONFIG: RateLimitConfig = {
      maxRequests: 60,
      windowSeconds: 60,
    };

    if (!envValue) {
      return DEFAULT_CONFIG;
    }

    try {
      const parts = envValue.split(':');
      if (parts.length === 2) {
        const maxRequests = parseInt(parts[0], 10);
        const windowSeconds = parseInt(parts[1], 10);
        if (maxRequests > 0 && windowSeconds > 0) {
          return { maxRequests, windowSeconds };
        }
      }
    } catch {
      // fall through to default
    }

    return DEFAULT_CONFIG;
  }
}
