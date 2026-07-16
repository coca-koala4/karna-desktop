import Fastify from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import logger from './logger.js';
import { RedisClient } from './redis-client.js';
import { RateLimiter } from './rate-limiter.js';
import { RelayServer } from './relay-server.js';
import { MAX_ENVELOPE_SIZE } from './envelope-validator.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.KARNA_RELAY_PUBLIC_URL || `ws://localhost:${PORT}`;
const REDIS_URL = process.env.KARNA_RELAY_REDIS_URL || 'redis://localhost:6379';
const ENVELOPE_TTL_HOURS = parseInt(process.env.KARNA_RELAY_ENVELOPE_TTL || '24', 10);
const ENVELOPE_TTL_SECONDS = ENVELOPE_TTL_HOURS * 60 * 60;
const RATE_LIMIT_CONFIG = RateLimiter.parseConfig(process.env.KARNA_RELAY_RATE_LIMIT);
const TLS_MODE = process.env.KARNA_RELAY_TLS_MODE || 'off';
const CORS_ORIGINS = (process.env.KARNA_RELAY_CORS_ORIGINS || '*').split(',').map(o => o.trim());

async function main() {
  logger.info({
    publicUrl: PUBLIC_URL,
    redisUrl: REDIS_URL.replace(/:\/\/.*@/, '://***@'),
    envelopeTtlHours: ENVELOPE_TTL_HOURS,
    rateLimit: RATE_LIMIT_CONFIG,
    tlsMode: TLS_MODE,
    corsOrigins: CORS_ORIGINS,
  }, 'Starting Karna Relay Service');

  const redis = new RedisClient(REDIS_URL);

  const redisOk = await redis.ping();
  if (!redisOk) {
    logger.error('Failed to connect to Redis');
    process.exit(1);
  }
  logger.info('Redis connection established');

  const fastify = Fastify({
    logger: false,
    trustProxy: true,
  });

  await fastify.register(fastifyCors, {
    origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  });

  await fastify.register(fastifyWebSocket, {
    options: {
      maxPayload: MAX_ENVELOPE_SIZE,
      perMessageDeflate: false,
    },
  });

  const rateLimiter = new RateLimiter(redis, RATE_LIMIT_CONFIG);
  const relayServer = new RelayServer(fastify, redis, rateLimiter, ENVELOPE_TTL_SECONDS);

  fastify.get('/health', async () => {
    const redisHealthy = await redis.ping();
    return {
      status: redisHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      redis: redisHealthy ? 'connected' : 'disconnected',
    };
  });

  await relayServer.registerRoutes();
  relayServer.startHeartbeat();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    relayServer.stopHeartbeat();
    await relayServer.shutdown();
    await fastify.close();
    await redis.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await fastify.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT, host: HOST }, 'Relay service listening');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Failed to start server');
    await redis.close();
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.stack : String(err) }, 'Fatal error');
  process.exit(1);
});
